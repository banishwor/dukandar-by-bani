import { db } from '../db/database';
import { financialAccountService } from './financialAccountService';
import type {
  PurchaseReturn,
  PurchaseReturnLine,
  PurchaseVoid,
  RefundReceived,
  SupplierPaymentReversal,
  StockMovement,
  SyncMetadata,
  ReturnReason,
  SettlementMode,
  PaymentMethod,
  FinancialMovement,
} from '../types';
import { generateInvoiceNumber, generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency, subtractCurrency, addCurrency } from '../utils/money';

export class PurchaseCorrectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PurchaseCorrectionValidationError';
  }
}

export interface ReturnablePurchaseLineMeta {
  originalPurchaseLineId: string;
  itemId: string;
  itemNameSnapshot: string;
  unit: string;
  originalPurchasedQuantity: number;
  alreadyReturnedQuantity: number;
  returnableQuantity: number;
  effectiveUnitCost: number;
  discountAmount: number;
  taxAmount: number;
  trackInventory: boolean;
}

export interface ProcessPurchaseReturnPayload {
  businessId: string;
  originalPurchaseId: string;
  supplierId?: string;
  returnDate?: string;
  reason?: ReturnReason;
  notes?: string;
  settlementMode: SettlementMode;
  refundPaymentMethod?: PaymentMethod;
  financialAccountId?: string; // Phase 5 Stage 2 integration
  lines: Array<{
    originalPurchaseLineId: string;
    quantityToReturn: number;
  }>;
}

export interface ProcessPurchaseVoidPayload {
  businessId: string;
  originalPurchaseId: string;
  supplierId?: string;
  reason?: string;
  notes?: string;
  voidDate?: string;
  settlementMode?: SettlementMode;
  refundPaymentMethod?: PaymentMethod;
  financialAccountId?: string; // Phase 5 Stage 2 integration
}

export interface ProcessSupplierPaymentReversalPayload {
  businessId: string;
  paymentId?: string;
  originalPaymentId?: string;
  supplierId?: string;
  reason?: string;
  notes?: string;
  reversalDate?: string;
  financialAccountId?: string; // Phase 5 Stage 2 integration
}

