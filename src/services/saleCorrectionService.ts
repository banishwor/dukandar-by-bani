import { db } from '../db/database';
import { saleRepository } from '../repositories/saleRepository';
import { saleReturnRepository } from '../repositories/saleReturnRepository';
import { financialAccountService } from './financialAccountService';
import type {
  SaleReturn,
  SaleReturnLine,
  SaleVoid,
  Refund,
  PaymentReversal,
  StockMovement,
  SyncMetadata,
  ReturnReason,
  SettlementMode,
  PaymentMethod,
  FinancialMovement,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency, subtractCurrency, addCurrency, isCurrencyGreaterThan } from '../utils/money';

export class CorrectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorrectionValidationError';
  }
}

export interface ReturnLineItemInput {
  originalSaleLineId: string;
  quantityToReturn: number;
}

export interface ProcessSaleReturnPayload {
  businessId: string;
  originalSaleId: string;
  returnDate?: string;
  reason?: ReturnReason;
  notes?: string;
  settlementMode: SettlementMode;
  refundPaymentMethod?: PaymentMethod;
  financialAccountId?: string; // Phase 5 Stage 2 integration
  lines: ReturnLineItemInput[];
}

export interface ProcessSaleVoidPayload {
  businessId: string;
  originalSaleId: string;
  reason?: string;
  notes?: string;
  voidDate?: string;
  settlementMode?: SettlementMode;
  refundPaymentMethod?: PaymentMethod;
  financialAccountId?: string; // Phase 5 Stage 2 integration
}

export interface ReturnableLineMeta {
  originalSaleLineId: string;
  itemId: string;
  itemNameSnapshot: string;
  unit: string;
  originalQuantity: number;
  alreadyReturnedQuantity: number;
  returnableQuantity: number;
  rate: number;
  discountAmount: number;
  effectiveUnitRate: number;
  trackInventory: boolean;
}

export interface ProcessPaymentReversalPayload {
  businessId: string;
  paymentId?: string;
  originalPaymentId?: string;
  customerId?: string;
  reason?: string;
  notes?: string;
  reversalDate?: string;
  financialAccountId?: string; // Phase 5 Stage 2 integration
}

