import { db } from '../db/database';
import type { Customer, CustomerWithBalance } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';
import { roundCurrency, subtractCurrency, addCurrency } from '../utils/money';

export const customerRepository = {
  async getCustomers(businessId: string): Promise<Customer[]> {
    return await db.customers
      .where('businessId')
      .equals(businessId)
      .filter((c) => !c.isDeleted)
      .sortBy('name');
  },

  async getCustomerWithBalance(customerId: string): Promise<CustomerWithBalance | undefined> {
    const customer = await db.customers.get(customerId);
    if (!customer || customer.isDeleted) return undefined;
    const all = await this.getCustomersWithBalance(customer.businessId);
    return all.find((c) => c.id === customerId);
  },

  async getCustomersWithBalance(businessId: string): Promise<CustomerWithBalance[]> {
    const customers = await this.getCustomers(businessId);
    const sales = await db.sales
      .where('businessId')
      .equals(businessId)
      .filter((s) => !s.isDeleted)
      .toArray();

    const saleIds = new Set(sales.map((s) => s.id));

    const voids = await db.saleVoids
      .where('businessId')
      .equals(businessId)
      .filter((v) => !v.isDeleted)
      .toArray();
    const voidSaleIds = new Set(voids.map((v) => v.originalSaleId));

    const returns = await db.saleReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const returnSumBySale = new Map<string, number>();
    for (const r of returns) {
      const current = returnSumBySale.get(r.originalSaleId) || 0;
      returnSumBySale.set(r.originalSaleId, current + (Number(r.totalAmount) || 0));
    }

    const payments = await db.payments
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted && p.partyType === 'CUSTOMER')
      .toArray();

    const reversals = await db.paymentReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const refunds = await db.refunds
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const allocations = await db.paymentAllocations
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted && !reversedPaymentIds.has(a.paymentId))
      .toArray();

    return customers.map((customer) => {
      const custSales = sales.filter((s) => s.customerId === customer.id && !voidSaleIds.has(s.id));
      const custReturns = returns.filter((r) => r.customerId === customer.id);
      const custPayments = payments.filter((p) => p.partyId === customer.id && !reversedPaymentIds.has(p.id));
      const custRefunds = refunds.filter((r) => r.customerId === customer.id);
      const custAllocations = allocations.filter((a) => a.customerId === customer.id && !voidSaleIds.has(a.saleId));

      const totalGrossSales = custSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
      const totalReturns = custReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const totalSales = roundCurrency(Math.max(0, totalGrossSales - totalReturns));

      const totalGrossPaid = custPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      const totalRefunds = custRefunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const totalPaid = roundCurrency(Math.max(0, totalGrossPaid - totalRefunds));

      // Compute remaining due across each active non-voided sale
      let outstandingBalance = 0;
      let totalEffectiveAllocated = 0;
      for (const sale of custSales) {
        const retOnSale = returnSumBySale.get(sale.id) || 0;
        const effectiveSaleTotal = roundCurrency(Math.max(0, (Number(sale.totalAmount) || 0) - retOnSale));
        if (effectiveSaleTotal <= 0.005) continue;

        const rawSaleAllocated = custAllocations
          .filter((a) => a.saleId === sale.id)
          .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
        const saleAllocated = roundCurrency(Math.min(effectiveSaleTotal, rawSaleAllocated));
        totalEffectiveAllocated = addCurrency(totalEffectiveAllocated, saleAllocated);

        const saleDue = roundCurrency(Math.max(0, effectiveSaleTotal - saleAllocated));
        outstandingBalance = addCurrency(outstandingBalance, saleDue);
      }
      outstandingBalance = roundCurrency(outstandingBalance);
      const totalAllocated = roundCurrency(totalEffectiveAllocated);

      // Available unallocated credit
      const customerCredit = roundCurrency(Math.max(0, totalPaid - totalAllocated));
      const netReceivable = roundCurrency(outstandingBalance - customerCredit);

      // Find last activity
      const allDates = [
        ...custSales.map((s) => s.saleDate || s.createdAt),
        ...custPayments.map((p) => p.paymentDate || p.createdAt),
        ...custReturns.map((r) => r.returnDate || r.createdAt),
      ].filter(Boolean);

      allDates.sort().reverse();
      const lastActivityDate = allDates[0] || customer.createdAt;

      return {
        ...customer,
        totalSales,
        totalPaid,
        totalAllocated,
        outstandingBalance,
        customerCredit,
        netReceivable,
        lastActivityDate,
      };
    });
  },

  async getCustomerById(id: string): Promise<Customer | undefined> {
    const customer = await db.customers.get(id);
    if (!customer || customer.isDeleted) return undefined;
    return customer;
  },

  async createCustomer(
    businessId: string,
    data: Omit<Customer, 'id' | 'businessId' | 'createdAt' | 'updatedAt' | 'createdByDeviceId' | 'updatedByDeviceId' | 'version' | 'isDeleted'>
  ): Promise<Customer> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const customerId = generateUniqueId('CUST');

    const customer: Customer = {
      ...data,
      id: customerId,
      businessId,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction('rw', [db.customers, db.syncMetadata], async () => {
      await db.customers.add(customer);
      await db.syncMetadata.add({
        id: generateUniqueId('SYNC'),
        recordId: customer.id,
        recordType: 'customer',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    });

    return customer;
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.customers.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Customer');

    // Sanitize updates to prevent tampering with base immutable fields
    const {
      id: _id,
      businessId: _bId,
      createdAt: _cAt,
      createdByDeviceId: _cDev,
      version: _v,
      ...safeUpdates
    } = updates;

    await db.transaction('rw', [db.customers, db.syncMetadata], async () => {
      await db.customers.update(id, {
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

  async softDeleteCustomer(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.customers.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Customer');

    await db.transaction('rw', [db.customers, db.syncMetadata], async () => {
      await db.customers.update(id, {
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

  async restoreCustomer(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.customers.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Customer');

    await db.transaction('rw', [db.customers, db.syncMetadata], async () => {
      await db.customers.update(id, {
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
