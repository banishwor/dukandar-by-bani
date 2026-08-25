import { db } from '../db/database';
import { expenseRepository } from '../repositories/expenseRepository';
import { expenseCategoryRepository } from '../repositories/expenseCategoryRepository';
import { financialAccountRepository } from '../repositories/financialAccountRepository';
import { financialMovementRepository } from '../repositories/financialMovementRepository';
import type {
  Expense,
  ExpenseReversal,
  ExpenseWithDetails,
  FinancialMovement,
  ExpenseCategory,
  CreateExpensePayload,
  ReverseExpensePayload,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency } from '../utils/money';

export class ExpenseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpenseValidationError';
  }
}

export const expenseService = {
  async getExpenses(businessId: string): Promise<ExpenseWithDetails[]> {
    return await expenseRepository.getExpenses(businessId);
  },

  async getExpenseWithDetails(expenseId: string): Promise<ExpenseWithDetails | undefined> {
    return await expenseRepository.getExpenseWithDetails(expenseId);
  },

  async getCategories(businessId: string): Promise<ExpenseCategory[]> {
    return await expenseCategoryRepository.getCategories(businessId);
  },

  async createCategory(
    businessId: string,
    data: { name: string; icon?: string; color?: string; isDefault?: boolean }
  ): Promise<ExpenseCategory> {
    if (!data.name || !data.name.trim()) {
      throw new ExpenseValidationError('Category name is required.');
    }
    return await expenseCategoryRepository.createCategory(businessId, data);
  },

  async updateCategory(
    id: string,
    updates: Partial<Pick<ExpenseCategory, 'name' | 'icon' | 'color'>>
  ): Promise<ExpenseCategory> {
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new ExpenseValidationError('Category name cannot be empty.');
    }
    return await expenseCategoryRepository.updateCategory(id, updates);
  },

  async archiveCategory(id: string): Promise<void> {
    await expenseCategoryRepository.archiveCategory(id);
  },

  async restoreCategory(id: string): Promise<void> {
    await expenseCategoryRepository.restoreCategory(id);
  },

  /**
   * Creates an immutable Expense record and an atomic Financial Movement (direction: OUT)
   */
  async createExpense(payload: CreateExpensePayload): Promise<Expense> {
    const amount = roundCurrency(Number(payload.amount) || 0);
    if (amount <= 0) {
      throw new ExpenseValidationError('Expense amount must be greater than 0.');
    }

    const category = await expenseCategoryRepository.getCategoryById(payload.categoryId);
    if (!category) {
      throw new ExpenseValidationError('Selected expense category does not exist.');
    }

    const account = await financialAccountRepository.getAccountById(payload.financialAccountId);
    if (!account) {
      throw new ExpenseValidationError('Selected financial account does not exist.');
    }
    if (account.isArchived) {
      throw new ExpenseValidationError(`Cannot record an expense to archived account "${account.name}".`);
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const expenseDate = payload.expenseDate || now;
    const expenseId = generateUniqueId('EXP');
    const expenseNumber = await expenseRepository.getNextExpenseNumber(payload.businessId);

    const expense: Expense = {
      id: expenseId,
      businessId: payload.businessId,
      expenseNumber,
      categoryId: payload.categoryId,
      categoryNameSnapshot: category.name,
      financialAccountId: payload.financialAccountId,
      accountNameSnapshot: account.name,
      amount,
      paymentMethod: payload.paymentMethod || 'CASH',
      payee: payload.payee?.trim() || undefined,
      expenseDate,
      notes: payload.notes?.trim() || undefined,
      receiptUrl: payload.receiptUrl?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    const movement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId: payload.businessId,
      accountId: payload.financialAccountId,
      type: 'EXPENSE',
      direction: 'OUT',
      amount,
      movementDate: expenseDate,
      referenceType: 'EXPENSE',
      referenceId: expenseId,
      description: `Expense ${expenseNumber}: ${category.name}${payload.payee ? ` (Payee: ${payload.payee})` : ''}`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await expenseRepository.executeAtomicExpense(expense, movement);

    return expense;
  },

  /**
   * Reverses an Expense immutably using a compensating Financial Movement (direction: IN)
   */
  async reverseExpense(payload: ReverseExpensePayload): Promise<ExpenseReversal> {
    const expenseDetails = await expenseRepository.getExpenseWithDetails(payload.expenseId);
    if (!expenseDetails) {
      throw new ExpenseValidationError(`Expense with ID '${payload.expenseId}' not found.`);
    }

    if (expenseDetails.isReversed) {
      throw new ExpenseValidationError(`Expense ${expenseDetails.expense.expenseNumber} is already reversed.`);
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const reversalDate = payload.reversalDate || now;
    const reversalId = generateUniqueId('REV');
    const originalExpense = expenseDetails.expense;

    const reversal: ExpenseReversal = {
      id: reversalId,
      businessId: payload.businessId,
      originalExpenseId: originalExpense.id,
      financialAccountId: originalExpense.financialAccountId,
      amount: originalExpense.amount,
      reason: payload.reason?.trim() || 'Expense Reversal',
      notes: payload.notes?.trim() || undefined,
      reversalDate,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    const compensatingMovement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId: payload.businessId,
      accountId: originalExpense.financialAccountId,
      type: 'EXPENSE_REVERSAL',
      direction: 'IN',
      amount: originalExpense.amount,
      movementDate: reversalDate,
      referenceType: 'EXPENSE_REVERSAL',
      referenceId: reversalId,
      description: `Reversal of Expense ${originalExpense.expenseNumber}${payload.reason ? ` (${payload.reason})` : ''}`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await expenseRepository.executeAtomicExpenseReversal(reversal, compensatingMovement);

    return reversal;
  },
};
