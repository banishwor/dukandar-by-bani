import { db } from '../db/database';
import type { PaymentAllocation } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';

/**
 * Payment Allocations Repository
 *
 * IMMUTABILITY RULE:
 * Payment allocations are atomic financial accounting links between payments and sales.
 * Their financial links (paymentId, saleId, customerId, amount) are immutable.
 */
export const paymentAllocationRepository = {
  async getAllocations(businessId: string): Promise<PaymentAllocation[]> {
    return await db.paymentAllocations
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted)
      .sortBy('createdAt');
  },

  async getAllocationsByPayment(paymentId: string): Promise<PaymentAllocation[]> {
    return await db.paymentAllocations
      .where('paymentId')
      .equals(paymentId)
      .filter((a) => !a.isDeleted)
      .toArray();
  },

  async getAllocationsBySale(saleId: string): Promise<PaymentAllocation[]> {
    return await db.paymentAllocations
      .where('saleId')
      .equals(saleId)
      .filter((a) => !a.isDeleted)
      .toArray();
  },

  async getAllocationsByCustomer(customerId: string): Promise<PaymentAllocation[]> {
    return await db.paymentAllocations
      .where('customerId')
      .equals(customerId)
      .filter((a) => !a.isDeleted)
      .toArray();
  },

  async createAllocation(
    businessId: string,
    data: Omit<PaymentAllocation, 'id' | 'businessId' | 'createdAt' | 'updatedAt' | 'createdByDeviceId' | 'updatedByDeviceId' | 'version' | 'isDeleted'>
  ): Promise<PaymentAllocation> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const allocationId = generateUniqueId('ALLOC');

    const allocation: PaymentAllocation = {
      ...data,
      id: allocationId,
      businessId,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction('rw', [db.paymentAllocations, db.syncMetadata], async () => {
      await db.paymentAllocations.add(allocation);
      await db.syncMetadata.add({
        id: generateUniqueId('SYNC'),
        recordId: allocation.id,
        recordType: 'paymentAllocation',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    });

    return allocation;
  },
};
