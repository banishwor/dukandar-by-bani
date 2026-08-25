import { inventoryRepository } from '../repositories/inventoryRepository';
import { itemRepository } from '../repositories/itemRepository';
import { purchaseRepository, type ItemCostUpdate } from '../repositories/purchaseRepository';
import { supplierPaymentService } from './supplierPaymentService';
import { financialAccountService } from './financialAccountService';
import type {
  CompletePurchasePayload,
  Purchase,
  PurchaseLine,
  StockMovement,
  SupplierPayment,
  SupplierPaymentAllocation,
  FinancialMovement,
  PurchaseStatus,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency, subtractCurrency, addCurrency } from '../utils/money';
import { discountUtils } from '../utils/discount';

export const purchaseService = {
  /**
   * Validates and executes a complete inbound purchase transaction atomically.
   */
  async completePurchase(businessId: string, payload: CompletePurchasePayload): Promise<Purchase> {
    if (!payload.lines || payload.lines.length === 0) {
      throw new Error('Please add at least one item to complete the purchase.');
    }

    for (const line of payload.lines) {
      if (line.quantity <= 0) {
        throw new Error(`Invalid quantity for ${line.itemNameSnapshot || 'item'}. Must be greater than 0.`);
      }
      if (line.unitCost < 0) {
        throw new Error(`Invalid unit cost for ${line.itemNameSnapshot || 'item'}. Cannot be negative.`);
      }
    }

    // Pure discount engine calculation & validation
    const calculated = discountUtils.calculateTransactionTotals(
      payload.lines.map((l) => ({
        quantity: l.quantity,
        rateOrCost: l.unitCost,
        discountType: l.discountType,
        discountValue: l.discountValue,
        discountAmount: l.discountAmount,
        taxAmount: l.taxAmount,
      })),
      payload.discountType || 'NONE',
      payload.discountValue ?? (payload.discountAmount || 0),
      payload.taxAmount || 0
    );

    const grandTotal = calculated.finalTotal;
    const directPaidAmount = roundCurrency(Math.max(0, Number(payload.paidAmount) || 0));
    const requestedCredit = roundCurrency(Math.max(0, Number(payload.applySupplierCredit) || 0));

    if (directPaidAmount + requestedCredit > grandTotal + 0.005) {
      throw new Error('Total paid amount (payment + credit) cannot exceed the total bill amount.');
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();

    // 1. Generate unique Purchase ID and sequential Purchase Number
    const purchaseId = generateUniqueId('PUR');
    const purchaseNumber = await purchaseRepository.getNextPurchaseNumber(businessId);

    // 2. Allocations array
    const allocations: SupplierPaymentAllocation[] = [];

    // 3. Construct Direct Payment record and Financial Movement if directPaidAmount > 0
    let directPayment: SupplierPayment | undefined;
    let directMovement: FinancialMovement | undefined;

    if (directPaidAmount > 0) {
      const account = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);
      const paymentId = generateUniqueId('SPAY');
      directPayment = {
        id: paymentId,
        businessId,
        supplierId: payload.supplierId,
        referenceType: 'PURCHASE',
        referenceId: purchaseId,
        amount: directPaidAmount,
        paymentDate: payload.purchaseDate || now,
        paymentMethod: payload.paymentMethod || 'CASH',
        direction: 'OUT',
        notes: `Payment for Bill #${purchaseNumber}`,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };

      // Direct payment allocation
      allocations.push({
        id: generateUniqueId('SPAYALLOC'),
        businessId,
        supplierPaymentId: paymentId,
        purchaseId,
        supplierId: payload.supplierId || '',
        amount: directPaidAmount,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      });

      // Direct payment FinancialMovement OUT
      directMovement = {
        id: generateUniqueId('MOV'),
        businessId,
        accountId: account.id,
        type: 'SUPPLIER_PAYMENT',
        direction: 'OUT',
        amount: directPaidAmount,
        movementDate: payload.purchaseDate || now,
        referenceType: 'SUPPLIER_PAYMENT',
        referenceId: paymentId,
        description: `Payment for Bill #${purchaseNumber} (${payload.paymentMethod || 'CASH'})`,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };
    }

    // 4. Apply Supplier Credit if requested
    let totalCreditAllocated = 0;
    if (requestedCredit > 0 && payload.supplierId) {
      const unallocatedPayments = await supplierPaymentService.findUnallocatedPaymentsForSupplier(payload.supplierId);
      let remainingCreditToApply = requestedCredit;

      for (const unalloc of unallocatedPayments) {
        if (remainingCreditToApply <= 0.001) break;
        const applyFromThisPayment = roundCurrency(
          Math.min(remainingCreditToApply, unalloc.unallocatedAmount)
        );

        if (applyFromThisPayment > 0) {
          allocations.push({
            id: generateUniqueId('SPAYALLOC'),
            businessId,
            supplierPaymentId: unalloc.payment.id,
            purchaseId,
            supplierId: payload.supplierId,
            amount: applyFromThisPayment,
            createdAt: now,
            updatedAt: now,
            createdByDeviceId: deviceId,
            updatedByDeviceId: deviceId,
            version: 1,
            isDeleted: false,
          });

          totalCreditAllocated = roundCurrency(totalCreditAllocated + applyFromThisPayment);
          remainingCreditToApply = roundCurrency(remainingCreditToApply - applyFromThisPayment);
        }
      }
    }

    // 5. Calculate combined effective paid amount and status
    const totalEffectivePaid = roundCurrency(directPaidAmount + totalCreditAllocated);
    const dueAmount = roundCurrency(Math.max(0, grandTotal - totalEffectivePaid));

    let status: PurchaseStatus = 'UNPAID';
    if (totalEffectivePaid >= grandTotal - 0.005 && grandTotal > 0) {
      status = 'PAID';
    } else if (totalEffectivePaid > 0) {
      status = 'PARTIAL';
    } else if (grandTotal === 0) {
      status = 'PAID';
    }

    const purchase: Purchase = {
      id: purchaseId,
      businessId,
      purchaseNumber,
      supplierId: payload.supplierId,
      supplierNameSnapshot: payload.supplierNameSnapshot || 'General Supplier',
      purchaseDate: payload.purchaseDate || now,
      status,
      subtotal: calculated.subtotal,
      discountType: calculated.overallDiscountType,
      discountValue: calculated.overallDiscountValue,
      discountAmount: calculated.overallDiscountAmount,
      taxAmount: calculated.taxAmount,
      totalAmount: grandTotal,
      paidAmount: totalEffectivePaid,
      dueAmount,
      notes: payload.notes,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // 6. Construct Purchase Lines
    const lines: PurchaseLine[] = payload.lines.map((line, index) => {
      const calcLine = calculated.lines[index];
      return {
        id: generateUniqueId('PURLINE'),
        purchaseId,
        businessId,
        itemId: line.itemId,
        itemNameSnapshot: line.itemNameSnapshot,
        quantity: line.quantity,
        unit: line.unit,
        unitCost: line.unitCost,
        discountType: calcLine ? calcLine.discountType : (line.discountType || 'NONE'),
        discountValue: calcLine ? calcLine.discountValue : (line.discountValue || 0),
        discountAmount: calcLine ? calcLine.discountAmount : (line.discountAmount || 0),
        taxAmount: calcLine ? calcLine.taxAmount : (line.taxAmount || 0),
        lineTotal: calcLine ? calcLine.lineTotal : roundCurrency(line.quantity * line.unitCost - (line.discountAmount || 0)),
        trackInventory: line.trackInventory,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
    });

    // 7. Construct Stock Movements (positive quantity for PURCHASE)
    const stockMovements: StockMovement[] = [];
    for (const line of payload.lines) {
      if (line.trackInventory) {
        stockMovements.push({
          id: generateUniqueId('STK'),
          businessId,
          itemId: line.itemId,
          type: 'PURCHASE',
          quantityChange: Math.abs(line.quantity), // Positive stock-in
          reason: `Purchase Bill ${purchaseNumber}`,
          referenceId: purchaseId,
          createdAt: now,
          createdByDeviceId: deviceId,
          version: 1,
        });
      }
    }

    // 8. Construct item cost updates (updating purchasePrice to latest unit cost)
    const costUpdates: ItemCostUpdate[] = [];
    for (const line of payload.lines) {
      if (line.unitCost > 0) {
        costUpdates.push({
          itemId: line.itemId,
          newPurchaseCost: line.unitCost,
        });
      }
    }

    // 9. Execute Atomic Transaction in Dexie
    await purchaseRepository.executeAtomicPurchase(
      purchase,
      lines,
      stockMovements,
      directPayment,
      allocations,
      costUpdates,
      directMovement
    );

    return purchase;
  },
};
