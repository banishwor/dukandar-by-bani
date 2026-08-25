import { db } from '../db/database';
import type {
  SaleReturn,
  SaleReturnLine,
  SaleVoid,
  Refund,
  PaymentReversal,
  SyncMetadata,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency } from '../utils/money';

export interface SaleReturnDetails {
  returnRecord: SaleReturn;
  lines: SaleReturnLine[];
  refund?: Refund;
}

export const saleReturnRepository = {
  /**
   * Get all sale returns for a business
   */
  async getSaleReturns(businessId: string): Promise<SaleReturn[]> {
    return await db.saleReturns
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .reverse()
      .sortBy('returnDate');
  },

  /**
   * Get all sale returns for a specific sale
   */
  async getReturnsBySale(saleId: string): Promise<SaleReturn[]> {
    return await db.saleReturns
      .where('originalSaleId')
      .equals(saleId)
      .filter((r) => !r.isDeleted)
      .toArray();
  },

  /**
   * Get all return lines for a specific sale
   */
  async getReturnLinesBySale(saleId: string): Promise<SaleReturnLine[]> {
    return await db.saleReturnLines
      .where('originalSaleId')
      .equals(saleId)
      .filter((l) => !l.isDeleted)
      .toArray();
  },

  /**
   * Get full details of a specific return
   */
  async getReturnWithDetails(returnId: string): Promise<SaleReturnDetails | undefined> {
    const returnRecord = await db.saleReturns.get(returnId);
    if (!returnRecord || returnRecord.isDeleted) return undefined;

    const lines = await db.saleReturnLines
      .where('saleReturnId')
      .equals(returnId)
      .filter((l) => !l.isDeleted)
      .toArray();

    const refund = await db.refunds
      .where('saleReturnId')
      .equals(returnId)
      .filter((r) => !r.isDeleted)
      .first();

    return {
      returnRecord,
      lines,
      refund,
    };
  },

  /**
   * Get void record for a specific sale if voided
   */
  async getSaleVoid(saleId: string): Promise<SaleVoid | undefined> {
    return await db.saleVoids
      .where('originalSaleId')
      .equals(saleId)
      .filter((v) => !v.isDeleted)
      .first();
  },

  /**
   * Get all voids for a business
   */
  async getSaleVoids(businessId: string): Promise<SaleVoid[]> {
    return await db.saleVoids
      .where('businessId')
      .equals(businessId)
      .filter((v) => !v.isDeleted)
      .toArray();
  },

  /**
   * Get all refunds for a customer
   */
  async getRefundsByCustomer(customerId: string): Promise<Refund[]> {
    return await db.refunds
      .where('customerId')
      .equals(customerId)
      .filter((r) => !r.isDeleted)
      .toArray();
  },

  /**
   * Get all refunds for a specific sale
   */
  async getRefundsBySale(saleId: string): Promise<Refund[]> {
    const returns = await this.getReturnsBySale(saleId);
    const returnIds = new Set(returns.map((r) => r.id));
    const saleVoid = await this.getSaleVoid(saleId);

    const allRefunds = await db.refunds.filter((r) => !r.isDeleted).toArray();
    return allRefunds.filter(
      (r) =>
        (r.saleReturnId && returnIds.has(r.saleReturnId)) ||
        (saleVoid && r.saleVoidId === saleVoid.id)
    );
  },

  /**
   * Generate next sequential return number (e.g. RET-001 or RET-INV001-1)
   */
  async getNextReturnNumber(businessId: string, invoiceNumber?: string): Promise<string> {
    const allReturns = await db.saleReturns
      .where('businessId')
      .equals(businessId)
      .toArray();

    const count = allReturns.length + 1;
    const padded = String(count).padStart(4, '0');
    if (invoiceNumber) {
      const saleReturnCount = allReturns.filter((r) => r.returnNumber.includes(invoiceNumber)).length + 1;
      return `RET-${invoiceNumber}-${saleReturnCount}`;
    }
    return `RET-${padded}`;
  },

  /**
   * Get all payment reversals for a business
   */
  async getPaymentReversals(businessId: string): Promise<PaymentReversal[]> {
    return await db.paymentReversals
      .where('businessId')
      .equals(businessId)
      .filter((r) => !r.isDeleted)
      .toArray();
  },

  /**
   * Get reversal for a specific payment
   */
  async getReversalForPayment(paymentId: string): Promise<PaymentReversal | undefined> {
    return await db.paymentReversals
      .where('originalPaymentId')
      .equals(paymentId)
      .filter((r) => !r.isDeleted)
      .first();
  },
};
