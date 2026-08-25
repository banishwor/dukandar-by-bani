import { db } from '../db/database';
import type {
  Sale,
  SaleLine,
  StockMovement,
  Payment,
  PaymentAllocation,
  SaleReturn,
  SaleReturnLine,
  SaleVoid,
  Refund,
  SyncMetadata,
  SaleStatus,
  FinancialMovement,
} from '../types';
import { generateInvoiceNumber, generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';
import { roundCurrency } from '../utils/money';

export interface SaleFullDetails {
  sale: Sale;
  lines: SaleLine[];
  payments: Payment[];
  allocations: PaymentAllocation[];
  returns: SaleReturn[];
  returnLines: SaleReturnLine[];
  voidRecord?: SaleVoid;
  refunds: Refund[];
  effectiveTotalAmount: number;
  totalReturnedAmount: number;
  isVoided: boolean;
}

/**
 * Sales Repository
 *
 * IMMUTABILITY RULE:
 * Completed sales, associated sale lines, stock movements, original payments, and payment allocations
 * represent immutable historical transactions. Financial attributes (totals, quantities, rates, customer,
 * payment amounts, allocations) must NEVER be updated or deleted through generic methods.
 * Any future corrections are recorded as new immutable records (SALE_RETURN, VOID_SALE, REFUND, REVERSAL).
 */
export const saleRepository = {
  async getSales(businessId: string): Promise<Sale[]> {
    const rawSales = await db.sales
      .where('businessId')
      .equals(businessId)
      .filter((s) => !s.isDeleted)
      .reverse()
      .sortBy('createdAt');

    // Attach accurate dynamic statuses taking into account voids and returns
    const voids = await db.saleVoids
      .where('businessId')
      .equals(businessId)
      .filter((v) => !v.isDeleted)
      .toArray();
    const voidSaleIds = new Set(voids.map((v) => v.originalSaleId));

    const returns = await db.saleReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const returnSumBySale = new Map<string, number>();
    for (const r of returns) {
      const current = returnSumBySale.get(r.originalSaleId) || 0;
      returnSumBySale.set(r.originalSaleId, current + (Number(r.totalAmount) || 0));
    }

    const allocations = await db.paymentAllocations
      .where('businessId')
      .equals(businessId)
      .filter((a) => !a.isDeleted)
      .toArray();

    return rawSales.map((sale) => {
      if (voidSaleIds.has(sale.id)) {
        return {
          ...sale,
          status: 'VOIDED' as SaleStatus,
          dueAmount: 0,
        };
      }

      const totalReturned = returnSumBySale.get(sale.id) || 0;
      const effectiveTotal = roundCurrency(Math.max(0, (Number(sale.totalAmount) || 0) - totalReturned));
      const saleAllocs = allocations.filter((a) => a.saleId === sale.id);
      const paid = roundCurrency(saleAllocs.reduce((sum, a) => sum + (Number(a.amount) || 0), 0));
      const due = roundCurrency(Math.max(0, effectiveTotal - paid));

      let status: SaleStatus = 'UNPAID';
      if (totalReturned >= (Number(sale.totalAmount) || 0) - 0.005 && (Number(sale.totalAmount) || 0) > 0) {
        status = 'RETURNED';
      } else if (due <= 0.005) {
        status = 'PAID';
      } else if (paid > 0) {
        status = 'PARTIAL';
      }

      return {
        ...sale,
        paidAmount: paid,
        dueAmount: due,
        status,
      };
    });
  },

  async getSalesByCustomer(customerId: string): Promise<Sale[]> {
    const rawSales = await db.sales
      .where('customerId')
      .equals(customerId)
      .filter((s) => !s.isDeleted)
      .reverse()
      .sortBy('createdAt');

    const saleIds = new Set(rawSales.map((s) => s.id));

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

    return rawSales.map((sale) => {
      if (voidSaleIds.has(sale.id)) {
        return {
          ...sale,
          status: 'VOIDED' as SaleStatus,
          dueAmount: 0,
        };
      }

      const totalReturned = returnSumBySale.get(sale.id) || 0;
      const effectiveTotal = roundCurrency(Math.max(0, (Number(sale.totalAmount) || 0) - totalReturned));
      const saleAllocs = allocations.filter((a) => a.saleId === sale.id);
      const paid = roundCurrency(saleAllocs.reduce((sum, a) => sum + (Number(a.amount) || 0), 0));
      const due = roundCurrency(Math.max(0, effectiveTotal - paid));

      let status: SaleStatus = 'UNPAID';
      if (totalReturned >= (Number(sale.totalAmount) || 0) - 0.005 && (Number(sale.totalAmount) || 0) > 0) {
        status = 'RETURNED';
      } else if (due <= 0.005) {
        status = 'PAID';
      } else if (paid > 0) {
        status = 'PARTIAL';
      }

      return {
        ...sale,
        paidAmount: paid,
        dueAmount: due,
        status,
      };
    });
  },

  async getSaleWithDetails(saleId: string): Promise<SaleFullDetails | undefined> {
    const sale = await db.sales.get(saleId);
    if (!sale || sale.isDeleted) return undefined;

    const lines = await db.saleLines
      .where('saleId')
      .equals(saleId)
      .toArray();

    const allocations = await db.paymentAllocations
      .where('saleId')
      .equals(saleId)
      .filter((a) => !a.isDeleted)
      .toArray();

    // Check for void record
    const voidRecord = await db.saleVoids
      .where('originalSaleId')
      .equals(saleId)
      .filter((v) => !v.isDeleted)
      .first();

    // Fetch returns & return lines
    const returns = await db.saleReturns
      .where('originalSaleId')
      .equals(saleId)
      .filter((r) => !r.isDeleted)
      .toArray();

    const returnLines = await db.saleReturnLines
      .where('originalSaleId')
      .equals(saleId)
      .filter((l) => !l.isDeleted)
      .toArray();

    // Fetch refunds
    const returnIds = new Set(returns.map((r) => r.id));
    const allRefunds = await db.refunds.filter((r) => !r.isDeleted).toArray();
    const refunds = allRefunds.filter(
      (r) =>
        (r.saleReturnId && returnIds.has(r.saleReturnId)) ||
        (voidRecord && r.saleVoidId === voidRecord.id)
    );

    // Find all payment records associated with this sale
    const paymentIds = new Set<string>();
    allocations.forEach((a) => paymentIds.add(a.paymentId));

    const directPayments = await db.payments
      .where('referenceId')
      .equals(saleId)
      .filter((p) => !p.isDeleted)
      .toArray();

    directPayments.forEach((p) => paymentIds.add(p.id));

    const allPaymentsList: Payment[] = [];
    for (const pid of paymentIds) {
      const p = await db.payments.get(pid);
      if (p && !p.isDeleted) {
        allPaymentsList.push(p);
      }
    }

    // Calculations
    const totalReturnedAmount = roundCurrency(
      returns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0)
    );
    const isVoided = Boolean(voidRecord);
    const effectiveTotalAmount = isVoided
      ? 0
      : roundCurrency(Math.max(0, (Number(sale.totalAmount) || 0) - totalReturnedAmount));

    const totalAllocated = roundCurrency(
      allocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
    );

    let status: SaleStatus = 'UNPAID';
    if (isVoided) {
      status = 'VOIDED';
    } else if (
      totalReturnedAmount >= (Number(sale.totalAmount) || 0) - 0.005 &&
      (Number(sale.totalAmount) || 0) > 0
    ) {
      status = 'RETURNED';
    } else if (totalAllocated >= effectiveTotalAmount - 0.005) {
      status = 'PAID';
    } else if (totalAllocated > 0) {
      status = 'PARTIAL';
    }

    const calculatedSale: Sale = {
      ...sale,
      paidAmount: totalAllocated,
      dueAmount: isVoided ? 0 : roundCurrency(Math.max(0, effectiveTotalAmount - totalAllocated)),
      status,
    };

    return {
      sale: calculatedSale,
      lines,
      payments: allPaymentsList,
      allocations,
      returns,
      returnLines,
      voidRecord,
      refunds,
      effectiveTotalAmount,
      totalReturnedAmount,
      isVoided,
    };
  },

  async getNextInvoiceNumber(businessId: string): Promise<string> {
    const allSales = await db.sales
      .where('businessId')
      .equals(businessId)
      .toArray();

    let maxNumber = 0;
    for (const sale of allSales) {
      if (sale.invoiceNumber) {
        const match = sale.invoiceNumber.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }
    }

    const nextSeq = maxNumber + 1;
    return generateInvoiceNumber(nextSeq, 'INV');
  },

  /**
   * Atomic Sale Transaction:
   * Commits Sale, SaleLines, Stock Movements, Payment, Payment Allocations, and Sync metadata in a single Dexie transaction.
   * If any step fails, entire transaction is automatically rolled back.
   */
  async executeAtomicSale(
    sale: Sale,
    lines: SaleLine[],
    stockMovements: StockMovement[],
    payment?: Payment,
    allocations?: PaymentAllocation[],
    movement?: FinancialMovement
  ): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const syncRecords: SyncMetadata[] = [
      {
        id: generateUniqueId('SYNC'),
        recordId: sale.id,
        recordType: 'sale',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      },
      ...lines.map((l) => ({
        id: generateUniqueId('SYNC'),
        recordId: l.id,
        recordType: 'saleLine' as const,
        syncState: 'LOCAL_ONLY' as const,
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      })),
      ...stockMovements.map((m) => ({
        id: generateUniqueId('SYNC'),
        recordId: m.id,
        recordType: 'stockMovement' as const,
        syncState: 'LOCAL_ONLY' as const,
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      })),
    ];

    if (payment) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: payment.id,
        recordType: 'payment',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    }

    if (allocations && allocations.length > 0) {
      allocations.forEach((alloc) => {
        syncRecords.push({
          id: generateUniqueId('SYNC'),
          recordId: alloc.id,
          recordType: 'paymentAllocation',
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        });
      });
    }

    if (movement) {
      syncRecords.push({
        id: generateUniqueId('SYNC'),
        recordId: movement.id,
        recordType: 'financialMovement',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });
    }

    await db.transaction(
      'rw',
      [
        db.sales,
        db.saleLines,
        db.stockMovements,
        db.payments,
        db.paymentAllocations,
        db.financialMovements,
        db.syncMetadata,
      ],
      async () => {
        // 1. Add Sale
        await db.sales.add(sale);

        // 2. Add Sale Lines
        if (lines.length > 0) {
          await db.saleLines.bulkAdd(lines);
        }

        // 3. Add Stock Movements
        if (stockMovements.length > 0) {
          await db.stockMovements.bulkAdd(stockMovements);
        }

        // 4. Add Payment (if paid > 0)
        if (payment) {
          await db.payments.add(payment);
        }

        // 5. Add Payment Allocations
        if (allocations && allocations.length > 0) {
          await db.paymentAllocations.bulkAdd(allocations);
        }

        // 6. Add Financial Movement (if paid > 0)
        if (movement) {
          await db.financialMovements.add(movement);
        }

        // 7. Add Sync Metadata
        await db.syncMetadata.bulkAdd(syncRecords);
      }
    );
  },

  /**
   * Safe Non-Financial Update:
   * Only allows modifying auxiliary notes. Core financial and inventory details remain strictly immutable.
   */
  async updateSaleNotes(id: string, notes: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.sales.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Sale');

    await db.transaction('rw', [db.sales, db.syncMetadata], async () => {
      await db.sales.update(id, {
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
