import { db } from '../db/database';
import { financialAccountRepository } from '../repositories/financialAccountRepository';
import { financialMovementRepository } from '../repositories/financialMovementRepository';
import type { FinancialMovement, FinancialMovementType, FinancialMovementDirection, Payment, SupplierPayment, Refund, RefundReceived } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency } from '../utils/money';

export interface UnmappedHistoricalTransaction {
  id: string;
  sourceType: 'CUSTOMER_PAYMENT' | 'SUPPLIER_PAYMENT' | 'CUSTOMER_REFUND' | 'SUPPLIER_REFUND';
  referenceNumber: string;
  partyName?: string;
  amount: number;
  date: string;
  paymentMethod: string;
  notes?: string;
  isMapped: boolean;
  mappedAccountId?: string;
  mappedMovementId?: string;
}

/**
 * Legacy Financial Mapping Service
 *
 * HISTORICAL ISOLATION RULE:
 * Historical transactions created before Phase 5 (customer payments, supplier payments, refunds, reversals)
 * MUST NOT be automatically assigned to Cash or any account.
 * They remain LEGACY_UNMAPPED and have 0 impact on FinancialAccount balances.
 * This service provides a deliberate, manual mapping tool to attach a historical transaction to a specific account,
 * creating exactly ONE FinancialMovement and preventing duplicate mappings.
 */
