import { financialAccountRepository } from '../repositories/financialAccountRepository';
import { financialMovementRepository } from '../repositories/financialMovementRepository';
import type {
  FinancialAccount,
  FinancialAccountWithBalance,
  FinancialMovement,
  CreateFinancialAccountPayload,
} from '../types';
import { roundCurrency, addCurrency } from '../utils/money';

export const financialAccountService = {
  async getAccountsWithBalance(businessId: string): Promise<FinancialAccountWithBalance[]> {
    return await financialAccountRepository.getAccountsWithBalance(businessId);
  },

  async getActiveAccounts(businessId: string): Promise<FinancialAccount[]> {
    return await financialAccountRepository.getActiveAccounts(businessId);
  },

  async getDefaultAccount(businessId: string): Promise<FinancialAccount | undefined> {
    return await financialAccountRepository.getDefaultAccount(businessId);
  },

  /**
   * Resolves a valid, active FinancialAccount for a business transaction:
   * 1. If financialAccountId is provided, verifies it exists, belongs to businessId, and is active.
   * 2. If not provided, falls back to the default account.
   * 3. If no default account exists, falls back to the first active account.
   * 4. If no active accounts exist, throws an error directing the user to create/restore an account.
   */
  async resolveActiveAccount(businessId: string, financialAccountId?: string): Promise<FinancialAccount> {
    if (financialAccountId) {
      const account = await financialAccountRepository.getAccountById(financialAccountId);
      if (!account || account.businessId !== businessId) {
        throw new Error(`Financial account '${financialAccountId}' was not found for this business.`);
      }
      if (account.isArchived) {
        throw new Error(`Financial account '${account.name}' is archived and cannot be used for new transactions.`);
      }
      return account;
    }

    const defaultAcc = await financialAccountRepository.getDefaultAccount(businessId);
    if (defaultAcc && !defaultAcc.isArchived && !defaultAcc.isDeleted) {
      return defaultAcc;
    }

    const activeAccounts = await financialAccountRepository.getActiveAccounts(businessId);
    if (activeAccounts.length > 0) {
      return activeAccounts[0];
    }

    throw new Error('No active financial account available. Please create or restore a financial account to record monetary transactions.');
  },

  async getAccountDetailsWithMovements(accountId: string): Promise<{
    account: FinancialAccount;
    derivedBalance: number;
    movements: FinancialMovement[];
  } | undefined> {
    const account = await financialAccountRepository.getAccountById(accountId);
    if (!account) return undefined;

    const [derivedBalance, movements] = await Promise.all([
      financialMovementRepository.getAccountDerivedBalance(accountId),
      financialMovementRepository.getMovementsByAccount(accountId),
    ]);

    return {
      account,
      derivedBalance,
      movements,
    };
  },

  async createAccount(
    businessId: string,
    payload: CreateFinancialAccountPayload
  ): Promise<{ account: FinancialAccount; movement?: FinancialMovement }> {
    if (!payload.name || !payload.name.trim()) {
      throw new Error('Account name is required.');
    }

    if (payload.openingBalance !== undefined && payload.openingBalance < 0) {
      throw new Error('Opening balance cannot be negative.');
    }

    return await financialAccountRepository.createAccount(businessId, payload);
  },

  async updateAccount(
    id: string,
    updates: Partial<Pick<FinancialAccount, 'name' | 'type' | 'accountNumberLast4' | 'bankName' | 'notes' | 'isDefault'>>
  ): Promise<FinancialAccount> {
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Account name cannot be empty.');
    }

    return await financialAccountRepository.updateAccount(id, updates);
  },

  async setDefaultAccount(businessId: string, accountId: string): Promise<void> {
    const acc = await financialAccountRepository.getAccountById(accountId);
    if (!acc) {
      throw new Error('Account not found.');
    }
    if (acc.isArchived) {
      throw new Error('Cannot set an archived account as default.');
    }
    await financialAccountRepository.setDefaultAccount(businessId, accountId);
  },

  async archiveAccount(id: string): Promise<void> {
    const acc = await financialAccountRepository.getAccountById(id);
    if (!acc) {
      throw new Error('Account not found.');
    }
    if (acc.isDefault) {
      throw new Error('Cannot archive the default account. Please set another account as default first.');
    }

    const allAccounts = await financialAccountRepository.getAccounts(acc.businessId);
    const activeAccounts = allAccounts.filter((a) => !a.isArchived);
    if (activeAccounts.length <= 1) {
      throw new Error('Cannot archive the only active financial account for this business.');
    }

    await financialAccountRepository.archiveAccount(id);
  },

  async restoreAccount(id: string): Promise<void> {
    await financialAccountRepository.restoreAccount(id);
  },

  async correctOpeningBalance(
    businessId: string,
    accountId: string,
    newOpeningBalance: number,
    reason?: string
  ): Promise<FinancialMovement | undefined> {
    if (newOpeningBalance < 0) {
      throw new Error('Opening balance cannot be negative.');
    }
    return await financialAccountRepository.correctOpeningBalance(businessId, accountId, newOpeningBalance, reason);
  },

  /**
   * Calculates total liquid funds aggregated across all active non-archived financial accounts
   */
  async getTotalLiquidFunds(businessId: string): Promise<{
    totalBalance: number;
    cashBalance: number;
    bankBalance: number;
    otherBalance: number;
  }> {
    const accounts = await financialAccountRepository.getAccountsWithBalance(businessId);
    const activeAccounts = accounts.filter((a) => !a.isArchived);

    let totalBalance = 0;
    let cashBalance = 0;
    let bankBalance = 0;
    let otherBalance = 0;

    for (const a of activeAccounts) {
      totalBalance = addCurrency(totalBalance, a.derivedBalance);
      if (a.type === 'CASH') {
        cashBalance = addCurrency(cashBalance, a.derivedBalance);
      } else if (a.type === 'BANK' || a.type === 'UPI') {
        bankBalance = addCurrency(bankBalance, a.derivedBalance);
      } else {
        otherBalance = addCurrency(otherBalance, a.derivedBalance);
      }
    }

    return {
      totalBalance: roundCurrency(totalBalance),
      cashBalance: roundCurrency(cashBalance),
      bankBalance: roundCurrency(bankBalance),
      otherBalance: roundCurrency(otherBalance),
    };
  },
};
