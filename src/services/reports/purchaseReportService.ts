import { db } from '../../db/database';
import { roundCurrency, addCurrency, subtractCurrency } from '../../utils/money';
import { isDateInRange, getDailyBuckets, type DateRangeBounds } from '../../utils/reportDateRange';
import type { Purchase, PurchaseLine, PurchaseReturn, PurchaseVoid, Supplier } from '../../types';

export interface PurchaseReportFilter {
  dateRange: DateRangeBounds;
  supplierId?: string;
  paymentStatus?: 'ALL' | 'PAID' | 'UNPAID' | 'PARTIAL';
  searchQuery?: string;
}

export interface PurchaseReportMetrics {
  totalBillsCount: number;
  validBillsCount: number;
  voidedBillsCount: number;
  returnedBillsCount: number;

  grossPurchases: number;        // Sum of all line gross amounts (qty * unitCost)
  lineDiscounts: number;         // Sum of line discount amounts
  overallDiscounts: number;      // Sum of bill-level discounts
  totalDiscounts: number;        // Line discounts + overall discounts
  netInvoicedPurchases: number;  // Gross purchases - Total discounts (sum of purchase.totalAmount for active purchases)

  purchaseReturnsAmount: number; // Returns made during the period
  purchaseVoidsAmount: number;   // Invoiced amount of purchases voided during the period
  netRealizedPurchases: number;  // Net Invoiced Purchases - Returns - Voids

  amountPaid: number;            // Real money paid to suppliers (Allocations - RefundsReceived)
  outstandingPayables: number;   // Remaining due on active purchases in the period
}

export interface PurchaseReportDailyPoint {
  dateStr: string;
  label: string;
  grossPurchases: number;
  netPurchases: number;
  returns: number;
  billsCount: number;
}

export interface PurchaseReportSupplierSummary {
  supplierId: string;
  supplierName: string;
  billsCount: number;
  grossPurchases: number;
  discounts: number;
  netPurchases: number;
  returns: number;
  netRealized: number;
  paid: number;
  due: number;
}

export interface PurchaseReportItemSummary {
  itemId: string;
  itemName: string;
  unit: string;
  quantityPurchased: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
}

export interface PurchaseReportResult {
  metrics: PurchaseReportMetrics;
  purchases: Array<Purchase & { supplierName?: string; voided?: boolean; returnCount?: number; returnAmount?: number }>;
  dailyTrend: PurchaseReportDailyPoint[];
  topSuppliers: PurchaseReportSupplierSummary[];
  itemBreakdown: PurchaseReportItemSummary[];
}

