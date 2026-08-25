import { db } from '../db/database';
import type { Supplier, SupplierWithBalance } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';
import { roundCurrency } from '../utils/money';

export const supplierRepository = {
  async getSuppliers(businessId: string, includeArchived = false): Promise<Supplier[]> {
    const query = db.suppliers.where('businessId').equals(businessId);
    if (!includeArchived) {
      return await query.filter((s) => !s.isDeleted).sortBy('name');
    }
    return await query.sortBy('name');
  },

  async getSuppliersWithBalance(businessId: string, includeArchived = false): Promise<SupplierWithBalance[]> {
    const suppliers = await this.getSuppliers(businessId, includeArchived);
    const purchases = await db.purchases
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const purchaseIds = new Set(purchases.map((p) => p.id));

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

    const payments = await db.supplierPayments
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted)
      .toArray();

    const reversals = await db.supplierPaymentReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const refunds = await db.refundsReceived
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const allocations = await db.supplierPaymentAllocations
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted && !reversedPaymentIds.has(a.supplierPaymentId))
      .toArray();

    return suppliers.map((supplier) => {
      const suppPurchases = purchases.filter((p) => p.supplierId === supplier.id && !voidPurchaseIds.has(p.id));
      const suppReturns = returns.filter((r) => r.supplierId === supplier.id);
      const suppPayments = payments.filter((p) => p.supplierId === supplier.id && !reversedPaymentIds.has(p.id));
      const suppRefunds = refunds.filter((r) => r.supplierId === supplier.id);
      const suppAllocations = allocations.filter((a) => a.supplierId === supplier.id && !voidPurchaseIds.has(a.purchaseId));

      const totalGrossPurchases = suppPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
      const totalReturns = suppReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const totalPurchases = roundCurrency(Math.max(0, totalGrossPurchases - totalReturns));

      const totalGrossPaid = suppPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const totalRefunds = suppRefunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const totalPaid = roundCurrency(Math.max(0, totalGrossPaid - totalRefunds));

      const totalAllocated = roundCurrency(
        suppAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
      );

      // Compute remaining payable across each active non-voided purchase
      let outstandingPayable = 0;
      for (const purchase of suppPurchases) {
        const retOnPurchase = returnSumByPurchase.get(purchase.id) || 0;
        const effectivePurchaseTotal = roundCurrency(Math.max(0, (Number(purchase.totalAmount) || 0) - retOnPurchase));
        if (effectivePurchaseTotal <= 0.005) continue;

        const purchaseAllocated = suppAllocations
          .filter((a) => a.purchaseId === purchase.id)
          .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
        const purchaseDue = Math.max(0, effectivePurchaseTotal - purchaseAllocated);
        outstandingPayable += purchaseDue;
      }
      outstandingPayable = roundCurrency(outstandingPayable);

      // Available unallocated credit / advances to supplier
      const supplierCredit = roundCurrency(Math.max(0, totalPaid - totalAllocated));
      const netPayable = roundCurrency(outstandingPayable - supplierCredit);

      // Find last activity
      const allDates = [
        ...suppPurchases.map((p) => p.purchaseDate || p.createdAt),
        ...suppPayments.map((p) => p.paymentDate || p.createdAt),
        ...suppReturns.map((r) => r.returnDate || r.createdAt),
      ].filter(Boolean);

      allDates.sort().reverse();
      const lastActivityDate = allDates[0] || supplier.createdAt;

      return {
        ...supplier,
        totalPurchases,
        totalPaid,
        totalAllocated,
        outstandingPayable,
        supplierCredit,
        netPayable,
        lastActivityDate,
      };
    });
  },

  async getSupplierById(id: string): Promise<Supplier | undefined> {
    const supplier = await db.suppliers.get(id);
    if (!supplier || supplier.isDeleted) return undefined;
    return supplier;
  },

  async createSupplier(
    businessId: string,
    data: Omit<Supplier, 'id' | 'businessId' | 'createdAt' | 'updatedAt' | 'createdByDeviceId' | 'updatedByDeviceId' | 'version' | 'isDeleted'>
  ): Promise<Supplier> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const supplierId = generateUniqueId('SUP');

    const supplier: Supplier = {
      ...data,
      id: supplierId,
      businessId,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction('rw', [db.suppliers, db.syncMetadata], async () => {
      await db.suppliers.add(supplier);
      await db.syncMetadata.add({
        id: generateUniqueId('SYNC'),
        recordId: supplier.id,
        recordType: 'supplier',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    });

    return supplier;
  },

  async updateSupplier(id: string, updates: Partial<Supplier>): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.suppliers.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Supplier');

    // Sanitize updates to prevent tampering with base immutable fields
    const {
      id: _id,
      businessId: _bId,
      createdAt: _cAt,
      createdByDeviceId: _cDev,
      version: _v,
      ...safeUpdates
    } = updates;

    await db.transaction('rw', [db.suppliers, db.syncMetadata], async () => {
      await db.suppliers.update(id, {
        ...safeUpdates,
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

  async softDeleteSupplier(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.suppliers.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Supplier');

    await db.transaction('rw', [db.suppliers, db.syncMetadata], async () => {
      await db.suppliers.update(id, {
        isDeleted: true,
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

  async restoreSupplier(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.suppliers.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Supplier');

    await db.transaction('rw', [db.suppliers, db.syncMetadata], async () => {
      await db.suppliers.update(id, {
        isDeleted: false,
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
