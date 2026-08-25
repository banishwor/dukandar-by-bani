import { db } from '../../db/database';
import { roundCurrency, addCurrency, subtractCurrency } from '../../utils/money';
import { supplierPaymentService } from '../supplierPaymentService';
import type { Supplier } from '../../types';

export interface PayablesReportFilter {
  supplierId?: string;
  onlyWithBalance?: boolean;
  onlyWithCredit?: boolean;
  searchQuery?: string;
}

export interface SupplierPayableRow {
  supplierId: string;
  supplierName: string;
  phone?: string;
  address?: string;
  billsCount: number;
  totalInvoicedPurchases: number;
  totalPaid: number;
  outstandingPayable: number;
  supplierCredit: number;
  netPayable: number;
  status: 'DUE' | 'CREDIT' | 'SETTLED';
}

export interface PayablesReportMetrics {
  totalSuppliersCount: number;
  suppliersWithDueCount: number;
  suppliersWithCreditCount: number;
  settledSuppliersCount: number;

  totalOutstandingPayable: number;
  totalSupplierCredit: number;
  netPayable: number;
}

export interface PayablesReportResult {
  metrics: PayablesReportMetrics;
  suppliers: SupplierPayableRow[];
}

export const payablesReportService = {
  async generatePayablesReport(
    businessId: string,
    filter: PayablesReportFilter = {}
  ): Promise<PayablesReportResult> {
    const { supplierId, onlyWithBalance = false, onlyWithCredit = false, searchQuery = '' } = filter;

    const allSuppliers = await db.suppliers
      .where('businessId')
      .equals(businessId)
      .filter((s) => !s.isDeleted)
      .toArray();

    const query = searchQuery.trim().toLowerCase();
    const filteredSuppliers = allSuppliers.filter((s) => {
      if (supplierId && s.id !== supplierId) return false;
      if (query) {
        const nameMatch = s.name.toLowerCase().includes(query);
        const phoneMatch = (s.phone || '').includes(query);
        const addrMatch = (s.address || '').toLowerCase().includes(query);
        if (!nameMatch && !phoneMatch && !addrMatch) return false;
      }
      return true;
    });

    const rows: SupplierPayableRow[] = [];
    let totalOutstandingPayable = 0;
    let totalSupplierCredit = 0;
    let suppliersWithDueCount = 0;
    let suppliersWithCreditCount = 0;
    let settledSuppliersCount = 0;

    for (const supp of filteredSuppliers) {
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supp.id);

      const due = summary.outstandingPayable;
      const credit = summary.supplierCredit;
      const net = summary.netPayable;

      if (onlyWithBalance && due <= 0) continue;
      if (onlyWithCredit && credit <= 0) continue;

      let status: 'DUE' | 'CREDIT' | 'SETTLED' = 'SETTLED';
      if (due > 0.005) {
        status = 'DUE';
        suppliersWithDueCount++;
      } else if (credit > 0.005) {
        status = 'CREDIT';
        suppliersWithCreditCount++;
      } else {
        settledSuppliersCount++;
      }

      totalOutstandingPayable = addCurrency(totalOutstandingPayable, due);
      totalSupplierCredit = addCurrency(totalSupplierCredit, credit);

      rows.push({
        supplierId: supp.id,
        supplierName: supp.name,
        phone: supp.phone,
        address: supp.address,
        billsCount: summary.outstandingPurchasesCount,
        totalInvoicedPurchases: summary.totalPurchases,
        totalPaid: summary.totalPaid,
        outstandingPayable: due,
        supplierCredit: credit,
        netPayable: net,
        status,
      });
    }

    // Sort by largest outstanding payable first, then credit
    rows.sort((a, b) => b.outstandingPayable - a.outstandingPayable || b.supplierCredit - a.supplierCredit);

    const netPayable = roundCurrency(subtractCurrency(totalOutstandingPayable, totalSupplierCredit));

    return {
      metrics: {
        totalSuppliersCount: rows.length,
        suppliersWithDueCount,
        suppliersWithCreditCount,
        settledSuppliersCount,
        totalOutstandingPayable: roundCurrency(totalOutstandingPayable),
        totalSupplierCredit: roundCurrency(totalSupplierCredit),
        netPayable,
      },
      suppliers: rows,
    };
  },
};
