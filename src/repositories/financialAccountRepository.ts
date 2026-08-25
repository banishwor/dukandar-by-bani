import { db } from '../db/database';
import type {
  FinancialAccount,
  FinancialAccountWithBalance,
  FinancialMovement,
  SyncMetadata,
  CreateFinancialAccountPayload,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';
import { financialMovementRepository } from './financialMovementRepository';
import { roundCurrency } from '../utils/money';
import { formatCurrency } from '../utils/formatters';

/**
 * Financial Account Repository
 *
 * MUTABILITY & LEDGER RULES:
 * FinancialAccount is a mutable master data record (name, notes, isDefault, isArchived increment version).
 * Accounts DO NOT store a mutable balance field. Balance is always derived from the append-only FinancialMovements.
 * Creating an account with an opening balance atomically creates:
 * FinancialAccount + OPENING_BALANCE FinancialMovement + SyncMetadata.
 */
export const financialAccountRepository = {
  async getAccounts(businessId: string): Promise<FinancialAccount[]> {
    return await db.financialAccounts
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted)
      .sortBy('name');
  },

  async getActiveAccounts(businessId: string): Promise<FinancialAccount[]> {
    return await db.financialAccounts
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted && !a.isArchived)
      .sortBy('name');
  },

  async getDefaultAccount(businessId: string): Promise<FinancialAccount | undefined> {
    return await db.financialAccounts
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted && !a.isArchived && a.isDefault)
      .first();
  },

  async getAccountById(id: string): Promise<FinancialAccount | undefined> {
    const acc = await db.financialAccounts.get(id);
    if (!acc || acc.isDeleted) return undefined;
    return acc;
  },

  async getAccountsWithBalance(businessId: string): Promise<FinancialAccountWithBalance[]> {
    const accounts = await this.getAccounts(businessId);
    const balanceMap = await financialMovementRepository.getAllAccountBalances(businessId);

    return accounts.map((acc) => {
      const summary = balanceMap[acc.id] || {
        derivedBalance: 0,
        totalIn: 0,
        totalOut: 0,
        movementCount: 0,
        lastMovementDate: acc.createdAt,
      };

      return {
        ...acc,
        derivedBalance: summary.derivedBalance,
        totalIn: summary.totalIn,
        totalOut: summary.totalOut,
        movementCount: summary.movementCount,
        lastMovementDate: summary.lastMovementDate || acc.createdAt,
      };
    });
  },

  async getAccountBalance(accountId: string): Promise<number> {
    return await financialMovementRepository.getAccountDerivedBalance(accountId);
  },

  async createAccount(
    businessId: string,
    payload: CreateFinancialAccountPayload
  ): Promise<{ account: FinancialAccount; movement?: FinancialMovement }> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const accountId = generateUniqueId('ACC');
    const openingBalance = roundCurrency(Math.max(0, Number(payload.openingBalance) || 0));

    // Check if this is the first account for the business; if so, make it default automatically
    const existingAccounts = await db.financialAccounts
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted)
      .count();

    const isDefault = payload.isDefault !== undefined ? payload.isDefault : existingAccounts === 0;

    const account: FinancialAccount = {
      id: accountId,
      businessId,
      name: payload.name.trim(),
      type: payload.type,
      accountNumberLast4: payload.accountNumberLast4?.trim() || undefined,
      bankName: payload.bankName?.trim() || undefined,
      notes: payload.notes?.trim() || undefined,
      isDefault,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    let openingMovement: FinancialMovement | undefined;

    await db.transaction(
      'rw',
      [db.financialAccounts, db.financialMovements, db.syncMetadata],
      async () => {
        // If this account is set as default, remove isDefault from existing accounts
        if (isDefault) {
          const currentDefaults = await db.financialAccounts
            .where('businessId')
            .equals(businessId)
            .filter((a) => !a.isDeleted && a.isDefault)
            .toArray();

          for (const defAcc of currentDefaults) {
            const nextVer = getNextRecordVersion(defAcc, 'FinancialAccount');
            await db.financialAccounts.update(defAcc.id, {
              isDefault: false,
              updatedAt: now,
              updatedByDeviceId: deviceId,
              version: nextVer,
            });
            await db.syncMetadata.where('recordId').equals(defAcc.id).modify({
              updatedAt: now,
              syncState: 'LOCAL_ONLY',
            });
          }
        }

        // Add Account
        await db.financialAccounts.add(account);
        await db.syncMetadata.add({
          id: generateUniqueId('SYNC'),
          recordId: account.id,
          recordType: 'financialAccount',
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        });

        // Add OPENING_BALANCE Movement if openingBalance > 0
        if (openingBalance > 0) {
          openingMovement = {
            id: generateUniqueId('MOV'),
            businessId,
            accountId: account.id,
            type: 'OPENING_BALANCE',
            direction: 'IN',
            amount: openingBalance,
            movementDate: now,
            referenceType: 'MANUAL',
            description: `Opening balance for ${account.name}`,
            createdAt: now,
            createdByDeviceId: deviceId,
            version: 1,
            isDeleted: false,
          };

          await db.financialMovements.add(openingMovement);
          await db.syncMetadata.add({
            id: generateUniqueId('SYNC'),
            recordId: openingMovement.id,
            recordType: 'financialMovement',
            syncState: 'LOCAL_ONLY',
            lastSyncedVersion: 0,
            updatedAt: now,
            version: 1,
          });
        }
      }
    );

    return { account, movement: openingMovement };
  },

  async updateAccount(
    id: string,
    updates: Partial<Pick<FinancialAccount, 'name' | 'type' | 'accountNumberLast4' | 'bankName' | 'notes' | 'isDefault'>>
  ): Promise<FinancialAccount> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.financialAccounts.get(id);

    if (!existing) {
      throw new Error(`Financial account with ID ${id} not found.`);
    }

    const nextVersion = getNextRecordVersion(existing, 'FinancialAccount');

    await db.transaction('rw', [db.financialAccounts, db.syncMetadata], async () => {
      if (updates.isDefault) {
        const currentDefaults = await db.financialAccounts
          .where('businessId')
          .equals(existing.businessId)
          .filter((a) => !a.isDeleted && a.isDefault && a.id !== id)
          .toArray();

        for (const defAcc of currentDefaults) {
          const nextVer = getNextRecordVersion(defAcc, 'FinancialAccount');
          await db.financialAccounts.update(defAcc.id, {
            isDefault: false,
            updatedAt: now,
            updatedByDeviceId: deviceId,
            version: nextVer,
          });
          await db.syncMetadata.where('recordId').equals(defAcc.id).modify({
            updatedAt: now,
            syncState: 'LOCAL_ONLY',
          });
        }
      }

      await db.financialAccounts.update(id, {
        ...updates,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata.where('recordId').equals(id).modify({
        updatedAt: now,
        syncState: 'LOCAL_ONLY',
      });
    });

    return (await db.financialAccounts.get(id))!;
  },

  async setDefaultAccount(businessId: string, accountId: string): Promise<void> {
    await this.updateAccount(accountId, { isDefault: true });
  },

  async archiveAccount(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.financialAccounts.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'FinancialAccount');

    await db.transaction('rw', [db.financialAccounts, db.syncMetadata], async () => {
      await db.financialAccounts.update(id, {
        isArchived: true,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata.where('recordId').equals(id).modify({
        updatedAt: now,
        syncState: 'LOCAL_ONLY',
      });
    });
  },

  async restoreAccount(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.financialAccounts.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'FinancialAccount');

    await db.transaction('rw', [db.financialAccounts, db.syncMetadata], async () => {
      await db.financialAccounts.update(id, {
        isArchived: false,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata.where('recordId').equals(id).modify({
        updatedAt: now,
        syncState: 'LOCAL_ONLY',
      });
    });
  },

  async softDeleteAccount(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.financialAccounts.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'FinancialAccount');

    await db.transaction('rw', [db.financialAccounts, db.syncMetadata], async () => {
      await db.financialAccounts.update(id, {
        isDeleted: true,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata.where('recordId').equals(id).modify({
        updatedAt: now,
        syncState: 'LOCAL_ONLY',
      });
    });
  },

  /**
   * Auditable Opening Balance Correction:
   * Keeps original OPENING_BALANCE movement strictly immutable.
   * Creates an append-only ADJUSTMENT movement for the difference.
   */
  async correctOpeningBalance(
    businessId: string,
    accountId: string,
    newOpeningBalance: number,
    reason?: string
  ): Promise<FinancialMovement | undefined> {
    const account = await this.getAccountById(accountId);
    if (!account) {
      throw new Error(`Financial account with ID '${accountId}' not found.`);
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const targetBalance = roundCurrency(Math.max(0, newOpeningBalance));

    // Find all existing OPENING_BALANCE / initial opening adjustment movements for this account
    const openingMovements = await db.financialMovements
      .where('accountId')
      .equals(accountId)
      .filter(
        (m) =>
          !m.isDeleted &&
          (m.type === 'OPENING_BALANCE' ||
            (m.type === 'ADJUSTMENT' && Boolean(m.description?.startsWith('Opening balance correction'))))
      )
      .toArray();

    let currentEffectiveOpening = 0;
    for (const m of openingMovements) {
      currentEffectiveOpening += m.direction === 'IN' ? m.amount : -m.amount;
    }
    currentEffectiveOpening = roundCurrency(currentEffectiveOpening);

    const delta = roundCurrency(targetBalance - currentEffectiveOpening);
    if (Math.abs(delta) < 0.005) {
      return undefined; // No change needed
    }

    const adjustmentMovement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId,
      accountId,
      type: 'ADJUSTMENT',
      direction: delta > 0 ? 'IN' : 'OUT',
      amount: Math.abs(delta),
      movementDate: now,
      referenceType: 'MANUAL',
      description: `Opening balance correction (${delta > 0 ? '+' : '-'}${formatCurrency(Math.abs(delta))}): ${reason || 'User correction'}`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction('rw', [db.financialMovements, db.syncMetadata], async () => {
      await db.financialMovements.add(adjustmentMovement);
      await db.syncMetadata.add({
        id: generateUniqueId('SYNC'),
        recordId: adjustmentMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    });

    return adjustmentMovement;
  },
};
