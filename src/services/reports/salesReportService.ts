import { db } from '../../db/database';
import { roundCurrency, addCurrency, subtractCurrency } from '../../utils/money';
import { isDateInRange, getDailyBuckets, type DateRangeBounds } from '../../utils/reportDateRange';
import type { Sale, SaleLine, SaleReturn, SaleVoid, Customer } from '../../types';

export interface SalesReportFilter {
  dateRange: DateRangeBounds;
  customerId?: string;
  paymentStatus?: 'ALL' | 'PAID' | 'UNPAID' | 'PARTIAL';
  searchQuery?: string;
}

export interface SalesReportMetrics {
  totalInvoicesCount: number;
  validInvoicesCount: number;
  voidedInvoicesCount: number;
  returnedInvoicesCount: number;

  grossSales: number;        // Sum of all line gross amounts (qty * rate)
  lineDiscounts: number;     // Sum of line discount amounts
  overallDiscounts: number;  // Sum of invoice-level discounts
  totalDiscounts: number;    // Line discounts + overall discounts
  netInvoicedSales: number;  // Gross sales - Total discounts (sum of sale.totalAmount for active sales)

  saleReturnsAmount: number; // Returns made during the period
  saleVoidsAmount: number;   // Invoiced amount of sales voided during the period
  netRealizedSales: number;  // Net Invoiced Sales - Returns - Voids

  amountCollected: number;   // Real money collected (Allocations - Refunds)
  outstandingReceivables: number; // Remaining due on active invoices in the period
}

export interface SalesReportDailyPoint {
  dateStr: string;
  label: string;
  grossSales: number;
  netSales: number;
  returns: number;
  invoicesCount: number;
}

export interface SalesReportCustomerSummary {
  customerId: string;
  customerName: string;
  invoicesCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  returns: number;
  netRealized: number;
  paid: number;
  due: number;
}

export interface SalesReportItemSummary {
  itemId: string;
  itemName: string;
  unit: string;
  quantitySold: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
}

export interface SalesReportResult {
  metrics: SalesReportMetrics;
  sales: Array<Sale & { customerName?: string; voided?: boolean; returnCount?: number; returnAmount?: number }>;
  dailyTrend: SalesReportDailyPoint[];
  topCustomers: SalesReportCustomerSummary[];
  itemBreakdown: SalesReportItemSummary[];
}

