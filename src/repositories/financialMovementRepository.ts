import { db } from '../db/database';
import type { FinancialMovement, FinancialMovementType, FinancialMovementDirection, SyncMetadata } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency, addCurrency, subtractCurrency } from '../utils/money';

/**
 * Financial Movement Repository
 *
 * IMMUTABILITY RULE:
 * Financial movements are strictly append-only immutable ledger events.
 * They represent the single source of truth for all liquid funds (Cash, Bank, UPI, Wallets).
 * Never expose update or delete methods for financial movements.
 * Account balance is ALWAYS derived: SUM(IN movements) - SUM(OUT movements).
 */
export const financialMovementRepository = {
  async getMovementsByAccount(accountId: string): Promise<FinancialMovement[]> {
    return await db.financialMovements
      .where('accountId')
      .equals(accountId)
      .filter((m) => !m.isDeleted)
      .reverse()
      .sortBy('movementDate');
  },

  async getMovementsForAccount(accountId: string): Promise<FinancialMovement[]> {
    return this.getMovementsByAccount(accountId);
  },

  async getMovementsByBusiness(businessId: string): Promise<FinancialMovement[]> {
    return await db.financialMovements
      .where('businessId')
      .equals(businessId)
      .filter((m) => !m.isDeleted)
      .reverse()
      .sortBy('movementDate');
  },

  async getMovementsForReference(
    businessId: string,
    referenceType: string,
    referenceId: string
  ): Promise<FinancialMovement[]> {
    return await db.financialMovements
      .where('businessId')
      .equals(businessId)
      .filter(
        (m) =>
          !m.isDeleted &&
          m.referenceType === referenceType &&
          m.referenceId === referenceId
      )
      .toArray();
  },

  async getAccountDerivedBalance(accountId: string): Promise<number> {
    const movements = await db.financialMovements
      .where('accountId')
      .equals(accountId)
      .filter((m) => !m.isDeleted)
      .toArray();

    let totalIn = 0;
    let totalOut = 0;

    for (const m of movements) {
      const amt = Number(m.amount) || 0;
      if (m.direction === 'IN') {
        totalIn += amt;
      } else if (m.direction === 'OUT') {
        totalOut += amt;
      }
    }

    return roundCurrency(totalIn - totalOut);
  },

  async getDerivedBalanceForAccount(accountId: string): Promise<number> {
    return this.getAccountDerivedBalance(accountId);
  },

  /**
   * Computes derived balances, totalIn, totalOut, movementCount, and lastActivity for all accounts of a business
   */
  async getAllAccountBalances(businessId: string): Promise<
    Record<
      string,
      {
        derivedBalance: number;
        totalIn: number;
        totalOut: number;
        movementCount: number;
        lastMovementDate?: string;
      }
    >
  > {
    const movements = await db.financialMovements
      .where('businessId')
      .equals(businessId)
      .filter((m) => !m.isDeleted)
      .toArray();

    const summaryMap: Record<
      string,
      {
        totalIn: number;
        totalOut: number;
        movementCount: number;
        lastMovementDate?: string;
      }
    > = {};

    for (const m of movements) {
      if (!summaryMap[m.accountId]) {
        summaryMap[m.accountId] = {
          totalIn: 0,
          totalOut: 0,
          movementCount: 0,
        };
      }

      const accSummary = summaryMap[m.accountId];
      accSummary.movementCount += 1;

      const amt = Number(m.amount) || 0;
      if (m.direction === 'IN') {
        accSummary.totalIn += amt;
      } else if (m.direction === 'OUT') {
        accSummary.totalOut += amt;
      }

      const mDate = m.movementDate || m.createdAt;
      if (!accSummary.lastMovementDate || (mDate && mDate > accSummary.lastMovementDate)) {
        accSummary.lastMovementDate = mDate;
      }
    }

    const resultMap: Record<
      string,
      {
        derivedBalance: number;
        totalIn: number;
        totalOut: number;
        movementCount: number;
        lastMovementDate?: string;
      }
    > = {};

    for (const [accountId, data] of Object.entries(summaryMap)) {
      resultMap[accountId] = {
        derivedBalance: roundCurrency(data.totalIn - data.totalOut),
        totalIn: roundCurrency(data.totalIn),
        totalOut: roundCurrency(data.totalOut),
        movementCount: data.movementCount,
        lastMovementDate: data.lastMovementDate,
      };
    }

    return resultMap;
  },

  /**
   * Atomically records a standalone Financial Movement with Sync Metadata
   */
  async createMovement(
    businessId: string,
    accountId: string,
    type: FinancialMovementType,
    direction: FinancialMovementDirection,
    amount: number,
    movementDate: string,
    referenceType?: 'EXPENSE' | 'EXPENSE_REVERSAL' | 'TRANSFER' | 'TRANSFER_REVERSAL' | 'PAYMENT' | 'SUPPLIER_PAYMENT' | 'REFUND' | 'REFUND_RECEIVED' | 'MANUAL',
    referenceId?: string,
    description?: string
  ): Promise<FinancialMovement> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const movementId = generateUniqueId('MOV');
    const roundedAmount = roundCurrency(amount);

    const movement: FinancialMovement = {
      id: movementId,
      businessId,
      accountId,
      type,
      direction,
      amount: roundedAmount,
      movementDate: movementDate || now,
      referenceType,
      referenceId,
      description,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction('rw', [db.financialMovements, db.syncMetadata], async () => {
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
