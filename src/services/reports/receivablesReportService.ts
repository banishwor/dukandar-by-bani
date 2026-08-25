import { db } from '../../db/database';
import { roundCurrency, addCurrency, subtractCurrency } from '../../utils/money';
import { paymentService } from '../paymentService';
import type { Customer } from '../../types';

export interface ReceivablesReportFilter {
  customerId?: string;
  onlyWithBalance?: boolean;
  onlyWithCredit?: boolean;
  searchQuery?: string;
}

export interface CustomerReceivableRow {
  customerId: string;
  customerName: string;
  phone?: string;
  address?: string;
  invoicesCount: number;
  totalInvoicedSales: number;
  totalPaid: number;
  outstandingBalance: number;
  customerCredit: number;
  netReceivable: number;
  lastPaymentDate?: string;
  status: 'DUE' | 'CREDIT' | 'SETTLED';
}

export interface ReceivablesReportMetrics {
  totalCustomersCount: number;
  customersWithDueCount: number;
  customersWithCreditCount: number;
  settledCustomersCount: number;

  totalOutstandingBalance: number;
  totalCustomerCredit: number;
  netReceivable: number;
}

export interface ReceivablesReportResult {
  metrics: ReceivablesReportMetrics;
  customers: CustomerReceivableRow[];
}

export const receivablesReportService = {
  async generateReceivablesReport(
    businessId: string,
    filter: ReceivablesReportFilter = {}
  ): Promise<ReceivablesReportResult> {
    const { customerId, onlyWithBalance = false, onlyWithCredit = false, searchQuery = '' } = filter;

    const allCustomers = await db.customers
      .where('businessId')
      .equals(businessId)
      .filter((c) => !c.isDeleted)
      .toArray();

    const query = searchQuery.trim().toLowerCase();
    const filteredCustomers = allCustomers.filter((c) => {
      if (customerId && c.id !== customerId) return false;
      if (query) {
        const nameMatch = c.name.toLowerCase().includes(query);
        const phoneMatch = (c.phone || '').includes(query);
        const addrMatch = (c.address || '').toLowerCase().includes(query);
        if (!nameMatch && !phoneMatch && !addrMatch) return false;
      }
      return true;
    });

    const rows: CustomerReceivableRow[] = [];
    let totalOutstandingBalance = 0;
    let totalCustomerCredit = 0;
    let customersWithDueCount = 0;
    let customersWithCreditCount = 0;
    let settledCustomersCount = 0;

    for (const cust of filteredCustomers) {
      const summary = await paymentService.getCustomerFinancialSummary(cust.id);

      const due = summary.outstandingBalance;
      const credit = summary.customerCredit;
      const net = summary.netReceivable;

      if (onlyWithBalance && due <= 0) continue;
      if (onlyWithCredit && credit <= 0) continue;

      let status: 'DUE' | 'CREDIT' | 'SETTLED' = 'SETTLED';
      if (due > 0.005) {
        status = 'DUE';
        customersWithDueCount++;
      } else if (credit > 0.005) {
        status = 'CREDIT';
        customersWithCreditCount++;
      } else {
        settledCustomersCount++;
      }

      totalOutstandingBalance = addCurrency(totalOutstandingBalance, due);
      totalCustomerCredit = addCurrency(totalCustomerCredit, credit);

      rows.push({
        customerId: cust.id,
        customerName: cust.name,
        phone: cust.phone,
        address: cust.address,
        invoicesCount: summary.outstandingInvoicesCount,
        totalInvoicedSales: summary.totalSales,
        totalPaid: summary.totalPaid,
        outstandingBalance: due,
        customerCredit: credit,
        netReceivable: net,
        status,
      });
    }

    // Sort by largest outstanding balance first, then credit
    rows.sort((a, b) => b.outstandingBalance - a.outstandingBalance || b.customerCredit - a.customerCredit);

    const netReceivable = roundCurrency(subtractCurrency(totalOutstandingBalance, totalCustomerCredit));

    return {
      metrics: {
        totalCustomersCount: rows.length,
        customersWithDueCount,
        customersWithCreditCount,
        settledCustomersCount,
        totalOutstandingBalance: roundCurrency(totalOutstandingBalance),
        totalCustomerCredit: roundCurrency(totalCustomerCredit),
        netReceivable,
      },
      customers: rows,
    };
  },
};
