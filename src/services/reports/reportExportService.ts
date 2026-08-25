/**
 * Report CSV Export Utilities
 *
 * Generates standards-compliant CSV strings and initiates direct browser downloads.
 */

export const reportExportService = {
  /**
   * Converts an array of objects into a properly escaped CSV string.
   */
  convertToCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
    const escapeCell = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };

    const headerLine = headers.map(escapeCell).join(',');
    const bodyLines = rows.map((row) => row.map(escapeCell).join(','));
    return [headerLine, ...bodyLines].join('\r\n');
  },

  /**
   * Triggers a browser download of a CSV file.
   */
  downloadCsv(filename: string, csvContent: string): void {
    if (typeof window === 'undefined') return;

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Export Sales Report
  exportSalesReport(sales: any[], businessName: string = 'Business'): void {
    const headers = [
      'Invoice #',
      'Date',
      'Customer',
      'Status',
      'Gross Total',
      'Line Discount',
      'Bill Discount',
      'Net Invoice Total',
      'Paid Amount',
      'Due Amount',
      'Return Amount',
      'Voided',
    ];

    const rows = sales.map((s) => [
      s.invoiceNumber,
      s.saleDate ? s.saleDate.slice(0, 10) : '',
      s.customerNameSnapshot || s.customerName || 'Walk-in',
      s.status,
      s.subtotal || s.totalAmount,
      s.lineDiscountAmount || 0,
      s.discountAmount || 0,
      s.totalAmount,
      s.paidAmount,
      s.dueAmount,
      s.returnAmount || 0,
      s.voided ? 'YES' : 'NO',
    ]);

    const csv = this.convertToCsv(headers, rows);
    this.downloadCsv(`Sales_Report_${businessName}_${new Date().toISOString().slice(0, 10)}`, csv);
  },

  // Export Purchases Report
  exportPurchasesReport(purchases: any[], businessName: string = 'Business'): void {
    const headers = [
      'Bill #',
      'Date',
      'Supplier',
      'Status',
      'Gross Total',
      'Bill Discount',
      'Net Total',
      'Paid Amount',
      'Due Amount',
      'Return Amount',
      'Voided',
    ];

    const rows = purchases.map((p) => [
      p.purchaseNumber,
      p.purchaseDate ? p.purchaseDate.slice(0, 10) : '',
      p.supplierNameSnapshot || p.supplierName || 'Direct Vendor',
      p.status,
      p.subtotal || p.totalAmount,
      p.discountAmount || 0,
      p.totalAmount,
      p.paidAmount,
      p.dueAmount,
      p.returnAmount || 0,
      p.voided ? 'YES' : 'NO',
    ]);

    const csv = this.convertToCsv(headers, rows);
    this.downloadCsv(`Purchases_Report_${businessName}_${new Date().toISOString().slice(0, 10)}`, csv);
  },

  // Export Expense Report
  exportExpenseReport(expenses: any[], businessName: string = 'Business'): void {
    const headers = ['Date', 'Category', 'Account', 'Amount', 'Payee', 'Description', 'Reversed'];

    const rows = expenses.map((e) => [
      e.expenseDate ? e.expenseDate.slice(0, 10) : '',
      e.categoryName || 'General',
      e.accountName || 'Cash',
      e.amount,
      e.payee || '',
      e.description || '',
      e.isReversed ? 'YES' : 'NO',
    ]);

    const csv = this.convertToCsv(headers, rows);
    this.downloadCsv(`Expenses_Report_${businessName}_${new Date().toISOString().slice(0, 10)}`, csv);
  },

  // Export Cash Flow Report
  exportCashFlowReport(movements: any[], businessName: string = 'Business'): void {
    const headers = ['Date', 'Account', 'Direction', 'Type', 'Amount', 'Description', 'Internal Transfer'];

    const rows = movements.map((m) => [
      m.movementDate ? m.movementDate.slice(0, 10) : '',
      m.accountName || '',
      m.direction,
      m.type,
      m.amount,
      m.description || '',
      m.isInternalTransfer ? 'YES' : 'NO',
    ]);

    const csv = this.convertToCsv(headers, rows);
    this.downloadCsv(`Cash_Flow_Report_${businessName}_${new Date().toISOString().slice(0, 10)}`, csv);
  },

  // Export Receivables Report
  exportReceivablesReport(customers: any[], businessName: string = 'Business'): void {
    const headers = [
      'Customer',
      'Phone',
      'City',
      'Total Sales',
      'Total Paid',
      'Returns',
      'Outstanding Due',
      'Credit Available',
      'Net Position',
      'Status',
    ];

    const rows = customers.map((c) => [
      c.customerName,
      c.phone || '',
      c.city || '',
      c.totalInvoicedSales,
      c.totalPaid,
      c.totalReturns,
      c.outstandingBalance,
      c.customerCredit,
      c.netReceivable,
      c.status,
    ]);

    const csv = this.convertToCsv(headers, rows);
    this.downloadCsv(`Receivables_Report_${businessName}_${new Date().toISOString().slice(0, 10)}`, csv);
  },

  // Export Payables Report
  exportPayablesReport(suppliers: any[], businessName: string = 'Business'): void {
    const headers = [
      'Supplier',
      'Phone',
      'City',
      'Total Purchases',
      'Total Paid',
      'Returns',
      'Outstanding Payable',
      'Credit Available',
      'Net Position',
      'Status',
    ];

    const rows = suppliers.map((s) => [
      s.supplierName,
      s.phone || '',
      s.city || '',
      s.totalInvoicedPurchases,
      s.totalPaid,
      s.totalReturns,
      s.outstandingPayable,
      s.supplierCredit,
      s.netPayable,
      s.status,
    ]);

    const csv = this.convertToCsv(headers, rows);
    this.downloadCsv(`Payables_Report_${businessName}_${new Date().toISOString().slice(0, 10)}`, csv);
  },

  // Export Inventory Report
  exportInventoryReport(items: any[], businessName: string = 'Business'): void {
    const headers = [
      'Product Name',
      'SKU',
      'Category',
      'Unit',
      'Current Stock',
      'Unit Cost',
      'Selling Price',
      'Valuation @ Cost',
      'Valuation @ Retail',
      'Status',
    ];

    const rows = items.map((i) => [
      i.name,
      i.sku || '',
      i.category || '',
      i.unit,
      i.currentStock,
      i.costPrice,
      i.sellingPrice,
      i.valuationAtCost,
      i.valuationAtRetail,
      i.status,
    ]);

    const csv = this.convertToCsv(headers, rows);
    this.downloadCsv(`Inventory_Report_${businessName}_${new Date().toISOString().slice(0, 10)}`, csv);
  },
};
