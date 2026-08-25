import { db } from '../db/database';
import type { Payment } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';

/**
 * Payments Repository
 *
 * IMMUTABILITY RULE:
 * Completed payments are financial ledger entries. Critical financial fields (amount, partyId,
 * referenceId, paymentMethod, paymentDate) must NEVER be updated or deleted through generic methods.
 * Any future corrections must be recorded using dedicated reversal/adjustment transactions.
 */
export const paymentRepository = {
  async getPayments(businessId: string): Promise<Payment[]> {
    return await db.payments
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted)
      .sortBy('paymentDate');
  },

  async getPaymentById(id: string): Promise<Payment | undefined> {
    const payment = await db.payments.get(id);
    if (!payment || payment.isDeleted) return undefined;
    return payment;
  },

  async getPaymentsByCustomer(customerId: string): Promise<Payment[]> {
    return await db.payments
      .where('partyId')
      .equals(customerId)
      .filter((p) => !p.isDeleted)
      .toArray();
  },

  async getPaymentsBySale(saleId: string): Promise<Payment[]> {
    return await db.payments
      .where('referenceId')
      .equals(saleId)
      .filter((p) => !p.isDeleted)
      .toArray();
  },

  async createPayment(
    businessId: string,
    data: Omit<Payment, 'id' | 'businessId' | 'createdAt' | 'updatedAt' | 'createdByDeviceId' | 'updatedByDeviceId' | 'version' | 'isDeleted'>
  ): Promise<Payment> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const paymentId = generateUniqueId('PAY');

    const payment: Payment = {
      ...data,
      id: paymentId,
      businessId,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction('rw', [db.payments, db.syncMetadata], async () => {
      await db.payments.add(payment);
      await db.syncMetadata.add({
        id: generateUniqueId('SYNC'),
        recordId: payment.id,
        recordType: 'payment',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    });

    return payment;
  },

  /**
   * Safe Non-Financial Update:
   * Only allows modifying auxiliary notes. Core financial fields remain strictly immutable.
   */
  async updatePaymentNotes(id: string, notes: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.payments.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Payment');

    await db.transaction('rw', [db.payments, db.syncMetadata], async () => {
      await db.payments.update(id, {
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
