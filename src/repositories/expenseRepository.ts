import { db } from '../db/database';
import type {
  Expense,
  ExpenseReversal,
  ExpenseWithDetails,
  FinancialMovement,
  SyncMetadata,
} from '../types';
import { generateInvoiceNumber, generateUniqueId } from '../utils/id';
import { roundCurrency } from '../utils/money';

/**
 * Expense Repository
 *
 * IMMUTABILITY RULE:
 * Expenses and expense reversals are strictly immutable historical records.
 * An expense amount must NEVER be edited in place.
 * Any correction must be performed via an ExpenseReversal which creates a compensating FinancialMovement (direction: IN).
 */
export const expenseRepository = {
  async getExpenses(businessId: string): Promise<ExpenseWithDetails[]> {
    const rawExpenses = await db.expenses
      .where('businessId')
      .equals(businessId)
      .filter((e) => !e.isDeleted)
      .reverse()
      .sortBy('expenseDate');

    const reversals = await db.expenseReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const reversalMap = new Map<string, ExpenseReversal>();
    for (const r of reversals) {
      reversalMap.set(r.originalExpenseId, r);
    }

    const accounts = await db.financialAccounts
      .where('businessId')
      .equals(businessId)
      .toArray();
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    const categories = await db.expenseCategories
      .where('businessId')
      .equals(businessId)
      .toArray();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return rawExpenses.map((exp) => {
      const reversal = reversalMap.get(exp.id);
      return {
        expense: exp,
        reversal,
        isReversed: Boolean(reversal),
        account: accountMap.get(exp.financialAccountId),
        category: categoryMap.get(exp.categoryId),
      };
    });
  },

  async getExpenseWithDetails(expenseId: string): Promise<ExpenseWithDetails | undefined> {
    const expense = await db.expenses.get(expenseId);
    if (!expense || expense.isDeleted) return undefined;

    const reversal = await db.expenseReversals
      .where('originalExpenseId')
      .equals(expenseId)
      .filter((r) => !r.isDeleted)
      .first();

    const account = await db.financialAccounts.get(expense.financialAccountId);
    const category = await db.expenseCategories.get(expense.categoryId);

    const movement = await db.financialMovements
      .where('referenceId')
      .equals(expenseId)
      .filter((m) => m.referenceType === 'EXPENSE' && !m.isDeleted)
      .first();

    return {
      expense,
      reversal,
      isReversed: Boolean(reversal),
      account,
      category,
      movement,
    };
  },

  async getNextExpenseNumber(businessId: string): Promise<string> {
    const allExpenses = await db.expenses
      .where('businessId')
      .equals(businessId)
      .toArray();

    let maxNumber = 0;
    for (const exp of allExpenses) {
      if (exp.expenseNumber) {
        const match = exp.expenseNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    }

    const nextSeq = maxNumber + 1;
    return generateInvoiceNumber(nextSeq, 'EXP');
  },

  /**
   * Atomically saves an Expense and its corresponding Financial Movement (direction: OUT)
   */
  async executeAtomicExpense(expense: Expense, movement: FinancialMovement): Promise<void> {
    const now = new Date().toISOString();
    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: expense.id,
        recordType: 'expense',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      {
        id: generateUniqueId('SYNC'),
        recordId: movement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
    ];

    await db.transaction(
      'rw',
      [db.expenses, db.financialMovements, db.syncMetadata],
      async () => {
        await db.expenses.add(expense);
        await db.financialMovements.add(movement);
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );
  },

  /**
   * Atomically saves an ExpenseReversal and its compensating Financial Movement (direction: IN)
   */
  async executeAtomicExpenseReversal(
    reversal: ExpenseReversal,
    compensatingMovement: FinancialMovement
  ): Promise<void> {
    const now = new Date().toISOString();
    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: reversal.id,
        recordType: 'expenseReversal',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      {
        id: generateUniqueId('SYNC'),
        recordId: compensatingMovement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
    ];

    await db.transaction(
      'rw',
      [db.expenseReversals, db.financialMovements, db.syncMetadata],
      async () => {
        // Atomic duplicate reversal prevention check
        const existing = await db.expenseReversals
          .where('originalExpenseId')
          .equals(reversal.originalExpenseId)
          .filter((r) => !r.isDeleted)
          .first();

        if (existing) {
          throw new Error(`Expense with ID '${reversal.originalExpenseId}' has already been reversed.`);
        }

        await db.expenseReversals.add(reversal);
        await db.financialMovements.add(compensatingMovement);
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );
  },
};
