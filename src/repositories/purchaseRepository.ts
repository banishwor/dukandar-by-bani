import { db } from '../db/database';
import type {
  Purchase,
  PurchaseLine,
  StockMovement,
  SupplierPayment,
  SupplierPaymentAllocation,
  PurchaseReturn,
  PurchaseReturnLine,
  PurchaseVoid,
  RefundReceived,
  SyncMetadata,
  PurchaseStatus,
  Item,
  FinancialMovement,
} from '../types';
import { generateInvoiceNumber, generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';
import { roundCurrency } from '../utils/money';

export interface PurchaseFullDetails {
  purchase: Purchase;
  lines: PurchaseLine[];
  payments: SupplierPayment[];
  allocations: SupplierPaymentAllocation[];
  returns: PurchaseReturn[];
  returnLines: PurchaseReturnLine[];
  voidRecord?: PurchaseVoid;
  refundsReceived: RefundReceived[];
  effectiveTotalAmount: number;
  totalReturnedAmount: number;
  isVoided: boolean;
}

export interface ItemCostUpdate {
  itemId: string;
  newPurchaseCost: number;
}

/**
 * Purchases Repository
 *
 * IMMUTABILITY RULE:
 * Completed purchases, purchase lines, stock movements, supplier payments, and allocations
 * represent immutable historical events. Financial amounts, quantities, supplier, rates
 * must NEVER be modified in place.
 * Any correction is recorded as a new immutable event (PURCHASE_RETURN, PURCHASE_VOID, REVERSAL).
 */
export const purchaseRepository = {
  async getPurchases(businessId: string): Promise<Purchase[]> {
    const rawPurchases = await db.purchases
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted)
      .reverse()
      .sortBy('createdAt');

    const voids = await db.purchaseVoids
      .where('businessId')
      .equals(businessId)
      .filter((v) => !v.isDeleted)
      .toArray();
    const voidPurchaseIds = new Set(voids.map((v) => v.originalPurchaseId));

    const returns = await db.purchaseReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const returnSumByPurchase = new Map<string, number>();
    for (const r of returns) {
      const current = returnSumByPurchase.get(r.originalPurchaseId) || 0;
      returnSumByPurchase.set(r.originalPurchaseId, current + (Number(r.totalAmount) || 0));
    }

    const reversals = await db.supplierPaymentReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const allocations = await db.supplierPaymentAllocations
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted && !reversedPaymentIds.has(a.supplierPaymentId))
      .toArray();

    return rawPurchases.map((purchase) => {
      if (voidPurchaseIds.has(purchase.id)) {
        return {
          ...purchase,
          status: 'VOIDED' as PurchaseStatus,
          dueAmount: 0,
        };
      }

      const totalReturned = returnSumByPurchase.get(purchase.id) || 0;
      const effectiveTotal = roundCurrency(Math.max(0, (Number(purchase.totalAmount) || 0) - totalReturned));
      const purchaseAllocs = allocations.filter((a) => a.purchaseId === purchase.id);
      const paid = roundCurrency(purchaseAllocs.reduce((sum, a) => sum + (Number(a.amount) || 0), 0));
      const due = roundCurrency(Math.max(0, effectiveTotal - paid));

      let status: PurchaseStatus = 'UNPAID';
      if (totalReturned >= (Number(purchase.totalAmount) || 0) - 0.005 && (Number(purchase.totalAmount) || 0) > 0) {
        status = 'RETURNED';
      } else if (due <= 0.005) {
        status = 'PAID';
      } else if (paid > 0) {
        status = 'PARTIAL';
      }

      return {
        ...purchase,
        paidAmount: paid,
        dueAmount: due,
        status,
      };
    });
  },

  async getPurchasesBySupplier(supplierId: string): Promise<Purchase[]> {
    const rawPurchases = await db.purchases
      .where('supplierId')
      .equals(supplierId)
      .filter((p) => !p.isDeleted)
      .reverse()
      .sortBy('createdAt');

    const purchaseIds = new Set(rawPurchases.map((p) => p.id));

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

    const reversals = await db.supplierPaymentReversals
      .filter((r) => !r.isDeleted)
      .toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const allocations = await db.supplierPaymentAllocations
      .where('supplierId')
      .equals(supplierId)
      .filter((a) => !a.isDeleted && !reversedPaymentIds.has(a.supplierPaymentId))
      .toArray();

    return rawPurchases.map((purchase) => {
      if (voidPurchaseIds.has(purchase.id)) {
        return {
          ...purchase,
          status: 'VOIDED' as PurchaseStatus,
          dueAmount: 0,
        };
      }

      const totalReturned = returnSumByPurchase.get(purchase.id) || 0;
      const effectiveTotal = roundCurrency(Math.max(0, (Number(purchase.totalAmount) || 0) - totalReturned));
      const purchaseAllocs = allocations.filter((a) => a.purchaseId === purchase.id);
      const paid = roundCurrency(purchaseAllocs.reduce((sum, a) => sum + (Number(a.amount) || 0), 0));
      const due = roundCurrency(Math.max(0, effectiveTotal - paid));

      let status: PurchaseStatus = 'UNPAID';
      if (totalReturned >= (Number(purchase.totalAmount) || 0) - 0.005 && (Number(purchase.totalAmount) || 0) > 0) {
        status = 'RETURNED';
      } else if (due <= 0.005) {
        status = 'PAID';
      } else if (paid > 0) {
        status = 'PARTIAL';
      }

      return {
        ...purchase,
        paidAmount: paid,
        dueAmount: due,
        status,
      };
    });
  },

  async getPurchaseWithDetails(purchaseId: string): Promise<PurchaseFullDetails | undefined> {
    const purchase = await db.purchases.get(purchaseId);
    if (!purchase || purchase.isDeleted) return undefined;

    const lines = await db.purchaseLines
      .where('purchaseId')
      .equals(purchaseId)
      .toArray();

    const reversals = await db.supplierPaymentReversals
      .filter((r) => !r.isDeleted)
      .toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const allocations = await db.supplierPaymentAllocations
      .where('purchaseId')
      .equals(purchaseId)
      .filter((a) => !a.isDeleted && !reversedPaymentIds.has(a.supplierPaymentId))
      .toArray();

    const voidRecord = await db.purchaseVoids
      .where('originalPurchaseId')
      .equals(purchaseId)
      .filter((v) => !v.isDeleted)
      .first();

    const returns = await db.purchaseReturns
      .where('originalPurchaseId')
      .equals(purchaseId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const returnLines = await db.purchaseReturnLines
      .where('originalPurchaseId')
      .equals(purchaseId)
      .filter((l) => !l.isDeleted)
      .toArray();

    const returnIds = new Set(returns.map((r) => r.id));
    const allRefunds = await db.refundsReceived.filter((r) => !r.isDeleted).toArray();
    const refundsReceived = allRefunds.filter(
      (r) =>
        (r.purchaseReturnId && returnIds.has(r.purchaseReturnId)) ||
        (voidRecord && r.purchaseVoidId === voidRecord.id)
    );

    const paymentIds = new Set<string>();
    allocations.forEach((a) => paymentIds.add(a.supplierPaymentId));

    const directPayments = await db.supplierPayments
      .where('referenceId')
      .equals(purchaseId)
      .filter((p) => !p.isDeleted)
      .toArray();

    directPayments.forEach((p) => paymentIds.add(p.id));

    const allPaymentsList: SupplierPayment[] = [];
    for (const pid of paymentIds) {
      const p = await db.supplierPayments.get(pid);
      if (p && !p.isDeleted) {
        allPaymentsList.push(p);
      }
    }

    const totalReturnedAmount = roundCurrency(
      returns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0)
    );
    const isVoided = Boolean(voidRecord);
    const effectiveTotalAmount = isVoided
      ? 0
      : roundCurrency(Math.max(0, (Number(purchase.totalAmount) || 0) - totalReturnedAmount));

    const totalAllocated = roundCurrency(
      allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    );

    let status: PurchaseStatus = 'UNPAID';
    if (isVoided) {
      status = 'VOIDED';
    } else if (
      totalReturnedAmount >= (Number(purchase.totalAmount) || 0) - 0.005 &&
      (Number(purchase.totalAmount) || 0) > 0
    ) {
      status = 'RETURNED';
    } else if (totalAllocated >= effectiveTotalAmount - 0.005) {
      status = 'PAID';
    } else if (totalAllocated > 0) {
      status = 'PARTIAL';
    }

    const calculatedPurchase: Purchase = {
      ...purchase,
      paidAmount: totalAllocated,
      dueAmount: isVoided ? 0 : roundCurrency(Math.max(0, effectiveTotalAmount - totalAllocated)),
      status,
    };

    return {
      purchase: calculatedPurchase,
      lines,
      payments: allPaymentsList,
      allocations,
      returns,
      returnLines,
      voidRecord,
      refundsReceived,
      effectiveTotalAmount,
      totalReturnedAmount,
      isVoided,
    };
  },

  async getNextPurchaseNumber(businessId: string): Promise<string> {
    const allPurchases = await db.purchases
      .where('businessId')
      .equals(businessId)
      .toArray();

    let maxNumber = 0;
    for (const p of allPurchases) {
      if (p.purchaseNumber) {
        const match = p.purchaseNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    }

    const nextSeq = maxNumber + 1;
    return generateInvoiceNumber(nextSeq, 'PUR');
  },

  /**
   * Atomic Purchase Transaction:
   * Commits Purchase, PurchaseLines, StockMovements (+), SupplierPayment (if paid),
   * SupplierPaymentAllocations, Item lastPurchaseCost updates, and SyncMetadata in a single Dexie transaction.
   * If any failure occurs, Dexie will automatically roll back everything.
   */
  async executeAtomicPurchase(
    purchase: Purchase,
    lines: PurchaseLine[],
    stockMovements: StockMovement[],
    payment?: SupplierPayment,
    allocations?: SupplierPaymentAllocation[],
    costUpdates?: ItemCostUpdate[],
    movement?: FinancialMovement
  ): Promise<void> {
    const now = new Date().toISOString();
    const deviceId = getPersistentDeviceId();

    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: purchase.id,
        recordType: 'purchase',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      ...lines.map((l) => ({
        id: generateUniqueId('SYNC'),
        recordId: l.id,
        recordType: 'purchaseLine' as const,
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

    if (payment) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: payment.id,
        recordType: 'supplierPayment',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    }

    if (allocations && allocations.length > 0) {
      allocations.forEach((alloc) => {
        syncRecords.push({
          id: generateUniqueId('SYNC'),
          recordId: alloc.id,
          recordType: 'supplierPaymentAllocation',
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        });
      });
    }

    if (movement) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: movement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    }

    await db.transaction(
      'rw',
      [
        db.purchases,
        db.purchaseLines,
        db.stockMovements,
        db.supplierPayments,
        db.supplierPaymentAllocations,
        db.financialMovements,
        db.items,
        db.syncMetadata,
      ],
      async () => {
        // 1. Add Purchase
        await db.purchases.add(purchase);

        // 2. Add Purchase Lines
        if (lines.length > 0) {
          await db.purchaseLines.bulkAdd(lines);
        }

        // 3. Add Stock Movements
        if (stockMovements.length > 0) {
          await db.stockMovements.bulkAdd(stockMovements);
        }

        // 4. Add Payment (if paid > 0)
        if (payment) {
          await db.supplierPayments.add(payment);
        }

        // 5. Add Allocations
        if (allocations && allocations.length > 0) {
          await db.supplierPaymentAllocations.bulkAdd(allocations);
        }

        // 6. Add Financial Movement (if paid > 0)
        if (movement) {
          await db.financialMovements.add(movement);
        }

        // 6. Update Item last purchase costs safely
        if (costUpdates && costUpdates.length > 0) {
          for (const cu of costUpdates) {
            const item = await db.items.get(cu.itemId);
            if (item && !item.isDeleted && cu.newPurchaseCost > 0) {
              const nextVer = getNextRecordVersion(item, 'Item');
              await db.items.update(cu.itemId, {
                purchasePrice: cu.newPurchaseCost,
                updatedAt: now,
                updatedByDeviceId: deviceId,
                version: nextVer,
              });

              // Also update sync metadata for updated item
              await db.syncMetadata
                .where('recordId')
                .equals(cu.itemId)
                .modify({
                  updatedAt: now,
                  syncState: 'LOCAL_ONLY',
                });
            }
          }
        }

        // 7. Add Sync Metadata
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );
  },

  async updatePurchaseNotes(id: string, notes: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.purchases.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Purchase');

    await db.transaction('rw', [db.purchases, db.syncMetadata], async () => {
      await db.purchases.update(id, {
        notes,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata
        .where('recordId')
        .equals(id)
        .modify({
          updatedAt: now,
          syncState: 'LOCAL_ONLY',
        });
    });
  },
};