export const salesReportService = {
  async generateSalesReport(
    businessId: string,
    filter: SalesReportFilter
  ): Promise<SalesReportResult> {
    const { dateRange, customerId, paymentStatus = 'ALL', searchQuery = '' } = filter;
    const { startDateIso, endDateIso } = dateRange;

    // 1. Fetch raw immutable records
    const [
      allSales,
      allSaleLines,
      allReturns,
      allVoids,
      allAllocations,
      allReversals,
      allRefunds,
      allCustomers,
    ] = await Promise.all([
      db.sales.where('businessId').equals(businessId).filter((s) => !s.isDeleted).toArray(),
      db.saleLines.where('businessId').equals(businessId).toArray(),
      db.saleReturns.where('businessId').equals(businessId).filter((r) => !r.isDeleted).toArray(),
      db.saleVoids.where('businessId').equals(businessId).filter((v) => !v.isDeleted).toArray(),
      db.paymentAllocations.where('businessId').equals(businessId).filter((a) => !a.isDeleted).toArray(),
      db.paymentReversals.where('businessId').equals(businessId).filter((r) => !r.isDeleted).toArray(),
      db.refunds.where('businessId').equals(businessId).filter((rf) => !rf.isDeleted).toArray(),
      db.customers.where('businessId').equals(businessId).filter((c) => !c.isDeleted).toArray(),
    ]);

    const customerMap = new Map<string, Customer>();
    for (const c of allCustomers) {
      customerMap.set(c.id, c);
    }

    const voidedSaleIds = new Set<string>(allVoids.map((v) => v.originalSaleId));
    const reversedPaymentIds = new Set<string>(allReversals.map((r) => r.originalPaymentId));

    // Map returns by saleId
    const returnsBySaleId = new Map<string, SaleReturn[]>();
    for (const ret of allReturns) {
      const list = returnsBySaleId.get(ret.originalSaleId) || [];
      list.push(ret);
      returnsBySaleId.set(ret.originalSaleId, list);
    }

    // Map lines by saleId
    const linesBySaleId = new Map<string, SaleLine[]>();
    for (const l of allSaleLines) {
      const list = linesBySaleId.get(l.saleId) || [];
      list.push(l);
      linesBySaleId.set(l.saleId, list);
    }

    // 2. Filter sales by date range & filters
    const query = searchQuery.trim().toLowerCase();
    const periodSales = allSales.filter((sale) => {
      const txDate = sale.saleDate || sale.createdAt;
      if (!isDateInRange(txDate, startDateIso, endDateIso)) return false;
      if (customerId && sale.customerId !== customerId) return false;
      if (paymentStatus !== 'ALL' && sale.status !== paymentStatus) return false;
      if (query) {
        const invMatch = sale.invoiceNumber.toLowerCase().includes(query);
        const custMatch = (sale.customerNameSnapshot || '').toLowerCase().includes(query);
        if (!invMatch && !custMatch) return false;
      }
      return true;
    });

    // 3. Compute Metrics
    let totalInvoicesCount = periodSales.length;
    let validInvoicesCount = 0;
    let voidedInvoicesCount = 0;
    let returnedInvoicesCount = 0;

    let grossSales = 0;
    let lineDiscounts = 0;
    let overallDiscounts = 0;
    let netInvoicedSales = 0;
    let saleReturnsAmount = 0;
    let saleVoidsAmount = 0;
    let amountCollected = 0;
    let outstandingReceivables = 0;

    const itemSummaryMap = new Map<string, SalesReportItemSummary>();
    const customerSummaryMap = new Map<string, SalesReportCustomerSummary>();

    // Process each sale in period
    const enrichedSales = periodSales.map((sale) => {
      const isVoided = voidedSaleIds.has(sale.id);
      const saleReturns = returnsBySaleId.get(sale.id) || [];
      const saleReturnTotal = saleReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const lines = linesBySaleId.get(sale.id) || [];

      // Allocations on this sale (excluding reversed payments)
      const validAllocations = allAllocations.filter(
        (a) => a.saleId === sale.id && !reversedPaymentIds.has(a.paymentId)
      );
      const allocTotal = validAllocations.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      // Refunds linked to this sale's returns or void
      const saleRefunds = allRefunds.filter(
        (rf) => (rf.saleReturnId && saleReturns.some((r) => r.id === rf.saleReturnId)) || (rf.saleVoidId && allVoids.some((v) => v.id === rf.saleVoidId && v.originalSaleId === sale.id))
      );
      const refundTotal = saleRefunds.reduce((sum, rf) => sum + (Number(rf.amount) || 0), 0);

      const netCollectedOnSale = Math.max(0, allocTotal - refundTotal);

      // Line totals
      let saleLineGrossSum = 0;
      let saleLineDiscSum = 0;

      for (const line of lines) {
        const lineGross = roundCurrency((Number(line.quantity) || 0) * (Number(line.rate) || 0));
        const lineDisc = Number(line.discountAmount) || 0;
        saleLineGrossSum += lineGross;
        saleLineDiscSum += lineDisc;

        if (!isVoided) {
          // Accumulate item summary
          const existingItem = itemSummaryMap.get(line.itemId) || {
            itemId: line.itemId,
            itemName: line.itemNameSnapshot,
            unit: line.unit,
            quantitySold: 0,
            grossAmount: 0,
            discountAmount: 0,
            netAmount: 0,
          };
          existingItem.quantitySold += Number(line.quantity) || 0;
          existingItem.grossAmount = addCurrency(existingItem.grossAmount, lineGross);
          existingItem.discountAmount = addCurrency(existingItem.discountAmount, lineDisc);
          existingItem.netAmount = addCurrency(existingItem.netAmount, Number(line.lineTotal) || 0);
          itemSummaryMap.set(line.itemId, existingItem);
        }
      }

      if (isVoided) {
        voidedInvoicesCount++;
        saleVoidsAmount = addCurrency(saleVoidsAmount, Number(sale.totalAmount) || 0);
      } else {
        validInvoicesCount++;
        grossSales = addCurrency(grossSales, saleLineGrossSum || Number(sale.subtotal) || Number(sale.totalAmount) || 0);
        lineDiscounts = addCurrency(lineDiscounts, saleLineDiscSum);
        overallDiscounts = addCurrency(overallDiscounts, Number(sale.discountAmount) || 0);
        netInvoicedSales = addCurrency(netInvoicedSales, Number(sale.totalAmount) || 0);

        if (saleReturnTotal > 0) {
          returnedInvoicesCount++;
          saleReturnsAmount = addCurrency(saleReturnsAmount, saleReturnTotal);
        }

        amountCollected = addCurrency(amountCollected, netCollectedOnSale);
        const due = roundCurrency(Math.max(0, (Number(sale.totalAmount) || 0) - saleReturnTotal - netCollectedOnSale));
        outstandingReceivables = addCurrency(outstandingReceivables, due);

        // Customer Summary accumulation
        const custId = sale.customerId || 'WALK_IN';
        const custName = sale.customerNameSnapshot || (sale.customerId && customerMap.get(sale.customerId)?.name) || 'Walk-in Customer';
        const existingCust = customerSummaryMap.get(custId) || {
          customerId: custId,
          customerName: custName,
          invoicesCount: 0,
          grossSales: 0,
          discounts: 0,
          netSales: 0,
          returns: 0,
          netRealized: 0,
          paid: 0,
          due: 0,
        };

        existingCust.invoicesCount++;
        existingCust.grossSales = addCurrency(existingCust.grossSales, saleLineGrossSum);
        existingCust.discounts = addCurrency(existingCust.discounts, saleLineDiscSum + (Number(sale.discountAmount) || 0));
        existingCust.netSales = addCurrency(existingCust.netSales, Number(sale.totalAmount) || 0);
        existingCust.returns = addCurrency(existingCust.returns, saleReturnTotal);
        existingCust.netRealized = addCurrency(existingCust.netRealized, Math.max(0, (Number(sale.totalAmount) || 0) - saleReturnTotal));
        existingCust.paid = addCurrency(existingCust.paid, netCollectedOnSale);
        existingCust.due = addCurrency(existingCust.due, due);
        customerSummaryMap.set(custId, existingCust);
      }

      return {
        ...sale,
        customerName: sale.customerNameSnapshot || (sale.customerId ? customerMap.get(sale.customerId)?.name : 'Walk-in Customer'),
        voided: isVoided,
        returnCount: saleReturns.length,
        returnAmount: saleReturnTotal,
      };
    });

    const totalDiscounts = roundCurrency(lineDiscounts + overallDiscounts);
    const netRealizedSales = roundCurrency(Math.max(0, netInvoicedSales - saleReturnsAmount));

    // 4. Daily Trend Bucketing
    const dailyBuckets = getDailyBuckets(startDateIso, endDateIso);
    const dailyTrend: SalesReportDailyPoint[] = dailyBuckets.map((bucket) => {
      const bucketSales = enrichedSales.filter(
        (s) => !s.voided && isDateInRange(s.saleDate || s.createdAt, bucket.dayStartIso, bucket.dayEndIso)
      );

      const bGross = bucketSales.reduce((sum, s) => sum + (Number(s.subtotal) || Number(s.totalAmount) || 0), 0);
      const bNet = bucketSales.reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
      const bRet = bucketSales.reduce((sum, s) => sum + (s.returnAmount || 0), 0);

      return {
        dateStr: bucket.dateStr,
        label: bucket.label,
        grossSales: roundCurrency(bGross),
        netSales: roundCurrency(bNet),
        returns: roundCurrency(bRet),
        invoicesCount: bucketSales.length,
      };
    });

    const topCustomers = Array.from(customerSummaryMap.values()).sort((a, b) => b.netRealized - a.netRealized);
    const itemBreakdown = Array.from(itemSummaryMap.values()).sort((a, b) => b.netAmount - a.netAmount);

    return {
      metrics: {
        totalInvoicesCount,
        validInvoicesCount,
        voidedInvoicesCount,
        returnedInvoicesCount,
        grossSales: roundCurrency(grossSales),
        lineDiscounts: roundCurrency(lineDiscounts),
        overallDiscounts: roundCurrency(overallDiscounts),
        totalDiscounts,
        netInvoicedSales: roundCurrency(netInvoicedSales),
        saleReturnsAmount: roundCurrency(saleReturnsAmount),
        saleVoidsAmount: roundCurrency(saleVoidsAmount),
        netRealizedSales,
        amountCollected: roundCurrency(amountCollected),
        outstandingReceivables: roundCurrency(outstandingReceivables),
      },
      sales: enrichedSales,
      dailyTrend,
      topCustomers,
      itemBreakdown,
    };
  },
};
