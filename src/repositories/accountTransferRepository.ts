import { db } from '../db/database';
import type {
  AccountTransfer,
  AccountTransferReversal,
  AccountTransferWithDetails,
  FinancialMovement,
  SyncMetadata,
} from '../types';
import { generateInvoiceNumber, generateUniqueId } from '../utils/id';
import { roundCurrency } from '../utils/money';

/**
 * Account Transfer Repository
 *
 * IMMUTABILITY RULE:
 * Transfers and transfer reversals are strictly immutable historical events.
 * A transfer moves funds from a source FinancialAccount to a destination FinancialAccount.
 * It atomically creates:
 * - AccountTransfer record
 * - TRANSFER_OUT FinancialMovement (from source account, direction: OUT)
 * - TRANSFER_IN FinancialMovement (to destination account, direction: IN)
 * Total business liquid funds are conserved (Net change = 0).
 */
export const accountTransferRepository = {
  async getTransfers(businessId: string): Promise<AccountTransferWithDetails[]> {
    const rawTransfers = await db.accountTransfers
      .where('businessId')
      .equals(businessId)
      .filter((t) => !t.isDeleted)
      .reverse()
      .sortBy('transferDate');

    const reversals = await db.accountTransferReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const reversalMap = new Map<string, AccountTransferReversal>();
    for (const r of reversals) {
      reversalMap.set(r.originalTransferId, r);
    }

    const accounts = await db.financialAccounts
      .where('businessId')
      .equals(businessId)
      .toArray();
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    return rawTransfers.map((t) => {
      const reversal = reversalMap.get(t.id);
      return {
        transfer: t,
        reversal,
        isReversed: Boolean(reversal),
        fromAccount: accountMap.get(t.fromAccountId),
        toAccount: accountMap.get(t.toAccountId),
      };
    });
  },

  async getTransferWithDetails(transferId: string): Promise<AccountTransferWithDetails | undefined> {
    const transfer = await db.accountTransfers.get(transferId);
    if (!transfer || transfer.isDeleted) return undefined;

    const reversal = await db.accountTransferReversals
      .where('originalTransferId')
      .equals(transferId)
      .filter((r) => !r.isDeleted)
      .first();

    const fromAccount = await db.financialAccounts.get(transfer.fromAccountId);
    const toAccount = await db.financialAccounts.get(transfer.toAccountId);

    const movements = await db.financialMovements
      .where('referenceId')
      .equals(transferId)
      .filter((m) => m.referenceType === 'TRANSFER' && !m.isDeleted)
      .toArray();

    const outMovement = movements.find((m) => m.direction === 'OUT' && m.accountId === transfer.fromAccountId);
    const inMovement = movements.find((m) => m.direction === 'IN' && m.accountId === transfer.toAccountId);

    return {
      transfer,
      reversal,
      isReversed: Boolean(reversal),
      fromAccount,
      toAccount,
      outMovement,
      inMovement,
    };
  },

  async getNextTransferNumber(businessId: string): Promise<string> {
    const allTransfers = await db.accountTransfers
      .where('businessId')
      .equals(businessId)
      .toArray();

    let maxNumber = 0;
    for (const trf of allTransfers) {
      if (trf.transferNumber) {
        const match = trf.transferNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    }

    const nextSeq = maxNumber + 1;
    return generateInvoiceNumber(nextSeq, 'TRF');
  },

  /**
   * Atomically executes an Account Transfer:
   * Saves AccountTransfer + TRANSFER_OUT movement + TRANSFER_IN movement + Sync Metadata
   */
  async executeAtomicTransfer(
    transfer: AccountTransfer,
    outMovement: FinancialMovement,
    inMovement: FinancialMovement
  ): Promise<void> {
    const now = new Date().toISOString();
    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: transfer.id,
        recordType: 'accountTransfer',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      {
        id: generateUniqueId('SYNC'),
        recordId: outMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      {
        id: generateUniqueId('SYNC'),
        recordId: inMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
    ];

    await db.transaction(
      'rw',
      [db.accountTransfers, db.financialMovements, db.syncMetadata],
      async () => {
        await db.accountTransfers.add(transfer);
        await db.financialMovements.bulkAdd([outMovement, inMovement]);
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );
  },

  /**
   * Atomically executes an Account Transfer Reversal:
   * Saves AccountTransferReversal + Compensating IN movement (to fromAccount) + Compensating OUT movement (from toAccount) + Sync Metadata
   */
  async executeAtomicTransferReversal(
    reversal: AccountTransferReversal,
    compensatingInMovement: FinancialMovement,
    compensatingOutMovement: FinancialMovement
  ): Promise<void> {
    const now = new Date().toISOString();
    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: reversal.id,
        recordType: 'accountTransferReversal',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      {
        id: generateUniqueId('SYNC'),
        recordId: compensatingInMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      {
        id: generateUniqueId('SYNC'),
        recordId: compensatingOutMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
    ];

    await db.transaction(
      'rw',
      [db.accountTransferReversals, db.financialMovements, db.syncMetadata],
      async () => {
        // Atomic duplicate transfer reversal prevention check
        const existing = await db.accountTransferReversals
          .where('originalTransferId')
          .equals(reversal.originalTransferId)
          .filter((r) => !r.isDeleted)
          .first();

        if (existing) {
          throw new Error(`Transfer with ID '${reversal.originalTransferId}' has already been reversed.`);
        }

        await db.accountTransferReversals.add(reversal);
        await db.financialMovements.bulkAdd([compensatingInMovement, compensatingOutMovement]);
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );
  },
};