export const saleCorrectionService = {
  /**
   * Calculates allowable return quantities and item details for a given sale.
   */
  async getSaleReturnableLines(saleId: string): Promise<ReturnableLineMeta[]> {
    const sale = await db.sales.get(saleId);
    if (!sale || sale.isDeleted) {
      throw new CorrectionValidationError('Sale not found or has been deleted.');
    }

    const voidRecord = await saleReturnRepository.getSaleVoid(saleId);
    if (voidRecord) {
      throw new CorrectionValidationError(`Invoice #${sale.invoiceNumber} has been voided and cannot be returned.`);
    }

    const saleLines = await db.saleLines.where('saleId').equals(saleId).toArray();
    const existingReturnLines = await saleReturnRepository.getReturnLinesBySale(saleId);

    // Group already returned quantities by originalSaleLineId
    const returnedQtyMap = new Map<string, number>();
    for (const retLine of existingReturnLines) {
      const current = returnedQtyMap.get(retLine.originalSaleLineId) || 0;
      returnedQtyMap.set(retLine.originalSaleLineId, current + retLine.quantity);
    }

    const overallRatio =
      sale && sale.subtotal > 0
        ? Math.min(1, Math.max(0, sale.totalAmount / sale.subtotal))
        : 1;

    return saleLines.map((line) => {
      const alreadyReturned = returnedQtyMap.get(line.id) || 0;
      const returnable = Math.max(0, line.quantity - alreadyReturned);
      const effectiveUnitRate =
        line.quantity > 0
          ? roundCurrency((line.lineTotal * overallRatio) / line.quantity)
          : line.rate;

      return {
        originalSaleLineId: line.id,
        itemId: line.itemId,
        itemNameSnapshot: line.itemNameSnapshot,
        unit: line.unit,
        originalQuantity: line.quantity,
        alreadyReturnedQuantity: alreadyReturned,
        returnableQuantity: returnable,
        rate: line.rate,
        discountAmount: line.discountAmount || 0,
        effectiveUnitRate,
        trackInventory: true, // Will check against item master if needed
      };
    });
  },

  /**
   * Processes a Sale Return atomically.
   */
  async processSaleReturn(payload: ProcessSaleReturnPayload): Promise<{
    saleReturn: SaleReturn;
    lines: SaleReturnLine[];
    stockMovements: StockMovement[];
    refund?: Refund;
    movement?: FinancialMovement;
  }> {
    const {
      businessId,
      originalSaleId,
      returnDate = new Date().toISOString(),
      reason,
      notes,
      settlementMode,
      refundPaymentMethod = 'CASH',
      lines,
    } = payload;

    // 1. Validate Sale
    const sale = await db.sales.get(originalSaleId);
    if (!sale || sale.isDeleted) {
      throw new CorrectionValidationError('Original sale not found or has been deleted.');
    }

    const isVoided = await saleReturnRepository.getSaleVoid(originalSaleId);
    if (isVoided) {
      throw new CorrectionValidationError(`Invoice #${sale.invoiceNumber} has already been voided.`);
    }

    // 2. Validate Lines
    if (!lines || lines.length === 0) {
      throw new CorrectionValidationError('Please specify at least one line item to return.');
    }

    const returnableLines: ReturnableLineMeta[] = await this.getSaleReturnableLines(originalSaleId);
    const returnableMap = new Map<string, ReturnableLineMeta>(
      returnableLines.map((l) => [l.originalSaleLineId, l])
    );

    const plannedReturnLines: SaleReturnLine[] = [];
    const stockMovements: StockMovement[] = [];
    let totalReturnAmount = 0;

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const returnId = generateUniqueId('RET');
    const returnNumber = await saleReturnRepository.getNextReturnNumber(businessId, sale.invoiceNumber);

    for (const inputLine of lines) {
      const returnQty = Number(inputLine.quantityToReturn);
      if (returnQty <= 0) continue;

      const lineMeta = returnableMap.get(inputLine.originalSaleLineId);
      if (!lineMeta) {
        throw new CorrectionValidationError(`Invalid line item ID ${inputLine.originalSaleLineId}.`);
      }

      if (returnQty > lineMeta.returnableQuantity + 0.0001) {
        throw new CorrectionValidationError(
          `Cannot return ${returnQty} units of ${lineMeta.itemNameSnapshot}. Maximum returnable is ${lineMeta.returnableQuantity}.`
        );
      }

      // Calculate line total proportionally
      const lineReturnTotal = roundCurrency(returnQty * lineMeta.effectiveUnitRate);
      totalReturnAmount = roundCurrency(totalReturnAmount + lineReturnTotal);

      const retLineId = generateUniqueId('RETLINE');
      const retLine: SaleReturnLine = {
        id: retLineId,
        businessId,
        saleReturnId: returnId,
        originalSaleId,
        originalSaleLineId: lineMeta.originalSaleLineId,
        itemId: lineMeta.itemId,
        itemNameSnapshot: lineMeta.itemNameSnapshot,
        quantity: returnQty,
        unit: lineMeta.unit,
        rate: lineMeta.rate,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: lineReturnTotal,
        trackInventory: lineMeta.trackInventory,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };
      plannedReturnLines.push(retLine);

      // Stock Movement (Restoring inventory)
      const smId = generateUniqueId('STK');
      stockMovements.push({
        id: smId,
        businessId,
        itemId: lineMeta.itemId,
        type: 'SALE_RETURN',
        quantityChange: returnQty, // Positive increment!
        reason: `Return ${returnNumber} for Invoice #${sale.invoiceNumber}`,
        referenceId: returnId,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
      });
    }

    if (plannedReturnLines.length === 0) {
      throw new CorrectionValidationError('No valid item quantities specified for return.');
    }

    // 3. Financial Settlement
    let refundRecord: Refund | undefined;
    let refundMovement: FinancialMovement | undefined;
    let actualRefundAmount = 0;

    if (settlementMode === 'REFUND_NOW') {
      actualRefundAmount = totalReturnAmount;
      const account = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);
      const refundId = generateUniqueId('REFUND');
      refundRecord = {
        id: refundId,
        businessId,
        customerId: sale.customerId,
        saleReturnId: returnId,
        amount: actualRefundAmount,
        refundDate: returnDate,
        paymentMethod: refundPaymentMethod,
        notes: `Refund for Return ${returnNumber}`,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };

      refundMovement = {
        id: generateUniqueId('MOV'),
        businessId,
        accountId: account.id,
        type: 'REFUND_TO_CUSTOMER',
        direction: 'OUT',
        amount: actualRefundAmount,
        movementDate: returnDate,
        referenceType: 'REFUND',
        referenceId: refundId,
        description: `Refund to customer for Return #${returnNumber} (${refundPaymentMethod})`,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };
    }

    // 4. Construct SaleReturn record
    const saleReturnRecord: SaleReturn = {
      id: returnId,
      businessId,
      originalSaleId,
      customerId: sale.customerId,
      returnNumber,
      returnDate,
      totalAmount: totalReturnAmount,
      reason,
      notes: notes?.trim() || undefined,
      settlementMode,
      refundAmount: actualRefundAmount > 0 ? actualRefundAmount : undefined,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // 5. Sync Metadata
    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: saleReturnRecord.id,
        recordType: 'saleReturn',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      ...plannedReturnLines.map((l) => ({
        id: generateUniqueId('SYNC'),
        recordId: l.id,
        recordType: 'saleReturnLine' as const,
        syncState: 'LOCAL_ONLY' as const,
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      })),
      ...stockMovements.map((m) => ({
        id: generateUniqueId('SYNC'),
        recordId: m.id,
        recordType: 'stockMovement' as const,
        syncState: 'LOCAL_ONLY' as const,
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      })),
    ];

    if (refundRecord) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: refundRecord.id,
        recordType: 'refund',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    }

    if (refundMovement) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: refundMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    }

    // 6. Execute Atomic Transaction in Dexie
    await db.transaction(
      'rw',
      [
        db.saleReturns,
        db.saleReturnLines,
        db.stockMovements,
        db.refunds,
        db.financialMovements,
        db.syncMetadata,
      ],
      async () => {
        await db.saleReturns.add(saleReturnRecord);
        await db.saleReturnLines.bulkAdd(plannedReturnLines);
        await db.stockMovements.bulkAdd(stockMovements);
        if (refundRecord) {
          await db.refunds.add(refundRecord);
        }
        if (refundMovement) {
          await db.financialMovements.add(refundMovement);
        }
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );

    return {
      saleReturn: saleReturnRecord,
      lines: plannedReturnLines,
      stockMovements,
      refund: refundRecord,
      movement: refundMovement,
    };
  },

  /**
   * Processes a Sale Void (cancellation of the invoice) atomically.
   */
  async processSaleVoid(payload: ProcessSaleVoidPayload): Promise<{
    saleVoid: SaleVoid;
    stockMovements: StockMovement[];
    refund?: Refund;
    movement?: FinancialMovement;
  }> {
    const {
      businessId,
      originalSaleId,
      reason,
      notes,
      voidDate = new Date().toISOString(),
      settlementMode = 'CUSTOMER_CREDIT',
      refundPaymentMethod = 'CASH',
    } = payload;

    // 1. Validate Sale
    const sale = await db.sales.get(originalSaleId);
    if (!sale || sale.isDeleted) {
      throw new CorrectionValidationError('Original sale not found or has been deleted.');
    }

    const existingVoid = await saleReturnRepository.getSaleVoid(originalSaleId);
    if (existingVoid) {
      throw new CorrectionValidationError(`Invoice #${sale.invoiceNumber} is already voided.`);
    }

    // 2. Fetch remaining unreturned items to restore stock
    const returnableLines = await this.getSaleReturnableLines(originalSaleId);
    const stockMovements: StockMovement[] = [];
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const voidId = generateUniqueId('VOID');

    for (const line of returnableLines) {
      if (line.returnableQuantity > 0) {
        stockMovements.push({
          id: generateUniqueId('STK'),
          businessId,
          itemId: line.itemId,
          type: 'SALE_RETURN',
          quantityChange: line.returnableQuantity, // Restore all unreturned inventory
          reason: `Void Invoice #${sale.invoiceNumber}`,
          referenceId: voidId,
          createdAt: now,
          createdByDeviceId: deviceId,
          version: 1,
        });
      }
    }

    // 3. Determine if any refund is needed
    // Calculate total net paid on this sale
    const allocations = await db.paymentAllocations
      .where('saleId')
      .equals(originalSaleId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const existingRefunds = await saleReturnRepository.getRefundsBySale(originalSaleId);
    const totalAllocated = allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const totalRefundedAlready = existingRefunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const netPaidOnSale = roundCurrency(Math.max(0, totalAllocated - totalRefundedAlready));

    let refundRecord: Refund | undefined;
    let refundMovement: FinancialMovement | undefined;
    let actualRefundAmount = 0;

    if (settlementMode === 'REFUND_NOW' && netPaidOnSale > 0.005) {
      actualRefundAmount = netPaidOnSale;
      const account = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);
      refundRecord = {
        id: generateUniqueId('REFUND'),
        businessId,
        customerId: sale.customerId,
        saleVoidId: voidId,
        amount: actualRefundAmount,
        refundDate: voidDate,
        paymentMethod: refundPaymentMethod,
        notes: `Refund on Void for Invoice #${sale.invoiceNumber}`,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };

      refundMovement = {
        id: generateUniqueId('MOV'),
        businessId,
        accountId: account.id,
        type: 'REFUND_TO_CUSTOMER',
        direction: 'OUT',
        amount: actualRefundAmount,
        movementDate: voidDate,
        referenceType: 'REFUND',
        referenceId: refundRecord.id,
        description: `Refund on Void for Invoice #${sale.invoiceNumber} (${refundPaymentMethod})`,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };
    }

    // 4. Construct SaleVoid record
    const saleVoid: SaleVoid = {
      id: voidId,
      businessId,
      originalSaleId,
      customerId: sale.customerId,
      reason: reason || 'Sale Voided / Cancelled',
      voidDate,
      settlementMode,
      refundAmount: actualRefundAmount > 0 ? actualRefundAmount : undefined,
      notes: notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // 5. Sync Metadata
    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: saleVoid.id,
        recordType: 'saleVoid',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      ...stockMovements.map((m) => ({
        id: generateUniqueId('SYNC'),
        recordId: m.id,
        recordType: 'stockMovement' as const,
        syncState: 'LOCAL_ONLY' as const,
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      })),
    ];

    if (refundRecord) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: refundRecord.id,
        recordType: 'refund',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    }

    if (refundMovement) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: refundMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    }

    // 6. Execute Atomic Transaction in Dexie
    await db.transaction(
      'rw',
      [
        db.saleVoids,
        db.stockMovements,
        db.refunds,
        db.financialMovements,
        db.syncMetadata,
      ],
      async () => {
        await db.saleVoids.add(saleVoid);
        if (stockMovements.length > 0) {
          await db.stockMovements.bulkAdd(stockMovements);
        }
        if (refundRecord) {
          await db.refunds.add(refundRecord);
        }
        if (refundMovement) {
          await db.financialMovements.add(refundMovement);
        }
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );

    return {
      saleVoid,
      stockMovements,
      refund: refundRecord,
      movement: refundMovement,
    };
  },

  /**
   * Processes a Payment Reversal atomically.
   */
  async processPaymentReversal(payload: ProcessPaymentReversalPayload): Promise<{
    reversal: PaymentReversal;
    compensatingMovement?: FinancialMovement;
  }> {
    const {
      businessId,
      reason = 'Payment Reversal',
      notes,
      reversalDate = new Date().toISOString(),
    } = payload;
    const paymentId = payload.paymentId || payload.originalPaymentId;

    if (!paymentId) {
      throw new CorrectionValidationError('Payment ID is required for reversal.');
    }

    const payment = await db.payments.get(paymentId);
    if (!payment || payment.isDeleted) {
      throw new CorrectionValidationError('Payment not found or has been deleted.');
    }

    const existingReversal = await saleReturnRepository.getReversalForPayment(paymentId);
    if (existingReversal) {
      throw new CorrectionValidationError('This payment has already been reversed.');
    }

    // Check if original payment had an associated FinancialMovement
    const originalMovement = await db.financialMovements
      .where('referenceId')
      .equals(paymentId)
      .filter((m) => !m.isDeleted && m.type === 'CUSTOMER_PAYMENT')
      .first();

    let targetAccountId = originalMovement?.accountId;
    if (!targetAccountId) {
      const resolved = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);
      targetAccountId = resolved.id;
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const reversalId = generateUniqueId('REV');

    const reversal: PaymentReversal = {
      id: reversalId,
      businessId,
      originalPaymentId: paymentId,
      customerId: payment.partyId,
      amount: roundCurrency(Number(payment.amount) || 0),
      reason,
      reversalDate,
      notes: notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // Compensating FinancialMovement OUT
    const compensatingMovement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId,
      accountId: targetAccountId,
      type: 'CUSTOMER_PAYMENT_REVERSAL',
      direction: 'OUT',
      amount: reversal.amount,
      movementDate: reversalDate,
      referenceType: 'PAYMENT_REVERSAL',
      referenceId: reversal.id,
      description: `Reversal of customer payment #${paymentId}: ${reason}`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: reversal.id,
        recordType: 'paymentReversal',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      {
        id: generateUniqueId('SYNC'),
        recordId: compensatingMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
    ];

    await db.transaction('rw', [db.paymentReversals, db.financialMovements, db.syncMetadata], async () => {
      // Re-check inside transaction to guarantee idempotency
      const duplicateCheck = await db.paymentReversals
        .where('originalPaymentId')
        .equals(paymentId)
        .filter((r) => !r.isDeleted)
        .first();

      if (duplicateCheck) {
        throw new CorrectionValidationError('This payment has already been reversed.');
      }

      await db.paymentReversals.add(reversal);
      await db.financialMovements.add(compensatingMovement);
      await db.syncMetadata.bulkAdd(syncRecords);
    });

    return { reversal, compensatingMovement };
  },
};
