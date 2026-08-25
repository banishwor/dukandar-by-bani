import { db } from '../db/database';
import { financialAccountService } from './financialAccountService';
import type {
  Payment,
  PaymentAllocation,
  ReceivePaymentPayload,
  OutstandingInvoice,
  CustomerFinancialSummary,
  CustomerStatementEntry,
  SyncMetadata,
  PaymentMethod,
  FinancialMovement,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency, subtractCurrency, addCurrency, isCurrencyGreaterThan } from '../utils/money';

// Concurrency lock to prevent duplicate payment submissions
const activePaymentSubmissions = new Set<string>();

export class PaymentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentValidationError';
  }
}

export const paymentService = {
  /**
   * Retrieves outstanding invoices for a customer with live-calculated due amounts based on allocations and returns.
   * Sorted oldest first (FIFO order). Voided invoices are excluded.
   */
  async getOutstandingInvoicesForCustomer(customerId: string): Promise<OutstandingInvoice[]> {
    const sales = await db.sales
      .where('customerId')
      .equals(customerId)
      .filter((s) => !s.isDeleted)
      .toArray();

    const saleIds = new Set(sales.map((s) => s.id));

    const voids = await db.saleVoids
      .filter((v) => !v.isDeleted && saleIds.has(v.originalSaleId))
      .toArray();
    const voidSaleIds = new Set(voids.map((v) => v.originalSaleId));

    const returns = await db.saleReturns
      .filter((r) => !r.isDeleted && saleIds.has(r.originalSaleId))
      .toArray();

    const returnSumBySale = new Map<string, number>();
    for (const r of returns) {
      const current = returnSumBySale.get(r.originalSaleId) || 0;
      returnSumBySale.set(r.originalSaleId, current + (Number(r.totalAmount) || 0));
    }

    const allocations = await db.paymentAllocations
      .where('customerId')
      .equals(customerId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const reversals = await db.paymentReversals.filter((r) => !r.isDeleted).toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const outstanding: OutstandingInvoice[] = [];

    for (const sale of sales) {
      // Skip voided sales
      if (voidSaleIds.has(sale.id)) continue;

      const totalReturned = returnSumBySale.get(sale.id) || 0;
      const effectiveTotalAmount = roundCurrency(Math.max(0, (Number(sale.totalAmount) || 0) - totalReturned));

      if (effectiveTotalAmount <= 0.005) continue; // Fully returned

      const saleAllocations = allocations.filter(
        (a) => a.saleId === sale.id && !reversedPaymentIds.has(a.paymentId)
      );
      const paidAmount = roundCurrency(
        saleAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
      );
      const dueAmount = roundCurrency(Math.max(0, effectiveTotalAmount - paidAmount));

      if (dueAmount > 0.005) {
        outstanding.push({
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          saleDate: sale.saleDate || sale.createdAt,
          totalAmount: effectiveTotalAmount,
          paidAmount,
          dueAmount,
          status: paidAmount > 0 ? 'PARTIAL' : 'UNPAID',
        });
      }
    }

    // Sort oldest first for FIFO allocation
    outstanding.sort((a, b) => new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime());
    return outstanding;
  },

  /**
   * Computes accurate financial summary for a customer taking into account sales, returns, voids, payments, reversals, and refunds.
   */
  async getCustomerFinancialSummary(customerId: string): Promise<CustomerFinancialSummary> {
    const customer = await db.customers.get(customerId);
    if (!customer) {
      throw new PaymentValidationError(`Customer with ID ${customerId} not found.`);
    }

    const sales = await db.sales
      .where('customerId')
      .equals(customerId)
      .filter((s) => !s.isDeleted)
      .toArray();

    const saleIds = new Set(sales.map((s) => s.id));

    const voids = await db.saleVoids
      .filter((v) => !v.isDeleted && (v.customerId === customerId || saleIds.has(v.originalSaleId)))
      .toArray();
    const voidSaleIds = new Set(voids.map((v) => v.originalSaleId));

    const returns = await db.saleReturns
      .filter((r) => !r.isDeleted && (r.customerId === customerId || saleIds.has(r.originalSaleId)))
      .toArray();

    const returnSumBySale = new Map<string, number>();
    for (const r of returns) {
      const current = returnSumBySale.get(r.originalSaleId) || 0;
      returnSumBySale.set(r.originalSaleId, current + (Number(r.totalAmount) || 0));
    }

    const payments = await db.payments
      .where('partyId')
      .equals(customerId)
      .filter((p) => !p.isDeleted && p.partyType === 'CUSTOMER')
      .toArray();

    const reversals = await db.paymentReversals
      .filter((r) => !r.isDeleted && (r.customerId === customerId || payments.some((p) => p.id === r.originalPaymentId)))
      .toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const refunds = await db.refunds
      .filter((r) => !r.isDeleted && r.customerId === customerId)
      .toArray();

    const allocations = await db.paymentAllocations
      .where('customerId')
      .equals(customerId)
      .filter((a) => !a.isDeleted && !reversedPaymentIds.has(a.paymentId))
      .toArray();

    // 1. Total Net Sales (non-voided sales minus returns)
    let totalSalesGross = 0;
    let totalReturnsOnActiveSales = 0;
    for (const sale of sales) {
      if (!voidSaleIds.has(sale.id)) {
        totalSalesGross += Number(sale.totalAmount) || 0;
        totalReturnsOnActiveSales += returnSumBySale.get(sale.id) || 0;
      }
    }
    const totalSales = roundCurrency(Math.max(0, totalSalesGross - totalReturnsOnActiveSales));

    // 2. Net Payments received (payments minus reversals minus refunds)
    const totalPaymentsGross = payments
      .filter((p) => !reversedPaymentIds.has(p.id))
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const totalRefundsAmount = refunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const totalPaid = roundCurrency(Math.max(0, totalPaymentsGross - totalRefundsAmount));

    // 3. Allocations on active non-voided sales
    const validAllocations = allocations.filter((a) => !voidSaleIds.has(a.saleId));

    // 4. Outstanding Invoices & Balances
    let outstandingBalance = 0;
    let outstandingInvoicesCount = 0;
    let totalEffectiveAllocated = 0;

    for (const sale of sales) {
      if (voidSaleIds.has(sale.id)) continue;

      const retOnSale = returnSumBySale.get(sale.id) || 0;
      const effectiveSaleTotal = roundCurrency(Math.max(0, (Number(sale.totalAmount) || 0) - retOnSale));
      if (effectiveSaleTotal <= 0.005) continue;

      const rawSaleAllocated = validAllocations
        .filter((a) => a.saleId === sale.id)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      const saleAllocated = roundCurrency(Math.min(effectiveSaleTotal, rawSaleAllocated));
      totalEffectiveAllocated = addCurrency(totalEffectiveAllocated, saleAllocated);

      const saleDue = roundCurrency(Math.max(0, effectiveSaleTotal - saleAllocated));
      if (saleDue > 0.005) {
        outstandingBalance = addCurrency(outstandingBalance, saleDue);
        outstandingInvoicesCount++;
      }
    }
    outstandingBalance = roundCurrency(outstandingBalance);
    const totalAllocated = roundCurrency(totalEffectiveAllocated);

    // Customer Credit = net payments made minus total allocated
    const customerCredit = roundCurrency(Math.max(0, totalPaid - totalAllocated));
    const netReceivable = roundCurrency(outstandingBalance - customerCredit);

    return {
      customerId: customer.id,
      customerName: customer.name,
      totalSales,
      totalPaid,
      totalAllocated,
      outstandingBalance,
      customerCredit,
      netReceivable,
      outstandingInvoicesCount,
    };
  },

  /**
   * Generates customer account statement ledger entries with running balance including sales, returns, voids, payments, reversals, and refunds.
   */
  async getCustomerStatement(customerId: string): Promise<CustomerStatementEntry[]> {
    const customer = await db.customers.get(customerId);
    if (!customer) {
      throw new PaymentValidationError(`Customer with ID ${customerId} not found.`);
    }

    const sales = await db.sales
      .where('customerId')
      .equals(customerId)
      .filter((s) => !s.isDeleted)
      .toArray();
    const saleIds = new Set(sales.map((s) => s.id));

    const salesMap = new Map<string, string>();
    sales.forEach((s) => salesMap.set(s.id, s.invoiceNumber));

    const voids = await db.saleVoids
      .filter((v) => !v.isDeleted && (v.customerId === customerId || saleIds.has(v.originalSaleId)))
      .toArray();

    const returns = await db.saleReturns
      .filter((r) => !r.isDeleted && (r.customerId === customerId || saleIds.has(r.originalSaleId)))
      .toArray();

    const payments = await db.payments
      .where('partyId')
      .equals(customerId)
      .filter((p) => !p.isDeleted && p.partyType === 'CUSTOMER')
      .toArray();

    const reversals = await db.paymentReversals
      .filter((r) => !r.isDeleted && (r.customerId === customerId || payments.some((p) => p.id === r.originalPaymentId)))
      .toArray();

    const refunds = await db.refunds
      .filter((r) => !r.isDeleted && r.customerId === customerId)
      .toArray();

    const allocations = await db.paymentAllocations
      .where('customerId')
      .equals(customerId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const entries: CustomerStatementEntry[] = [];

    // 1. Sales (Debits)
    for (const sale of sales) {
      entries.push({
        id: sale.id,
        date: sale.saleDate || sale.createdAt,
        type: 'SALE',
        referenceNumber: sale.invoiceNumber,
        referenceId: sale.id,
        description: `Invoice #${sale.invoiceNumber}`,
        debit: roundCurrency(Number(sale.totalAmount) || 0),
        credit: 0,
        runningBalance: 0,
        notes: sale.notes,
      });
    }

    // 2. Sale Returns (Credits - reducing debt)
    for (const ret of returns) {
      const origInv = salesMap.get(ret.originalSaleId) || 'INV';
      entries.push({
        id: ret.id,
        date: ret.returnDate || ret.createdAt,
        type: 'SALE_RETURN',
        referenceNumber: ret.returnNumber,
        referenceId: ret.id,
        description: `Return #${ret.returnNumber} (for #${origInv})`,
        debit: 0,
        credit: roundCurrency(Number(ret.totalAmount) || 0),
        runningBalance: 0,
        notes: ret.notes || (ret.reason ? `Reason: ${ret.reason}` : undefined),
      });
    }

    // 3. Sale Voids (Credits - canceling the remaining invoice balance)
    for (const v of voids) {
      const origSale = sales.find((s) => s.id === v.originalSaleId);
      const origInv = origSale?.invoiceNumber || salesMap.get(v.originalSaleId) || 'INV';
      const returnsOnThisSale = returns
        .filter((r) => r.originalSaleId === v.originalSaleId)
        .reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const unreturnedSaleAmount = roundCurrency(
        Math.max(0, (Number(origSale?.totalAmount) || 0) - returnsOnThisSale)
      );

      if (unreturnedSaleAmount > 0) {
        entries.push({
          id: v.id,
          date: v.voidDate || v.createdAt,
          type: 'SALE_VOID',
          referenceNumber: `VOID-${origInv}`,
          referenceId: v.id,
          description: `Invoice #${origInv} Voided / Cancelled`,
          debit: 0,
          credit: unreturnedSaleAmount,
          runningBalance: 0,
          notes: v.reason || v.notes,
        });
      }
    }

    // 4. Payments (Credits)
    for (const payment of payments) {
      const paymentAllocs = allocations
        .filter((a) => a.paymentId === payment.id)
        .map((a) => ({
          invoiceNumber: salesMap.get(a.saleId) || 'Unknown Invoice',
          saleId: a.saleId,
          amount: roundCurrency(Number(a.amount) || 0),
        }));

      entries.push({
        id: payment.id,
        date: payment.paymentDate || payment.createdAt,
        type: 'PAYMENT',
        referenceNumber: payment.id.substring(0, 12),
        referenceId: payment.id,
        description: `Payment received (${payment.paymentMethod})`,
        debit: 0,
        credit: roundCurrency(Number(payment.amount) || 0),
        runningBalance: 0,
        paymentMethod: payment.paymentMethod,
        notes: payment.notes,
        allocations: paymentAllocs.length > 0 ? paymentAllocs : undefined,
      });
    }

    // 5. Payment Reversals (Debits - reinstating customer debt)
    for (const rev of reversals) {
      entries.push({
        id: rev.id,
        date: rev.reversalDate || rev.createdAt,
        type: 'PAYMENT_REVERSAL',
        referenceNumber: `REV-${rev.originalPaymentId.substring(0, 8)}`,
        referenceId: rev.id,
        description: `Payment Reversal (${rev.reason || 'Cancelled'})`,
        debit: roundCurrency(Number(rev.amount) || 0),
        credit: 0,
        runningBalance: 0,
        notes: rev.notes,
      });
    }

    // 6. Refunds (Debits - money paid back to customer, increasing net debt or reducing customer credit)
    for (const ref of refunds) {
      entries.push({
        id: ref.id,
        date: ref.refundDate || ref.createdAt,
        type: 'REFUND',
        referenceNumber: ref.id.substring(0, 12),
        referenceId: ref.id,
        description: `Refund Issued (${ref.paymentMethod})`,
        debit: roundCurrency(Number(ref.amount) || 0),
        credit: 0,
        runningBalance: 0,
        paymentMethod: ref.paymentMethod,
        notes: ref.notes,
      });
    }

    // Chronological sorting (oldest first). Tie-breaking logic: Sales -> Returns -> Payments -> Voids -> Refunds -> Reversals
    const typePriority: Record<CustomerStatementEntry['type'], number> = {
      SALE: 1,
      SALE_RETURN: 2,
      PAYMENT: 3,
      SALE_VOID: 4,
      REFUND: 5,
      PAYMENT_REVERSAL: 6,
    };

    entries.sort((a, b) => {
      const timeDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (typePriority[a.type] || 0) - (typePriority[b.type] || 0);
    });

    // Compute cumulative running balance
    let currentBalance = 0;
    const statementEntries: CustomerStatementEntry[] = entries.map((entry) => {
      currentBalance = roundCurrency(currentBalance + entry.debit - entry.credit);
      return {
        ...entry,
        runningBalance: currentBalance,
      };
    });

    return statementEntries;
  },

  /**
   * Receives customer payment, validates allocations, and executes atomic transaction.
   */
  async receiveCustomerPayment(payload: ReceivePaymentPayload): Promise<{
    payment: Payment;
    allocations: PaymentAllocation[];
    customerCreditRemaining: number;
    movement?: FinancialMovement;
  }> {
    const {
      businessId,
      customerId,
      amount,
      paymentMethod,
      paymentDate = new Date().toISOString(),
      notes,
      allocationMode,
      manualAllocations,
    } = payload;

    // Concurrency lock key based on customer & timestamp
    const lockKey = `${customerId}_${amount}_${paymentDate.slice(0, 16)}`;
    if (activePaymentSubmissions.has(lockKey)) {
      throw new PaymentValidationError('Duplicate payment request in progress. Please wait.');
    }
    activePaymentSubmissions.add(lockKey);

    try {
      // 1. Basic validation
      const paymentAmount = roundCurrency(Number(amount));
      if (paymentAmount <= 0) {
        throw new PaymentValidationError('Payment amount must be greater than 0.');
      }

      const customer = await db.customers.get(customerId);
      if (!customer || customer.isDeleted) {
        throw new PaymentValidationError('Customer not found or has been deleted.');
      }

      // 2. Fetch outstanding invoices
      const outstandingInvoices = await this.getOutstandingInvoicesForCustomer(customerId);

      // 3. Compute allocations
      type ComputedAlloc = { saleId: string; amount: number };
      const plannedAllocations: ComputedAlloc[] = [];
      const mode = allocationMode || 'AUTO';

      if (mode === 'AUTO') {
        // FIFO Allocation: oldest invoices first
        let unallocatedFunds = paymentAmount;
        for (const invoice of outstandingInvoices) {
          if (unallocatedFunds <= 0.001) break;
          const allocAmount = roundCurrency(Math.min(unallocatedFunds, invoice.dueAmount));
          if (allocAmount > 0) {
            plannedAllocations.push({
              saleId: invoice.saleId,
              amount: allocAmount,
            });
            unallocatedFunds = roundCurrency(unallocatedFunds - allocAmount);
          }
        }
      } else {
        // MANUAL Allocation mode
        if (!manualAllocations || manualAllocations.length === 0) {
          // Manual allocation with no invoices specified -> all goes to customer credit
        } else {
          let totalManualAllocated = 0;
          const invoiceDueMap = new Map(outstandingInvoices.map((inv) => [inv.saleId, inv.dueAmount]));

          for (const item of manualAllocations) {
            const allocVal = roundCurrency(Number(item.amount) || 0);
            if (allocVal <= 0) continue;

            const maxAllowed = invoiceDueMap.get(item.saleId);
            if (maxAllowed === undefined) {
              throw new PaymentValidationError(`Invoice ${item.saleId} is not an outstanding invoice for this customer.`);
            }

            if (isCurrencyGreaterThan(allocVal, maxAllowed as number)) {
              throw new PaymentValidationError(
                `Allocation amount (${allocVal}) exceeds remaining invoice due amount (${maxAllowed}).`
              );
            }

            plannedAllocations.push({
              saleId: item.saleId,
              amount: allocVal,
            });
            totalManualAllocated = roundCurrency(totalManualAllocated + allocVal);
          }

          if (isCurrencyGreaterThan(totalManualAllocated, paymentAmount)) {
            throw new PaymentValidationError(
              `Total allocated amount (${totalManualAllocated}) exceeds payment amount (${paymentAmount}).`
            );
          }
        }
      }

      // 4. Resolve Financial Account
      const account = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);

      // 5. Construct records
      const deviceId = getPersistentDeviceId();
      const now = new Date().toISOString();
      const paymentId = generateUniqueId('PAY');

      const payment: Payment = {
        id: paymentId,
        businessId,
        partyType: 'CUSTOMER',
        partyId: customerId,
        referenceType: 'DIRECT',
        referenceId: plannedAllocations.length === 1 ? plannedAllocations[0].saleId : undefined,
        amount: paymentAmount,
        paymentDate,
        paymentMethod,
        notes: notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };

      const allocations: PaymentAllocation[] = plannedAllocations.map((alloc) => ({
        id: generateUniqueId('ALLOC'),
        businessId,
        paymentId: payment.id,
        saleId: alloc.saleId,
        customerId,
        amount: alloc.amount,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      }));

      // Create FinancialMovement IN for real-money customer payment
      const movementId = generateUniqueId('MOV');
      const movement: FinancialMovement = {
        id: movementId,
        businessId,
        accountId: account.id,
        type: 'CUSTOMER_PAYMENT',
        direction: 'IN',
        amount: paymentAmount,
        movementDate: paymentDate,
        referenceType: 'PAYMENT',
        referenceId: payment.id,
        description: `Customer payment received from ${customer.name || 'Customer'} (${paymentMethod})`,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };

      // Sync metadata
      const syncRecords: SyncMetadata[] = [
        {
          id: generateUniqueId('SYNC'),
          recordId: payment.id,
          recordType: 'payment',
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        },
        ...allocations.map((a) => ({
          id: generateUniqueId('SYNC'),
          recordId: a.id,
          recordType: 'paymentAllocation' as const,
          syncState: 'LOCAL_ONLY' as const,
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        })),
        {
          id: generateUniqueId('SYNC'),
          recordId: movement.id,
          recordType: 'financialMovement' as const,
          syncState: 'LOCAL_ONLY' as const,
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        },
      ];

      // 6. Execute Atomic Transaction in Dexie
      await db.transaction(
        'rw',
        [db.payments, db.paymentAllocations, db.financialMovements, db.syncMetadata],
        async () => {
          await db.payments.add(payment);
          if (allocations.length > 0) {
            await db.paymentAllocations.bulkAdd(allocations);
          }
          await db.financialMovements.add(movement);
          await db.syncMetadata.bulkAdd(syncRecords);
        }
      );

      const totalAllocatedAmount = roundCurrency(
        allocations.reduce((sum, a) => sum + a.amount, 0)
      );
      const customerCreditRemaining = roundCurrency(
        Math.max(0, paymentAmount - totalAllocatedAmount)
      );

      return {
        payment,
        allocations,
        movement,
        customerCreditRemaining,
      };
    } finally {
      activePaymentSubmissions.delete(lockKey);
    }
  },

  /**
   * Helper to allocate unallocated customer credit to a specific sale
   */
  async findUnallocatedPaymentsForCustomer(customerId: string): Promise<Array<{
    payment: Payment;
    unallocatedAmount: number;
  }>> {
    const payments = await db.payments
      .where('partyId')
      .equals(customerId)
      .filter((p) => !p.isDeleted && p.partyType === 'CUSTOMER')
      .sortBy('paymentDate');

    const reversals = await db.paymentReversals.filter((r) => !r.isDeleted).toArray();
    const reversedPaymentIds = new Set(reversals.map((r) => r.originalPaymentId));

    const allocations = await db.paymentAllocations
      .where('customerId')
      .equals(customerId)
      .filter((a) => !a.isDeleted)
      .toArray();

    const result: Array<{ payment: Payment; unallocatedAmount: number }> = [];

    for (const payment of payments) {
      if (reversedPaymentIds.has(payment.id)) continue;

      const allocatedOnPayment = allocations
        .filter((a) => a.paymentId === payment.id)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      const unallocated = roundCurrency(
        Math.max(0, (Number(payment.amount) || 0) - allocatedOnPayment)
      );
      if (unallocated > 0.005) {
        result.push({
          payment,
          unallocatedAmount: unallocated,
        });
      }
    }

    return result;
  },
};
