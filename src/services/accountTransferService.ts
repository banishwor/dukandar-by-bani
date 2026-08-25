import { db } from '../db/database';
import { accountTransferRepository } from '../repositories/accountTransferRepository';
import { financialAccountRepository } from '../repositories/financialAccountRepository';
import { financialMovementRepository } from '../repositories/financialMovementRepository';
import type {
  AccountTransfer,
  AccountTransferReversal,
  AccountTransferWithDetails,
  FinancialMovement,
  CreateAccountTransferPayload,
  ReverseAccountTransferPayload,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency, isCurrencyGreaterThan } from '../utils/money';

export class TransferValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferValidationError';
  }
}

export const accountTransferService = {
  async getTransfers(businessId: string): Promise<AccountTransferWithDetails[]> {
    return await accountTransferRepository.getTransfers(businessId);
  },

  async getTransferWithDetails(transferId: string): Promise<AccountTransferWithDetails | undefined> {
    return await accountTransferRepository.getTransferWithDetails(transferId);
  },

  /**
   * Executes an Account Transfer atomically between two accounts.
   * Total business liquid funds are conserved.
   */
  async createTransfer(payload: CreateAccountTransferPayload): Promise<AccountTransfer> {
    const amount = roundCurrency(Number(payload.amount) || 0);
    if (amount <= 0) {
      throw new TransferValidationError('Transfer amount must be greater than 0.');
    }

    if (payload.fromAccountId === payload.toAccountId) {
      throw new TransferValidationError('Source and destination accounts cannot be the same.');
    }

    const fromAccount = await financialAccountRepository.getAccountById(payload.fromAccountId);
    if (!fromAccount) {
      throw new TransferValidationError('Source account not found.');
    }
    if (fromAccount.isArchived) {
      throw new TransferValidationError(`Source account "${fromAccount.name}" is archived.`);
    }

    const toAccount = await financialAccountRepository.getAccountById(payload.toAccountId);
    if (!toAccount) {
      throw new TransferValidationError('Destination account not found.');
    }
    if (toAccount.isArchived) {
      throw new TransferValidationError(`Destination account "${toAccount.name}" is archived.`);
    }

    // Check source account balance
    const sourceBalance = await financialMovementRepository.getAccountDerivedBalance(fromAccount.id);
    if (isCurrencyGreaterThan(amount, sourceBalance)) {
      throw new TransferValidationError(
        `Insufficient funds in ${fromAccount.name}. Available: ₹${sourceBalance.toLocaleString()}, Requested: ₹${amount.toLocaleString()}`
      );
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const transferDate = payload.transferDate || now;
    const transferId = generateUniqueId('TRF');
    const transferNumber = await accountTransferRepository.getNextTransferNumber(payload.businessId);

    const transfer: AccountTransfer = {
      id: transferId,
      businessId: payload.businessId,
      transferNumber,
      fromAccountId: fromAccount.id,
      fromAccountNameSnapshot: fromAccount.name,
      toAccountId: toAccount.id,
      toAccountNameSnapshot: toAccount.name,
      amount,
      transferDate,
      notes: payload.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    const outMovement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId: payload.businessId,
      accountId: fromAccount.id,
      type: 'TRANSFER_OUT',
      direction: 'OUT',
      amount,
      movementDate: transferDate,
      referenceType: 'TRANSFER',
      referenceId: transferId,
      description: `Transfer to ${toAccount.name} (${transferNumber})`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    const inMovement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId: payload.businessId,
      accountId: toAccount.id,
      type: 'TRANSFER_IN',
      direction: 'IN',
      amount,
      movementDate: transferDate,
      referenceType: 'TRANSFER',
      referenceId: transferId,
      description: `Transfer from ${fromAccount.name} (${transferNumber})`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await accountTransferRepository.executeAtomicTransfer(transfer, outMovement, inMovement);

    return transfer;
  },

  /**
   * Reverses an Account Transfer immutably using compensating movements.
   */
  async reverseTransfer(payload: ReverseAccountTransferPayload): Promise<AccountTransferReversal> {
    const details = await accountTransferRepository.getTransferWithDetails(payload.transferId);
    if (!details) {
      throw new TransferValidationError(`Transfer with ID '${payload.transferId}' not found.`);
    }

    if (details.isReversed) {
      throw new TransferValidationError(`Transfer ${details.transfer.transferNumber} is already reversed.`);
    }

    const transfer = details.transfer;

    // Check if destination account has sufficient balance to return funds
    const destinationBalance = await financialMovementRepository.getAccountDerivedBalance(transfer.toAccountId);
    if (isCurrencyGreaterThan(transfer.amount, destinationBalance)) {
      throw new TransferValidationError(
        `Cannot reverse transfer. Destination account "${transfer.toAccountNameSnapshot}" has insufficient funds (Available: ₹${destinationBalance.toLocaleString()}, Transfer Amount: ₹${transfer.amount.toLocaleString()}).`
      );
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const reversalDate = payload.reversalDate || now;
    const reversalId = generateUniqueId('REV');

    const reversal: AccountTransferReversal = {
      id: reversalId,
      businessId: payload.businessId,
      originalTransferId: transfer.id,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amount: transfer.amount,
      reason: payload.reason?.trim() || 'Transfer Reversal',
      notes: payload.notes?.trim() || undefined,
      reversalDate,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // Compensating IN movement back to source account
    const compensatingInMovement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId: payload.businessId,
      accountId: transfer.fromAccountId,
      type: 'TRANSFER_REVERSAL_IN',
      direction: 'IN',
      amount: transfer.amount,
      movementDate: reversalDate,
      referenceType: 'TRANSFER_REVERSAL',
      referenceId: reversalId,
      description: `Reversal return from ${transfer.toAccountNameSnapshot} (${transfer.transferNumber})`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // Compensating OUT movement from destination account
    const compensatingOutMovement: FinancialMovement = {
      id: generateUniqueId('MOV'),
      businessId: payload.businessId,
      accountId: transfer.toAccountId,
      type: 'TRANSFER_REVERSAL_OUT',
      direction: 'OUT',
      amount: transfer.amount,
      movementDate: reversalDate,
      referenceType: 'TRANSFER_REVERSAL',
      referenceId: reversalId,
      description: `Reversal debit back to ${transfer.fromAccountNameSnapshot} (${transfer.transferNumber})`,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await accountTransferRepository.executeAtomicTransferReversal(
      reversal,
      compensatingInMovement,
      compensatingOutMovement
    );

    return reversal;
  },
};
