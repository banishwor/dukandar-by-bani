import { db } from '../db/database';
import { financialAccountService } from './financialAccountService';
import type {
  SupplierPayment,
  SupplierPaymentAllocation,
  PaySupplierPayload,
  OutstandingPurchase,
  SupplierFinancialSummary,
  SupplierStatementEntry,
  SyncMetadata,
  PaymentMethod,
  FinancialMovement,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency, subtractCurrency, addCurrency, isCurrencyGreaterThan } from '../utils/money';

// Concurrency lock to prevent duplicate payment submissions
const activePaymentSubmissions = new Set<string>();

export class SupplierPaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupplierPaymentValidationError';
  }
}

export const supplierPaymentService = {
  /**
   * Retrieves outstanding purchases for a supplier with live-calculated due amounts based on allocations and returns.
   * Sorted oldest first (FIFO order). Voided purchases are excluded.
   */
  async getOutstandingPurchasesForSupplier(supplierId: string): Promise<OutstandingPurchase[]> {
    const purchases = await db.purchases
      .where('supplierId')
      .equals(supplierId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const purchaseIds = new Set(purchases.map((p) => p.id));

    const voids = await db.purchaseVoids
      .filter((v) => !v.isDeleted && purchaseIds.has(v.originalPurchaseId))
      .toArray();
    const voidPurchaseIds = new Set(voids.map((v) => v.originalPurchaseId));

    const returns = await db.purchaseReturns
      .filter((r) => !r.isDeleted && purchaseIds.has(r.originalPurchaseId))
      .toArray();

    const returnSumByPurchase = new Map<string, number>();
    for (const r of returns) {
      const current = returnSumByPurchase.get(r.originalPurchaseId) || 0;
      returnSumByPurchase.set(r.originalPurchaseId, current + (Number(r.totalAmount) || 0));
    }

    const allocations = await db.supplierPaymentAllocations
      .where('supplierId')
      .equals(supplierId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const reversals = await db.supplierPaymentReversals.filter((r) => !r.isDeleted).toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const outstanding: OutstandingPurchase[] = [];

    for (const purchase of purchases) {
      if (voidPurchaseIds.has(purchase.id)) continue;

      const totalReturned = returnSumByPurchase.get(purchase.id) || 0;
      const effectiveTotalAmount = roundCurrency(Math.max(0, (Number(purchase.totalAmount) || 0) - totalReturned));

      if (effectiveTotalAmount <= 0.005) continue; // Fully returned

      const purchaseAllocations = allocations.filter(
        (a) => a.purchaseId === purchase.id && !reversedPaymentIds.has(a.supplierPaymentId)
      );
      const paidAmount = roundCurrency(
        purchaseAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
      );
      const dueAmount = roundCurrency(Math.max(0, effectiveTotalAmount - paidAmount));

      if (dueAmount > 0.005) {
        outstanding.push({
          purchaseId: purchase.id,
          purchaseNumber: purchase.purchaseNumber,
          purchaseDate: purchase.purchaseDate || purchase.createdAt,
          totalAmount: effectiveTotalAmount,
          paidAmount,
          dueAmount,
          status: paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
        });
      }
    }

    // Sort oldest first for FIFO allocation
    outstanding.sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());
    return outstanding;
  },

  /**
   * Computes accurate financial summary for a supplier taking into account purchases, returns, voids, payments, reversals, and refunds.
   */
  async getSupplierFinancialSummary(supplierId: string): Promise<SupplierFinancialSummary> {
    const supplier = await db.suppliers.get(supplierId);
    if (!supplier) {
      throw new SupplierPaymentValidationError(`Supplier with ID ${supplierId} not found.`);
    }

    const purchases = await db.purchases
      .where('supplierId')
      .equals(supplierId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const purchaseIds = new Set(purchases.map((p) => p.id));

    const voids = await db.purchaseVoids
      .filter((v) => !v.isDeleted && (v.supplierId === supplierId || purchaseIds.has(v.originalPurchaseId)))
      .toArray();
    const voidPurchaseIds = new Set(voids.map((v) => v.originalPurchaseId));

    const returns = await db.purchaseReturns
      .filter((r) => !r.isDeleted && (r.supplierId === supplierId || purchaseIds.has(r.originalPurchaseId)))
      .toArray();

    const returnSumByPurchase = new Map<string, number>();
    for (const r of returns) {
      const current = returnSumByPurchase.get(r.originalPurchaseId) || 0;
      returnSumByPurchase.set(r.originalPurchaseId, current + (Number(r.totalAmount) || 0));
    }

    const payments = await db.supplierPayments
      .where('supplierId')
      .equals(supplierId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const reversals = await db.supplierPaymentReversals
      .filter((r) => !r.isDeleted && (r.supplierId === supplierId || payments.some((p) => p.id === r.originalPaymentId)))
      .toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const refunds = await db.refundsReceived
      .filter((r) => !r.isDeleted && r.supplierId === supplierId)
      .toArray();

    const allocations = await db.supplierPaymentAllocations
      .where('supplierId')
      .equals(supplierId)
      .filter((a) => !a.isDeleted && !reversedPaymentIds.has(a.supplierPaymentId))
      .toArray();

    // 1. Total Net Purchases (non-voided purchases minus returns)
    let totalPurchasesGross = 0;
    let totalReturnsOnActivePurchases = 0;
    for (const purchase of purchases) {
      if (!voidPurchaseIds.has(purchase.id)) {
        totalPurchasesGross += Number(purchase.totalAmount) || 0;
        totalReturnsOnActivePurchases += returnSumByPurchase.get(purchase.id) || 0;
      }
    }
    const totalPurchases = roundCurrency(Math.max(0, totalPurchasesGross - totalReturnsOnActivePurchases));

    // 2. Net Payments made (payments minus reversals minus refunds received)
    const totalPaymentsGross = payments
      .filter((p) => !reversedPaymentIds.has(p.id))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalRefundsAmount = refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalPaid = roundCurrency(Math.max(0, totalPaymentsGross - totalRefundsAmount));

    // 3. Allocations on active non-voided purchases
    const validAllocations = allocations.filter((a) => !voidPurchaseIds.has(a.purchaseId));
    const totalAllocated = roundCurrency(
      validAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    );

    // 4. Outstanding Purchases & Balances
    let outstandingPayable = 0;
    let outstandingPurchasesCount = 0;
    let totalEffectiveAllocated = 0;

    for (const purchase of purchases) {
      if (voidPurchaseIds.has(purchase.id)) continue;

      const retOnPurchase = returnSumByPurchase.get(purchase.id) || 0;
      const effectivePurchaseTotal = roundCurrency(Math.max(0, (Number(purchase.totalAmount) || 0) - retOnPurchase));
      if (effectivePurchaseTotal <= 0.005) continue;

      const rawAllocated = validAllocations
        .filter((a) => a.purchaseId === purchase.id)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      const purchaseAllocated = roundCurrency(Math.min(effectivePurchaseTotal, rawAllocated));
      totalEffectiveAllocated += purchaseAllocated;

      const purchaseDue = roundCurrency(Math.max(0, effectivePurchaseTotal - purchaseAllocated));
      if (purchaseDue > 0.005) {
        outstandingPayable += purchaseDue;
        outstandingPurchasesCount++;
      }
    }
    outstandingPayable = roundCurrency(outstandingPayable);

    // Supplier Credit = net payments made minus total effective allocated
    const supplierCredit = roundCurrency(Math.max(0, totalPaid - totalEffectiveAllocated));
    const netPayable = roundCurrency(outstandingPayable - supplierCredit);

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      totalPurchases,
      totalPaid,
      totalAllocated: roundCurrency(totalEffectiveAllocated),
      outstandingPayable,
      supplierCredit,
      netPayable,
      outstandingPurchasesCount,
    };
  },

  /**
   * Generates supplier account statement ledger entries with running balance including purchases, returns, voids, payments, reversals, and refunds received.
   */
  async getSupplierStatement(supplierId: string): Promise<SupplierStatementEntry[]> {
    const supplier = await db.suppliers.get(supplierId);
    if (!supplier) {
      throw new SupplierPaymentValidationError(`Supplier with ID ${supplierId} not found.`);
    }

    const purchases = await db.purchases
      .where('supplierId')
      .equals(supplierId)
      .filter((p) => !p.isDeleted)
      .toArray();
    const purchaseIds = new Set(purchases.map((p) => p.id));

    const purchasesMap = new Map<string, string>();
    purchases.forEach((p) => purchasesMap.set(p.id, p.purchaseNumber));

    const voids = await db.purchaseVoids
      .filter((v) => !v.isDeleted && (v.supplierId === supplierId || purchaseIds.has(v.originalPurchaseId)))
      .toArray();

    const returns = await db.purchaseReturns
      .filter((r) => !r.isDeleted && (r.supplierId === supplierId || purchaseIds.has(r.originalPurchaseId)))
      .toArray();

    const payments = await db.supplierPayments
      .where('supplierId')
      .equals(supplierId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const reversals = await db.supplierPaymentReversals
      .filter((r) => !r.isDeleted && (r.supplierId === supplierId || payments.some((p) => p.id === r.originalPaymentId)))
      .toArray();

    const refunds = await db.refundsReceived
      .filter((r) => !r.isDeleted && r.supplierId === supplierId)
      .toArray();

    const allocations = await db.supplierPaymentAllocations
      .where('supplierId')
      .equals(supplierId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const entries: SupplierStatementEntry[] = [];

    // 1. Purchases (Payable - increases what business owes supplier)
    for (const purchase of purchases) {
      entries.push({
        id: purchase.id,
        date: purchase.purchaseDate || purchase.createdAt,
        type: 'PURCHASE',
        referenceNumber: purchase.purchaseNumber,
        referenceId: purchase.id,
        description: `Purchase Bill #${purchase.purchaseNumber}`,
        payable: roundCurrency(Number(purchase.totalAmount) || 0),
        paid: 0,
        runningBalance: 0,
        notes: purchase.notes,
      });
    }

    // 2. Purchase Returns (Paid - decreases what business owes)
    for (const ret of returns) {
      const origBill = purchasesMap.get(ret.originalPurchaseId) || 'PUR';
      entries.push({
        id: ret.id,
        date: ret.returnDate || ret.createdAt,
        type: 'PURCHASE_RETURN',
        referenceNumber: ret.returnNumber,
        referenceId: ret.id,
        description: `Purchase Return #${ret.returnNumber} (for #${origBill})`,
        payable: 0,
        paid: roundCurrency(Number(ret.totalAmount) || 0),
        runningBalance: 0,
        notes: ret.notes || (ret.reason ? `Reason: ${ret.reason}` : undefined),
      });
    }

    // 3. Purchase Voids (Paid - canceling remaining purchase balance)
    for (const v of voids) {
      const origPurchase = purchases.find((p) => p.id === v.originalPurchaseId);
      const origBill = origPurchase?.purchaseNumber || purchasesMap.get(v.originalPurchaseId) || 'PUR';
      const returnsOnThisPurchase = returns
        .filter((r) => r.originalPurchaseId === v.originalPurchaseId)
        .reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const unreturnedPurchaseAmount = roundCurrency(
        Math.max(0, (Number(origPurchase?.totalAmount) || 0) - returnsOnThisPurchase)
      );

      if (unreturnedPurchaseAmount > 0) {
        entries.push({
          id: v.id,
          date: v.voidDate || v.createdAt,
          type: 'PURCHASE_VOID',
          referenceNumber: `VOID-${origBill}`,
          referenceId: v.id,
          description: `Purchase #${origBill} Voided / Cancelled`,
          payable: 0,
          paid: unreturnedPurchaseAmount,
          runningBalance: 0,
          notes: v.notes || (v.reason ? `Reason: ${v.reason}` : undefined),
        });
      }
    }

    // 4. Supplier Payments (Paid - decreases payable)
    for (const payment of payments) {
      const paymentAllocations = allocations.filter((a) => a.supplierPaymentId === payment.id);
      const allocationDetails = paymentAllocations.map((a) => ({
        purchaseNumber: purchasesMap.get(a.purchaseId) || 'PUR',
        purchaseId: a.purchaseId,
        amount: roundCurrency(Number(a.amount) || 0),
      }));

      entries.push({
        id: payment.id,
        date: payment.paymentDate || payment.createdAt,
        type: 'SUPPLIER_PAYMENT',
        referenceNumber: `PMT-${payment.id.substring(0, 8)}`,
        referenceId: payment.id,
        description: `Payment Made (${payment.paymentMethod})`,
        payable: 0,
        paid: roundCurrency(Number(payment.amount) || 0),
        runningBalance: 0,
        paymentMethod: payment.paymentMethod,
        notes: payment.notes,
        allocations: allocationDetails,
      });
    }

    // 5. Payment Reversals (Payable - reverses payment and increases payable back)
    for (const rev of reversals) {
      const origPayment = payments.find((p) => p.id === rev.originalPaymentId);
      entries.push({
        id: rev.id,
        date: rev.reversalDate || rev.createdAt,
        type: 'PAYMENT_REVERSAL',
        referenceNumber: `REV-${rev.id.substring(0, 8)}`,
        referenceId: rev.id,
        description: `Payment Reversal: ${origPayment ? `PMT-${origPayment.id.substring(0, 8)}` : 'Payment'} Reversed`,
        payable: roundCurrency(Number(rev.amount) || 0),
        paid: 0,
        runningBalance: 0,
        notes: rev.notes || (rev.reason ? `Reason: ${rev.reason}` : undefined),
      });
    }

    // 6. Refunds Received from Supplier (Payable - business got cash back from supplier, reducing supplier's credit / increasing payable balance)
    for (const ref of refunds) {
      entries.push({
        id: ref.id,
        date: ref.refundDate || ref.createdAt,
        type: 'REFUND_RECEIVED',
        referenceNumber: `REF-${ref.id.substring(0, 8)}`,
        referenceId: ref.id,
        description: `Refund Received from Supplier (${ref.paymentMethod})`,
        payable: roundCurrency(Number(ref.amount) || 0),
        paid: 0,
        runningBalance: 0,
        paymentMethod: ref.paymentMethod,
        notes: ref.notes,
      });
    }

    // Sort chronologically (oldest first)
    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate running balance
    let currentBalance = 0;
    for (const entry of entries) {
      currentBalance = roundCurrency(currentBalance + entry.payable - entry.paid);
      entry.runningBalance = currentBalance;
    }

    return entries;
  },

  /**
   * Finds unallocated payment amounts for a supplier (Supplier Credit) that can be applied to new purchases.
   */
  async findUnallocatedPaymentsForSupplier(supplierId: string): Promise<
    Array<{
      payment: SupplierPayment;
      unallocatedAmount: number;
    }>
  > {
    const payments = await db.supplierPayments
      .where('supplierId')
      .equals(supplierId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const reversals = await db.supplierPaymentReversals.filter((r) => !r.isDeleted).toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const allocations = await db.supplierPaymentAllocations
      .where('supplierId')
      .equals(supplierId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const unallocatedList: Array<{ payment: SupplierPayment; unallocatedAmount: number }> = [];

    for (const payment of payments) {
      if (reversedPaymentIds.has(payment.id)) continue;

      const allocatedForPayment = allocations
        .filter((a) => a.supplierPaymentId === payment.id)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      const unallocated = roundCurrency(Math.max(0, (Number(payment.amount) || 0) - allocatedForPayment));
      if (unallocated > 0.005) {
        unallocatedList.push({
          payment,
          unallocatedAmount: unallocated,
        });
      }
    }

    // Oldest unallocated payment first
    unallocatedList.sort(
      (a, b) =>
        new Date(a.payment.paymentDate || a.payment.createdAt).getTime() -
        new Date(b.payment.paymentDate || b.payment.createdAt).getTime()
    );

    return unallocatedList;
  },

  /**
   * Records a payment to a supplier and allocates it to outstanding purchases atomically.
   */
  async recordSupplierPayment(payload: PaySupplierPayload): Promise<{
    payment: SupplierPayment;
    allocations: SupplierPaymentAllocation[];
    unallocatedCredit: number;
    movement?: FinancialMovement;
  }> {
    const rawAmount = Number(payload.amount);
    if (!rawAmount || isNaN(rawAmount) || rawAmount <= 0) {
      throw new SupplierPaymentValidationError('Payment amount must be greater than zero.');
    }

    const paymentAmount = roundCurrency(rawAmount);
    const submissionKey = `${payload.supplierId}_${paymentAmount}_${Date.now().toString().slice(0, -3)}`;

    if (activePaymentSubmissions.has(submissionKey)) {
      throw new SupplierPaymentValidationError('Duplicate payment submission detected. Please wait.');
    }
    activePaymentSubmissions.add(submissionKey);

    try {
      const supplier = await db.suppliers.get(payload.supplierId);
      if (!supplier || supplier.isDeleted) {
        throw new SupplierPaymentValidationError('Supplier does not exist or has been archived.');
      }

      const outstandingPurchases = await this.getOutstandingPurchasesForSupplier(payload.supplierId);
      const plannedAllocations: Array<{ purchaseId: string; amount: number }> = [];
      let totalAllocated = 0;
      const mode = payload.allocationMode || 'AUTO';

      if (mode === 'AUTO') {
        // FIFO Allocation: Oldest unpaid purchase first
        let remainingToAllocate = paymentAmount;
        for (const purchase of outstandingPurchases) {
          if (remainingToAllocate <= 0.001) break;

          const allocAmount = roundCurrency(Math.min(remainingToAllocate, purchase.dueAmount));
          if (allocAmount > 0) {
            plannedAllocations.push({
              purchaseId: purchase.purchaseId,
              amount: allocAmount,
            });
            remainingToAllocate = roundCurrency(remainingToAllocate - allocAmount);
            totalAllocated = roundCurrency(totalAllocated + allocAmount);
          }
        }
      } else {
        // MANUAL Allocation mode
        if (!payload.manualAllocations || payload.manualAllocations.length === 0) {
          throw new SupplierPaymentValidationError('No purchase allocations provided in manual mode.');
        }

        const purchaseMap = new Map<string, OutstandingPurchase>(
          outstandingPurchases.map((p) => [p.purchaseId, p])
        );

        for (const alloc of payload.manualAllocations) {
          const allocAmount = roundCurrency(Number(alloc.amount) || 0);
          if (allocAmount <= 0) continue;

          const targetPurchase = purchaseMap.get(alloc.purchaseId);
          if (!targetPurchase) {
            throw new SupplierPaymentValidationError(
              `Invalid purchase ID ${alloc.purchaseId} selected for allocation (may be fully paid or voided).`
            );
          }

          if (isCurrencyGreaterThan(allocAmount, targetPurchase.dueAmount)) {
            throw new SupplierPaymentValidationError(
              `Allocation of ${allocAmount} exceeds remaining due ${targetPurchase.dueAmount} for purchase #${targetPurchase.purchaseNumber}.`
            );
          }

          plannedAllocations.push({
            purchaseId: alloc.purchaseId,
            amount: allocAmount,
          });
          totalAllocated = roundCurrency(totalAllocated + allocAmount);
        }

        if (isCurrencyGreaterThan(totalAllocated, paymentAmount)) {
          throw new SupplierPaymentValidationError(
            `Total allocated (${totalAllocated}) exceeds the payment amount (${paymentAmount}).`
          );
        }
      }

      const unallocatedCredit = roundCurrency(Math.max(0, paymentAmount - totalAllocated));
      const deviceId = getPersistentDeviceId();
      const now = new Date().toISOString();
      const paymentDate = payload.paymentDate || now;
      const paymentId = generateUniqueId('SPAY');

      // Resolve Financial Account
      const account = await financialAccountService.resolveActiveAccount(payload.businessId, payload.financialAccountId);

      const paymentRecord: SupplierPayment = {
        id: paymentId,
        businessId: payload.businessId,
        supplierId: payload.supplierId,
        referenceType: 'DIRECT',
        amount: paymentAmount,
        paymentDate,
        paymentMethod: payload.paymentMethod || 'CASH',
        direction: 'OUT',
        notes: payload.notes,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };

      const allocationRecords: SupplierPaymentAllocation[] = plannedAllocations.map((alloc) => ({
        id: generateUniqueId('SPAYALLOC'),
        businessId: payload.businessId,
        supplierPaymentId: paymentId,
        purchaseId: alloc.purchaseId,
        supplierId: payload.supplierId,
        amount: alloc.amount,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      }));

      // Create FinancialMovement OUT for real-money supplier payment
      const movementId = generateUniqueId('MOV');
      const movement: FinancialMovement = {
        id: movementId,
        businessId: payload.businessId,
        accountId: account.id,
        type: 'SUPPLIER_PAYMENT',
        direction: 'OUT',
        amount: paymentAmount,
        movementDate: paymentDate,
        referenceType: 'SUPPLIER_PAYMENT',
        referenceId: paymentId,
        description: `Payment to supplier ${supplier.name || 'Supplier'} (${payload.paymentMethod || 'CASH'})`,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };

      const syncRecords: SyncMetadata[] = [
        {
          id: generateUniqueId('SYNC'),
          recordId: paymentRecord.id,
          recordType: 'supplierPayment',
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        },
        ...allocationRecords.map((alloc) => ({
          id: generateUniqueId('SYNC'),
          recordId: alloc.id,
          recordType: 'supplierPaymentAllocation' as const,
          syncState: 'LOCAL_ONLY' as const,
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        })),
        {
          id: generateUniqueId('SYNC'),
          recordId: movement.id,
          recordType: 'financialMovement' as const,
          syncState: 'LOCAL_ONLY' as const,
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        },
      ];

      // Atomic execution in Dexie
      await db.transaction(
        'rw',
        [db.supplierPayments, db.supplierPaymentAllocations, db.financialMovements, db.syncMetadata],
        async () => {
          await db.supplierPayments.add(paymentRecord);
          if (allocationRecords.length > 0) {
            await db.supplierPaymentAllocations.bulkAdd(allocationRecords);
          }
          await db.financialMovements.add(movement);
          await db.syncMetadata.bulkAdd(syncRecords);
        }
      );

      return {
        payment: paymentRecord,
        allocations: allocationRecords,
        movement,
        unallocatedCredit,
      };
    } finally {
      setTimeout(() => activePaymentSubmissions.delete(submissionKey), 2000);
    }
  },
};