export const purchaseReportService = {
  async generatePurchaseReport(
    businessId: string,
    filter: PurchaseReportFilter
  ): Promise<PurchaseReportResult> {
    const { dateRange, supplierId, paymentStatus = 'ALL', searchQuery = '' } = filter;
    const { startDateIso, endDateIso } = dateRange;

    // 1. Fetch raw immutable records
    const [
      allPurchases,
      allPurchaseLines,
      allReturns,
      allVoids,
      allAllocations,
      allReversals,
      allRefundsReceived,
      allSuppliers,
    ] = await Promise.all([
      db.purchases.where('businessId').equals(businessId).filter((p) => !p.isDeleted).toArray(),
      db.purchaseLines.where('businessId').equals(businessId).toArray(),
      db.purchaseReturns.where('businessId').equals(businessId).filter((r) => !r.isDeleted).toArray(),
      db.purchaseVoids.where('businessId').equals(businessId).filter((v) => !v.isDeleted).toArray(),
      db.supplierPaymentAllocations.where('businessId').equals(businessId).filter((a) => !a.isDeleted).toArray(),
      db.supplierPaymentReversals.where('businessId').equals(businessId).filter((r) => !r.isDeleted).toArray(),
      db.refundsReceived.where('businessId').equals(businessId).filter((rf) => !rf.isDeleted).toArray(),
      db.suppliers.where('businessId').equals(businessId).filter((s) => !s.isDeleted).toArray(),
    ]);

    const supplierMap = new Map<string, Supplier>();
    for (const s of allSuppliers) {
      supplierMap.set(s.id, s);
    }

    const voidedPurchaseIds = new Set<string>(allVoids.map((v) => v.originalPurchaseId));
    const reversedPaymentIds = new Set<string>(allReversals.map((r) => r.originalPaymentId));

    // Map returns by purchaseId
    const returnsByPurchaseId = new Map<string, PurchaseReturn[]>();
    for (const ret of allReturns) {
      const list = returnsByPurchaseId.get(ret.originalPurchaseId) || [];
      list.push(ret);
      returnsByPurchaseId.set(ret.originalPurchaseId, list);
    }

    // Map lines by purchaseId
    const linesByPurchaseId = new Map<string, PurchaseLine[]>();
    for (const l of allPurchaseLines) {
      const list = linesByPurchaseId.get(l.purchaseId) || [];
      list.push(l);
      linesByPurchaseId.set(l.purchaseId, list);
    }

    // 2. Filter purchases by date range & filters
    const query = searchQuery.trim().toLowerCase();
    const periodPurchases = allPurchases.filter((purchase) => {
      const txDate = purchase.purchaseDate || purchase.createdAt;
      if (!isDateInRange(txDate, startDateIso, endDateIso)) return false;
      if (supplierId && purchase.supplierId !== supplierId) return false;
      if (paymentStatus !== 'ALL' && purchase.status !== paymentStatus) return false;
      if (query) {
        const billMatch = purchase.purchaseNumber.toLowerCase().includes(query);
        const suppMatch = (purchase.supplierNameSnapshot || '').toLowerCase().includes(query);
        if (!billMatch && !suppMatch) return false;
      }
      return true;
    });

    // 3. Compute Metrics
    let totalBillsCount = periodPurchases.length;
    let validBillsCount = 0;
    let voidedBillsCount = 0;
    let returnedBillsCount = 0;

    let grossPurchases = 0;
    let lineDiscounts = 0;
    let overallDiscounts = 0;
    let netInvoicedPurchases = 0;
    let purchaseReturnsAmount = 0;
    let purchaseVoidsAmount = 0;
    let amountPaid = 0;
    let outstandingPayables = 0;

    const itemSummaryMap = new Map<string, PurchaseReportItemSummary>();
    const supplierSummaryMap = new Map<string, PurchaseReportSupplierSummary>();

    const enrichedPurchases = periodPurchases.map((purchase) => {
      const isVoided = voidedPurchaseIds.has(purchase.id);
      const purchaseReturns = returnsByPurchaseId.get(purchase.id) || [];
      const purchaseReturnTotal = purchaseReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const lines = linesByPurchaseId.get(purchase.id) || [];

      // Allocations on this purchase (excluding reversed payments)
      const validAllocations = allAllocations.filter(
        (a) => a.purchaseId === purchase.id && !reversedPaymentIds.has(a.supplierPaymentId)
      );
      const allocTotal = validAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      // Refunds received linked to this purchase
      const purchaseRefunds = allRefundsReceived.filter(
        (rf) => (rf.purchaseReturnId && purchaseReturns.some((r) => r.id === rf.purchaseReturnId)) || (rf.purchaseVoidId && allVoids.some((v) => v.id === rf.purchaseVoidId && v.originalPurchaseId === purchase.id))
      );
      const refundTotal = purchaseRefunds.reduce((sum, rf) => sum + (Number(rf.amount) || 0), 0);

      const netPaidOnPurchase = Math.max(0, allocTotal - refundTotal);

      // Line totals
      let purchaseLineGrossSum = 0;
      let purchaseLineDiscSum = 0;

      for (const line of lines) {
        const lineGross = roundCurrency((Number(line.quantity) || 0) * (Number(line.unitCost) || 0));
        const lineDisc = Number(line.discountAmount) || 0;
        purchaseLineGrossSum += lineGross;
        purchaseLineDiscSum += lineDisc;

        if (!isVoided) {
          const existingItem = itemSummaryMap.get(line.itemId) || {
            itemId: line.itemId,
            itemName: line.itemNameSnapshot,
            unit: line.unit,
            quantityPurchased: 0,
            grossAmount: 0,
            discountAmount: 0,
            netAmount: 0,
          };
          existingItem.quantityPurchased += Number(line.quantity) || 0;
          existingItem.grossAmount = addCurrency(existingItem.grossAmount, lineGross);
          existingItem.discountAmount = addCurrency(existingItem.discountAmount, lineDisc);
          existingItem.netAmount = addCurrency(existingItem.netAmount, Number(line.lineTotal) || 0);
          itemSummaryMap.set(line.itemId, existingItem);
        }
      }

      if (isVoided) {
        voidedBillsCount++;
        purchaseVoidsAmount = addCurrency(purchaseVoidsAmount, Number(purchase.totalAmount) || 0);
      } else {
        validBillsCount++;
        grossPurchases = addCurrency(grossPurchases, purchaseLineGrossSum || Number(purchase.subtotal) || Number(purchase.totalAmount) || 0);
        lineDiscounts = addCurrency(lineDiscounts, purchaseLineDiscSum);
        overallDiscounts = addCurrency(overallDiscounts, Number(purchase.discountAmount) || 0);
        netInvoicedPurchases = addCurrency(netInvoicedPurchases, Number(purchase.totalAmount) || 0);

        if (purchaseReturnTotal > 0) {
          returnedBillsCount++;
          purchaseReturnsAmount = addCurrency(purchaseReturnsAmount, purchaseReturnTotal);
        }

        amountPaid = addCurrency(amountPaid, netPaidOnPurchase);
        const due = roundCurrency(Math.max(0, (Number(purchase.totalAmount) || 0) - purchaseReturnTotal - netPaidOnPurchase));
        outstandingPayables = addCurrency(outstandingPayables, due);

        // Supplier Summary accumulation
        const suppId = purchase.supplierId || 'DIRECT_VENDOR';
        const suppName = purchase.supplierNameSnapshot || (purchase.supplierId && supplierMap.get(purchase.supplierId)?.name) || 'Direct Cash Vendor';
        const existingSupp = supplierSummaryMap.get(suppId) || {
          supplierId: suppId,
          supplierName: suppName,
          billsCount: 0,
          grossPurchases: 0,
          discounts: 0,
          netPurchases: 0,
          returns: 0,
          netRealized: 0,
          paid: 0,
          due: 0,
        };

        existingSupp.billsCount++;
        existingSupp.grossPurchases = addCurrency(existingSupp.grossPurchases, purchaseLineGrossSum);
        existingSupp.discounts = addCurrency(existingSupp.discounts, purchaseLineDiscSum + (Number(purchase.discountAmount) || 0));
        existingSupp.netPurchases = addCurrency(existingSupp.netPurchases, Number(purchase.totalAmount) || 0);
        existingSupp.returns = addCurrency(existingSupp.returns, purchaseReturnTotal);
        existingSupp.netRealized = addCurrency(existingSupp.netRealized, Math.max(0, (Number(purchase.totalAmount) || 0) - purchaseReturnTotal));
        existingSupp.paid = addCurrency(existingSupp.paid, netPaidOnPurchase);
        existingSupp.due = addCurrency(existingSupp.due, due);
        supplierSummaryMap.set(suppId, existingSupp);
      }

      return {
        ...purchase,
        supplierName: purchase.supplierNameSnapshot || (purchase.supplierId ? supplierMap.get(purchase.supplierId)?.name : 'Direct Cash Vendor'),
        voided: isVoided,
        returnCount: purchaseReturns.length,
        returnAmount: purchaseReturnTotal,
      };
    });

    const totalDiscounts = roundCurrency(lineDiscounts + overallDiscounts);
    const netRealizedPurchases = roundCurrency(Math.max(0, netInvoicedPurchases - purchaseReturnsAmount));

    // 4. Daily Trend Bucketing
    const dailyBuckets = getDailyBuckets(startDateIso, endDateIso);
    const dailyTrend: PurchaseReportDailyPoint[] = dailyBuckets.map((bucket) => {
      const bucketPurchases = enrichedPurchases.filter(
        (p) => !p.voided && isDateInRange(p.purchaseDate || p.createdAt, bucket.dayStartIso, bucket.dayEndIso)
      );

      const bGross = bucketPurchases.reduce((sum, p) => sum + (Number(p.subtotal) || Number(p.totalAmount) || 0), 0);
      const bNet = bucketPurchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
      const bRet = bucketPurchases.reduce((sum, p) => sum + (p.returnAmount || 0), 0);

      return {
        dateStr: bucket.dateStr,
        label: bucket.label,
        grossPurchases: roundCurrency(bGross),
        netPurchases: roundCurrency(bNet),
        returns: roundCurrency(bRet),
        billsCount: bucketPurchases.length,
      };
    });

    const topSuppliers = Array.from(supplierSummaryMap.values()).sort((a, b) => b.netRealized - a.netRealized);
    const itemBreakdown = Array.from(itemSummaryMap.values()).sort((a, b) => b.netAmount - a.netAmount);

    return {
      metrics: {
        totalBillsCount,
        validBillsCount,
        voidedBillsCount,
        returnedBillsCount,
        grossPurchases: roundCurrency(grossPurchases),
        lineDiscounts: roundCurrency(lineDiscounts),
        overallDiscounts: roundCurrency(overallDiscounts),
        totalDiscounts,
        netInvoicedPurchases: roundCurrency(netInvoicedPurchases),
        purchaseReturnsAmount: roundCurrency(purchaseReturnsAmount),
        purchaseVoidsAmount: roundCurrency(purchaseVoidsAmount),
        netRealizedPurchases,
        amountPaid: roundCurrency(amountPaid),
        outstandingPayables: roundCurrency(outstandingPayables),
      },
      purchases: enrichedPurchases,
      dailyTrend,
      topSuppliers,
      itemBreakdown,
    };
  },
};