export const purchaseCorrectionService = {
  /**
   * Calculates the remaining returnable quantity for each line in an original purchase.
   */
  async getPurchaseReturnableLines(originalPurchaseId: string): Promise<ReturnablePurchaseLineMeta[]> {
    const purchase = await db.purchases.get(originalPurchaseId);
    if (!purchase || purchase.isDeleted) {
      throw new PurchaseCorrectionValidationError(`Purchase #${originalPurchaseId} not found.`);
    }

    const lines = await db.purchaseLines
      .where('purchaseId')
      .equals(originalPurchaseId)
      .toArray();

    const previousReturnLines = await db.purchaseReturnLines
      .where('originalPurchaseId')
      .equals(originalPurchaseId)
      .filter((l) => !l.isDeleted)
      .toArray();

    const returnedQuantityMap = new Map<string, number>();
    for (const rLine of previousReturnLines) {
      const current = returnedQuantityMap.get(rLine.originalPurchaseLineId) || 0;
      returnedQuantityMap.set(rLine.originalPurchaseLineId, current + (Number(rLine.quantity) || 0));
    }

    const overallRatio =
      purchase && purchase.subtotal > 0
        ? Math.min(1, Math.max(0, purchase.totalAmount / purchase.subtotal))
        : 1;

    return lines.map((line) => {
      const alreadyReturned = returnedQuantityMap.get(line.id) || 0;
      const returnableQuantity = Math.max(0, line.quantity - alreadyReturned);
      const effectiveUnitCost =
        line.quantity > 0
          ? roundCurrency((line.lineTotal * overallRatio) / line.quantity)
          : line.unitCost;

      return {
        originalPurchaseLineId: line.id,
        itemId: line.itemId,
        itemNameSnapshot: line.itemNameSnapshot,
        unit: line.unit,
        originalPurchasedQuantity: line.quantity,
        alreadyReturnedQuantity: alreadyReturned,
        returnableQuantity,
        effectiveUnitCost,
        discountAmount: line.discountAmount,
        taxAmount: line.taxAmount,
        trackInventory: line.trackInventory,
      };
    });
  },

  async getNextPurchaseReturnNumber(businessId: string): Promise<string> {
    const allReturns = await db.purchaseReturns
      .where('businessId')
      .equals(businessId)
      .toArray();

    let maxNumber = 0;
    for (const r of allReturns) {
      if (r.returnNumber) {
        const match = r.returnNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    }
    const nextSeq = maxNumber + 1;
    return generateInvoiceNumber(nextSeq, 'PRET');
  },

  /**
   * Processes a purchase return atomically.
   */
  async processPurchaseReturn(payload: ProcessPurchaseReturnPayload): Promise<{
    purchaseReturn: PurchaseReturn;
    lines: PurchaseReturnLine[];
    stockMovements: StockMovement[];
    refundReceived?: RefundReceived;
    movement?: FinancialMovement;
  }> {
    const { businessId, originalPurchaseId, reason, notes, settlementMode = 'SUPPLIER_CREDIT' } = payload;
    const now = new Date().toISOString();
    const returnDate = payload.returnDate || now;
    const deviceId = getPersistentDeviceId();

    // 1. Verify original purchase exists and is not voided
    const purchase = await db.purchases.get(originalPurchaseId);
    if (!purchase || purchase.isDeleted) {
      throw new PurchaseCorrectionValidationError('Original purchase does not exist.');
    }

    const existingVoid = await db.purchaseVoids
      .where('originalPurchaseId')
      .equals(originalPurchaseId)
      .filter((v) => !v.isDeleted)
      .first();

    if (existingVoid) {
      throw new PurchaseCorrectionValidationError('Cannot return items on a voided purchase.');
    }

    if (!payload.lines || payload.lines.length === 0) {
      throw new PurchaseCorrectionValidationError('Please specify at least one line item to return.');
    }

    const returnableLines: ReturnablePurchaseLineMeta[] = await this.getPurchaseReturnableLines(originalPurchaseId);
    const returnableMap = new Map<string, ReturnablePurchaseLineMeta>(
      returnableLines.map((l) => [l.originalPurchaseLineId, l])
    );

    const plannedReturnLines: PurchaseReturnLine[] = [];
    const stockMovements: StockMovement[] = [];
    let totalReturnAmount = 0;

    const returnId = generateUniqueId('PRET');
    const returnNumber = await this.getNextPurchaseReturnNumber(businessId);

    for (const reqLine of payload.lines) {
      const qtyToReturn = Number(reqLine.quantityToReturn);
      if (qtyToReturn <= 0) continue;

      const meta = returnableMap.get(reqLine.originalPurchaseLineId);
      if (!meta) {
        throw new PurchaseCorrectionValidationError(`Invalid purchase line ${reqLine.originalPurchaseLineId}.`);
      }

      if (qtyToReturn > meta.returnableQuantity + 0.0001) {
        throw new PurchaseCorrectionValidationError(
          `Cannot return ${qtyToReturn} units of ${meta.itemNameSnapshot}. Maximum returnable: ${meta.returnableQuantity}.`
        );
      }

      const lineTotal = roundCurrency(qtyToReturn * meta.effectiveUnitCost);
      totalReturnAmount = roundCurrency(totalReturnAmount + lineTotal);

      const returnLineId = generateUniqueId('PRETLINE');
      plannedReturnLines.push({
        id: returnLineId,
        businessId,
        purchaseReturnId: returnId,
        originalPurchaseId,
        originalPurchaseLineId: meta.originalPurchaseLineId,
        itemId: meta.itemId,
        itemNameSnapshot: meta.itemNameSnapshot,
        quantity: qtyToReturn,
        unit: meta.unit,
        unitCost: meta.effectiveUnitCost,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: lineTotal,
        trackInventory: meta.trackInventory,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      });

      // Stock deduction compensating movement (since goods leave the business back to supplier)
      if (meta.trackInventory) {
        stockMovements.push({
          id: generateUniqueId('STK'),
          businessId,
          itemId: meta.itemId,
          type: 'PURCHASE_RETURN',
          quantityChange: -Math.abs(qtyToReturn), // Negative stock
          reason: `Purchase Return ${returnNumber} for Bill #${purchase.purchaseNumber}`,
          referenceId: returnId,
          createdAt: now,
          createdByDeviceId: deviceId,
          version: 1,
        });
      }
    }

    if (plannedReturnLines.length === 0) {
      throw new PurchaseCorrectionValidationError('No valid return quantities were submitted.');
    }

    // 2. Refund Received record if settlementMode is REFUND_RECEIVED_NOW or REFUND_NOW
    let refundReceived: RefundReceived | undefined;
    let refundMovement: FinancialMovement | undefined;

    if ((settlementMode === 'REFUND_RECEIVED_NOW' || settlementMode === 'REFUND_NOW') && totalReturnAmount > 0) {
      const account = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);
      const refundId = generateUniqueId('REFUNDREC');

      refundReceived = {
        id: refundId,
        businessId,
        supplierId: purchase.supplierId,
        purchaseReturnId: returnId,
        amount: totalReturnAmount,
        refundDate: returnDate,
        paymentMethod: payload.refundPaymentMethod || 'CASH',
        notes: `Refund received for Return #${returnNumber}`,
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
        type: 'REFUND_FROM_SUPPLIER',
        direction: 'IN',
        amount: totalReturnAmount,
        movementDate: returnDate,
        referenceType: 'REFUND_RECEIVED',
        referenceId: refundId,
        description: `Refund received from supplier for Return #${returnNumber} (${payload.refundPaymentMethod || 'CASH'})`,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };
    }

    const purchaseReturnRecord: PurchaseReturn = {
      id: returnId,
      businessId,
      originalPurchaseId,
      supplierId: purchase.supplierId,
      returnNumber,
      returnDate,
      totalAmount: totalReturnAmount,
      reason,
      notes,
      settlementMode,
      refundAmount: settlementMode === 'REFUND_NOW' ? totalReturnAmount : 0,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: purchaseReturnRecord.id,
        recordType: 'purchaseReturn',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      ...plannedReturnLines.map((l) => ({
        id: generateUniqueId('SYNC'),
        recordId: l.id,
        recordType: 'purchaseReturnLine' as const,
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

    if (refundReceived) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: refundReceived.id,
        recordType: 'refundReceived',
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

    // Atomic transaction execution in Dexie
    await db.transaction(
      'rw',
      [
        db.purchaseReturns,
        db.purchaseReturnLines,
        db.stockMovements,
        db.refundsReceived,
        db.financialMovements,
        db.syncMetadata,
      ],
      async () => {
        await db.purchaseReturns.add(purchaseReturnRecord);
        await db.purchaseReturnLines.bulkAdd(plannedReturnLines);
        if (stockMovements.length > 0) {
          await db.stockMovements.bulkAdd(stockMovements);
        }
        if (refundReceived) {
          await db.refundsReceived.add(refundReceived);
        }
        if (refundMovement) {
          await db.financialMovements.add(refundMovement);
        }
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );

    return {
      purchaseReturn: purchaseReturnRecord,
      lines: plannedReturnLines,
      stockMovements,
      refundReceived,
      movement: refundMovement,
    };
  },

  /**
   * Processes a purchase void atomically.
   */
  async processPurchaseVoid(payload: ProcessPurchaseVoidPayload): Promise<{
    purchaseVoid: PurchaseVoid;
    compensatingMovements: StockMovement[];
    refundReceived?: RefundReceived;
    movement?: FinancialMovement;
  }> {
    const {
      businessId,
      originalPurchaseId,
      reason = 'Purchase Void',
      notes,
      voidDate = new Date().toISOString(),
      settlementMode = 'SUPPLIER_CREDIT',
    } = payload;

    const purchase = await db.purchases.get(originalPurchaseId);
    if (!purchase || purchase.isDeleted) {
      throw new PurchaseCorrectionValidationError(`Purchase #${originalPurchaseId} not found.`);
    }

    const existingVoid = await db.purchaseVoids
      .where('originalPurchaseId')
      .equals(originalPurchaseId)
      .filter((v) => !v.isDeleted)
      .first();

    if (existingVoid) {
      throw new PurchaseCorrectionValidationError('This purchase has already been voided.');
    }

    const returnableLines = await this.getPurchaseReturnableLines(originalPurchaseId);
    const compensatingMovements: StockMovement[] = [];
    const now = new Date().toISOString();
    const deviceId = getPersistentDeviceId();
    const voidId = generateUniqueId('PURVOID');

    for (const line of returnableLines) {
      if (line.returnableQuantity > 0 && line.trackInventory) {
        compensatingMovements.push({
          id: generateUniqueId('STK'),
          businessId,
          itemId: line.itemId,
          type: 'PURCHASE_RETURN',
          quantityChange: -Math.abs(line.returnableQuantity), // remove remaining stock
          reason: `Compensating stock deduction for Voided Purchase #${purchase.purchaseNumber}`,
          referenceId: voidId,
          createdAt: now,
          createdByDeviceId: deviceId,
          version: 1,
        });
      }
    }

    // 2. Determine refund if payments were allocated to this purchase
    const allocations = await db.supplierPaymentAllocations
      .where('purchaseId')
      .equals(originalPurchaseId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const reversals = await db.supplierPaymentReversals.filter((r) => !r.isDeleted).toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const totalPaidOnPurchase = roundCurrency(
      allocations
        .filter((a) => !reversedPaymentIds.has(a.supplierPaymentId))
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    );

    let refundReceived: RefundReceived | undefined;
    let refundMovement: FinancialMovement | undefined;

    if ((settlementMode === 'REFUND_RECEIVED_NOW' || settlementMode === 'REFUND_NOW') && totalPaidOnPurchase > 0) {
      const account = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);
      const refundId = generateUniqueId('REFUNDREC');

      refundReceived = {
        id: refundId,
        businessId,
        supplierId: purchase.supplierId,
        purchaseVoidId: voidId,
        amount: totalPaidOnPurchase,
        refundDate: voidDate,
        paymentMethod: payload.refundPaymentMethod || 'CASH',
        notes: `Refund received for Voided Purchase #${purchase.purchaseNumber}`,
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
        type: 'REFUND_FROM_SUPPLIER',
        direction: 'IN',
        amount: totalPaidOnPurchase,
        movementDate: voidDate,
        referenceType: 'REFUND_RECEIVED',
        referenceId: refundId,
        description: `Refund received for Voided Purchase #${purchase.purchaseNumber} (${payload.refundPaymentMethod || 'CASH'})`,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };
    }

    const voidRecord: PurchaseVoid = {
      id: voidId,
      businessId,
      originalPurchaseId,
      supplierId: purchase.supplierId,
      reason,
      voidDate,
      settlementMode,
      refundAmount: settlementMode === 'REFUND_NOW' ? totalPaidOnPurchase : 0,
      notes,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: voidRecord.id,
        recordType: 'purchaseVoid',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      ...compensatingMovements.map((m) => ({
        id: generateUniqueId('SYNC'),
        recordId: m.id,
        recordType: 'stockMovement' as const,
        syncState: 'LOCAL_ONLY' as const,
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      })),
    ];

    if (refundReceived) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: refundReceived.id,
        recordType: 'refundReceived',
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

    // Atomic transaction execution in Dexie
    await db.transaction(
      'rw',
      [
        db.purchaseVoids,
        db.stockMovements,
        db.refundsReceived,
        db.financialMovements,
        db.syncMetadata,
      ],
      async () => {
        await db.purchaseVoids.add(voidRecord);
        if (compensatingMovements.length > 0) {
          await db.stockMovements.bulkAdd(compensatingMovements);
        }
        if (refundReceived) {
          await db.refundsReceived.add(refundReceived);
        }
        if (refundMovement) {
          await db.financialMovements.add(refundMovement);
        }
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );

    return {
      purchaseVoid: voidRecord,
      compensatingMovements,
      refundReceived,
      movement: refundMovement,
    };
  },

  /**
   * Processes a supplier payment reversal atomically.
   */
  async processSupplierPaymentReversal(payload: ProcessSupplierPaymentReversalPayload): Promise<{
    reversal: SupplierPaymentReversal;
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
      throw new PurchaseCorrectionValidationError('Payment ID is required for reversal.');
    }

    const payment = await db.supplierPayments.get(paymentId);
    if (!payment || payment.isDeleted) {
      throw new PurchaseCorrectionValidationError('Supplier payment record not found.');
    }

    const existingReversal = await db.supplierPaymentReversals
      .where('originalPaymentId')
      .equals(paymentId)
      .filter((r) => !r.isDeleted)
      .first();

    if (existingReversal) {
      throw new PurchaseCorrectionValidationError('This supplier payment has already been reversed.');
    }

    // Check if original supplier payment had an associated FinancialMovement
    const originalMovement = await db.financialMovements
      .where('referenceId')
      .equals(paymentId)
      .filter((m) => !m.isDeleted && m.type === 'SUPPLIER_PAYMENT')
      .first();

    let targetAccountId = originalMovement?.accountId;
    if (!targetAccountId) {
      const resolved = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);
      targetAccountId = resolved.id;
    }

    const now = new Date().toISOString();
    const deviceId = getPersistentDeviceId();
    const reversalId = generateUniqueId('SPAYREV');

    const reversalRecord: SupplierPaymentReversal = {
      id: reversalId,
      businessId,
      originalPaymentId: paymentId,
      supplierId: payment.supplierId,
      amount: payment.amount,
      reason,
      reversalDate,
      notes,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // Compensating FinancialMovement IN
    const compensatingMovement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId,
      accountId: targetAccountId,
      type: 'SUPPLIER_PAYMENT_REVERSAL',
      direction: 'IN',
      amount: reversalRecord.amount,
      movementDate: reversalDate,
      referenceType: 'SUPPLIER_PAYMENT_REVERSAL',
      referenceId: reversalRecord.id,
      description: `Reversal of supplier payment #${paymentId}: ${reason}`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: reversalRecord.id,
        recordType: 'supplierPaymentReversal',
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

    // Atomic transaction execution in Dexie
    await db.transaction(
      'rw',
      [db.supplierPaymentReversals, db.financialMovements, db.syncMetadata],
      async () => {
        // Re-check inside transaction for idempotency
        const duplicateCheck = await db.supplierPaymentReversals
          .where('originalPaymentId')
          .equals(paymentId)
          .filter((r) => !r.isDeleted)
          .first();

        if (duplicateCheck) {
          throw new PurchaseCorrectionValidationError('This supplier payment has already been reversed.');
        }

        await db.supplierPaymentReversals.add(reversalRecord);
        await db.financialMovements.add(compensatingMovement);
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );

    return {
      reversal: reversalRecord,
      compensatingMovement,
    };
  },
};