export const legacyFinancialMappingService = {
  /**
   * Retrieves all historical unmapped / mapped transactions for a business
   */
  async getHistoricalTransactions(businessId: string): Promise<UnmappedHistoricalTransaction[]> {
    // 1. Fetch existing financial movements to identify which historical referenceIds are already mapped
    const movements = await db.financialMovements
      .where('businessId')
      .equals(businessId)
      .filter((m) => !m.isDeleted && Boolean(m.referenceId))
      .toArray();

    const mappedReferenceMap = new Map<string, FinancialMovement>();
    for (const m of movements) {
      if (m.referenceId) {
        // Matches either compound key or legacy raw transactionId
        mappedReferenceMap.set(m.referenceId, m);
      }
    }

    const results: UnmappedHistoricalTransaction[] = [];

    // Customer payments
    const custPayments = await db.payments
      .where('businessId')
      .equals(businessId)
      .filter((p) => !p.isDeleted && p.partyType === 'CUSTOMER')
      .toArray();

    for (const p of custPayments) {
      const mappedMov = mappedReferenceMap.get(`CUSTOMER_PAYMENT:${p.id}`) || mappedReferenceMap.get(p.id);
      results.push({
        id: p.id,
        sourceType: 'CUSTOMER_PAYMENT',
        referenceNumber: p.id,
        amount: roundCurrency(p.amount),
        date: p.paymentDate || p.createdAt,
        paymentMethod: p.paymentMethod,
        notes: p.notes,
        isMapped: Boolean(mappedMov),
        mappedAccountId: mappedMov?.accountId,
        mappedMovementId: mappedMov?.id,
      });
    }

    // Supplier payments
    const suppPayments = await db.supplierPayments
      .where('businessId')
      .equals(businessId)
      .filter((sp) => !sp.isDeleted)
      .toArray();

    for (const sp of suppPayments) {
      const mappedMov = mappedReferenceMap.get(`SUPPLIER_PAYMENT:${sp.id}`) || mappedReferenceMap.get(sp.id);
      results.push({
        id: sp.id,
        sourceType: 'SUPPLIER_PAYMENT',
        referenceNumber: sp.id,
        amount: roundCurrency(sp.amount),
        date: sp.paymentDate || sp.createdAt,
        paymentMethod: sp.paymentMethod,
        notes: sp.notes,
        isMapped: Boolean(mappedMov),
        mappedAccountId: mappedMov?.accountId,
        mappedMovementId: mappedMov?.id,
      });
    }

    // Customer refunds
    const custRefunds = await db.refunds
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    for (const r of custRefunds) {
      const mappedMov = mappedReferenceMap.get(`CUSTOMER_REFUND:${r.id}`) || mappedReferenceMap.get(r.id);
      results.push({
        id: r.id,
        sourceType: 'CUSTOMER_REFUND',
        referenceNumber: r.id,
        amount: roundCurrency(r.amount),
        date: r.refundDate || r.createdAt,
        paymentMethod: r.paymentMethod,
        notes: r.notes,
        isMapped: Boolean(mappedMov),
        mappedAccountId: mappedMov?.accountId,
        mappedMovementId: mappedMov?.id,
      });
    }

    // Supplier refunds received
    const suppRefunds = await db.refundsReceived
      .where('businessId')
      .equals(businessId)
      .filter((rr) => !rr.isDeleted)
      .toArray();

    for (const rr of suppRefunds) {
      const mappedMov = mappedReferenceMap.get(`SUPPLIER_REFUND:${rr.id}`) || mappedReferenceMap.get(rr.id);
      results.push({
        id: rr.id,
        sourceType: 'SUPPLIER_REFUND',
        referenceNumber: rr.id,
        amount: roundCurrency(rr.amount),
        date: rr.refundDate || rr.createdAt,
        paymentMethod: rr.paymentMethod,
        notes: rr.notes,
        isMapped: Boolean(mappedMov),
        mappedAccountId: mappedMov?.accountId,
        mappedMovementId: mappedMov?.id,
      });
    }

    return results.sort((a, b) => (b.date > a.date ? 1 : -1));
  },

  /**
   * Checks if a historical transaction is already mapped (fast query)
   */
  async isTransactionMapped(
    sourceType: 'CUSTOMER_PAYMENT' | 'SUPPLIER_PAYMENT' | 'CUSTOMER_REFUND' | 'SUPPLIER_REFUND',
    transactionId: string
  ): Promise<boolean> {
    const compoundKey = `${sourceType}:${transactionId}`;
    const directMatch = await db.financialMovements
      .where('referenceId')
      .equals(compoundKey)
      .filter((m) => !m.isDeleted)
      .first();

    if (directMatch) return true;

    const legacyMatch = await db.financialMovements
      .where('referenceId')
      .equals(transactionId)
      .filter((m) => !m.isDeleted)
      .first();

    return Boolean(legacyMatch);
  },

  /**
   * Deliberately maps a historical transaction to a specific FinancialAccount,
   * creating exactly ONE FinancialMovement and preventing duplicate mappings even across reloads.
   */
  async mapHistoricalTransactionToAccount(
    businessId: string,
    transactionId: string,
    sourceType: 'CUSTOMER_PAYMENT' | 'SUPPLIER_PAYMENT' | 'CUSTOMER_REFUND' | 'SUPPLIER_REFUND',
    targetAccountId: string
  ): Promise<FinancialMovement> {
    const account = await financialAccountRepository.getAccountById(targetAccountId);
    if (!account) {
      throw new Error(`Target account with ID '${targetAccountId}' not found.`);
    }

    const compoundKey = `${sourceType}:${transactionId}`;

    let amount = 0;
    let date = new Date().toISOString();
    let type: FinancialMovementType = 'LEGACY_MAPPING';
    let direction: FinancialMovementDirection = 'IN';
    let description = '';

    if (sourceType === 'CUSTOMER_PAYMENT') {
      const payment = await db.payments.get(transactionId);
      if (!payment || payment.isDeleted) throw new Error('Customer payment not found.');
      amount = payment.amount;
      date = payment.paymentDate || payment.createdAt;
      type = 'CUSTOMER_PAYMENT';
      direction = 'IN';
      description = `Historical customer payment mapped to ${account.name}`;
    } else if (sourceType === 'SUPPLIER_PAYMENT') {
      const payment = await db.supplierPayments.get(transactionId);
      if (!payment || payment.isDeleted) throw new Error('Supplier payment not found.');
      amount = payment.amount;
      date = payment.paymentDate || payment.createdAt;
      type = 'SUPPLIER_PAYMENT';
      direction = 'OUT';
      description = `Historical supplier payment mapped to ${account.name}`;
    } else if (sourceType === 'CUSTOMER_REFUND') {
      const refund = await db.refunds.get(transactionId);
      if (!refund || refund.isDeleted) throw new Error('Customer refund not found.');
      amount = refund.amount;
      date = refund.refundDate || refund.createdAt;
      type = 'REFUND_TO_CUSTOMER';
      direction = 'OUT';
      description = `Historical customer refund mapped to ${account.name}`;
    } else if (sourceType === 'SUPPLIER_REFUND') {
      const refund = await db.refundsReceived.get(transactionId);
      if (!refund || refund.isDeleted) throw new Error('Supplier refund not found.');
      amount = refund.amount;
      date = refund.refundDate || refund.createdAt;
      type = 'REFUND_FROM_SUPPLIER';
      direction = 'IN';
      description = `Historical supplier refund received mapped to ${account.name}`;
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const movement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId,
      accountId: targetAccountId,
      type,
      direction,
      amount: roundCurrency(amount),
      movementDate: date,
      referenceType: 'MANUAL',
      referenceId: compoundKey,
      description,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction('rw', [db.financialMovements, db.syncMetadata], async () => {
      // Atomic duplicate prevention check inside the same transaction
      const existingMatch = await db.financialMovements
        .where('referenceId')
        .equals(compoundKey)
        .filter((m) => !m.isDeleted)
        .first();

      if (existingMatch) {
        throw new Error(`Transaction '${sourceType}:${transactionId}' has already been mapped to an account.`);
      }

      const legacyMatch = await db.financialMovements
        .where('referenceId')
        .equals(transactionId)
        .filter((m) => !m.isDeleted)
        .first();

      if (legacyMatch) {
        throw new Error(`Transaction '${sourceType}:${transactionId}' has already been mapped to an account.`);
      }

      await db.financialMovements.add(movement);
      await db.syncMetadata.add({
        id: generateUniqueId('SYNC'),
        recordId: movement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    });

    return movement;
  },
};
