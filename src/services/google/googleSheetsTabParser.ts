/**
 * Deterministic Google Sheets Tab Deserializer & Type Reconstructor (Phase 7C-2)
 *
 * Converts raw 2D spreadsheet arrays (header row + cell rows) back into typed domain records
 * according to the canonical schema established in Phase 7B-2.
 */

const parseBoolean = (val: any): boolean => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  return false;
};

const parseNumber = (val: any, defaultVal = 0): number => {
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  if (val === null || val === undefined || val === '') return defaultVal;
  const num = Number(val);
  return isNaN(num) ? defaultVal : num;
};

const parseOptionalNumber = (val: any): number | undefined => {
  if (val === null || val === undefined || val === '') return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
};

const parseString = (val: any, defaultVal = ''): string => {
  if (val === null || val === undefined) return defaultVal;
  return String(val);
};

const parseJson = <T>(val: any, defaultVal: T): T => {
  if (!val) return defaultVal;
  if (typeof val === 'object') return val as T;
  try {
    return JSON.parse(String(val)) as T;
  } catch {
    return defaultVal;
  }
};

export const googleSheetsTabParser = {
  /**
   * Converts a 2D raw sheet array into an array of objects keyed by header names.
   */
  parseRawTableToObjects(rawRows: any[][]): Record<string, any>[] {
    if (!rawRows || rawRows.length < 2) return [];
    const headers = rawRows[0].map((h) => parseString(h).trim());
    const dataRows = rawRows.slice(1);

    return dataRows
      .filter((row) => row && row.some((cell) => cell !== null && cell !== undefined && cell !== ''))
      .map((row) => {
        const obj: Record<string, any> = {};
        headers.forEach((header, colIdx) => {
          obj[header] = row[colIdx] !== undefined ? row[colIdx] : '';
        });
        return obj;
      });
  },

  parseBusinesses(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId) || parseString(r.id),
      name: parseString(r.name),
      currencyCode: parseString(r.currencyCode, 'INR'),
      currencySymbol: parseString(r.currencySymbol, '₹'),
      phone: parseString(r.phone) || undefined,
      email: parseString(r.email) || undefined,
      address: parseString(r.address) || undefined,
      taxId: parseString(r.taxId) || undefined,
      fiscalYearStart: parseString(r.fiscalYearStart) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseItems(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      name: parseString(r.name),
      type: parseString(r.type, 'PRODUCT') as any,
      category: parseString(r.category) || undefined,
      sku: parseString(r.sku) || undefined,
      barcode: parseString(r.barcode) || undefined,
      unit: parseString(r.unit, 'pcs'),
      sellingPrice: parseNumber(r.sellingPrice),
      purchasePrice: parseOptionalNumber(r.purchasePrice),
      openingStock: parseNumber(r.openingStock),
      lowStockThreshold: parseOptionalNumber(r.lowStockThreshold),
      trackInventory: parseBoolean(r.trackInventory),
      isActive: parseBoolean(r.isActive),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseCustomers(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      name: parseString(r.name),
      phone: parseString(r.phone) || undefined,
      email: parseString(r.email) || undefined,
      address: parseString(r.address) || undefined,
      notes: parseString(r.notes) || undefined,
      isActive: parseBoolean(r.isActive),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSuppliers(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      name: parseString(r.name),
      phone: parseString(r.phone) || undefined,
      email: parseString(r.email) || undefined,
      address: parseString(r.address) || undefined,
      taxId: parseString(r.taxId) || undefined,
      paymentTerms: parseString(r.paymentTerms) || undefined,
      notes: parseString(r.notes) || undefined,
      isActive: parseBoolean(r.isActive),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSales(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      invoiceNumber: parseString(r.invoiceNumber),
      customerId: parseString(r.customerId),
      customerNameSnapshot: parseString(r.customerNameSnapshot),
      saleDate: parseString(r.saleDate),
      status: parseString(r.status, 'FINAL') as any,
      subtotal: parseNumber(r.subtotal),
      discountType: (parseString(r.discountType) || undefined) as any,
      discountValue: parseOptionalNumber(r.discountValue),
      discountAmount: parseNumber(r.discountAmount),
      taxAmount: parseNumber(r.taxAmount),
      totalAmount: parseNumber(r.totalAmount),
      paidAmount: parseNumber(r.paidAmount),
      dueAmount: parseNumber(r.dueAmount),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSaleLines(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      saleId: parseString(r.saleId),
      itemId: parseString(r.itemId),
      itemNameSnapshot: parseString(r.itemNameSnapshot),
      quantity: parseNumber(r.quantity),
      unit: parseString(r.unit, 'pcs'),
      rate: parseNumber(r.rate),
      discountType: (parseString(r.discountType) || undefined) as any,
      discountValue: parseOptionalNumber(r.discountValue),
      discountAmount: parseNumber(r.discountAmount),
      taxAmount: parseNumber(r.taxAmount),
      lineTotal: parseNumber(r.lineTotal),
      createdAt: parseString(r.createdAt),
      updatedAt: parseString(r.updatedAt),
      version: parseNumber(r.version, 1),
    }));
  },

  parseSaleReturns(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      originalSaleId: parseString(r.originalSaleId),
      customerId: parseString(r.customerId),
      returnNumber: parseString(r.returnNumber),
      returnDate: parseString(r.returnDate),
      totalAmount: parseNumber(r.totalAmount),
      reason: (parseString(r.reason) || undefined) as any,
      notes: parseString(r.notes) || undefined,
      settlementMode: parseString(r.settlementMode, 'CUSTOMER_CREDIT') as any,
      refundAmount: parseOptionalNumber(r.refundAmount),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSaleReturnLines(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      saleReturnId: parseString(r.saleReturnId),
      originalSaleId: parseString(r.originalSaleId),
      originalSaleLineId: parseString(r.originalSaleLineId),
      itemId: parseString(r.itemId),
      itemNameSnapshot: parseString(r.itemNameSnapshot),
      quantity: parseNumber(r.quantity),
      unit: parseString(r.unit, 'pcs'),
      rate: parseNumber(r.rate),
      discountAmount: parseNumber(r.discountAmount),
      taxAmount: parseNumber(r.taxAmount),
      totalAmount: parseNumber(r.totalAmount),
      trackInventory: parseBoolean(r.trackInventory),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSaleVoids(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      originalSaleId: parseString(r.originalSaleId),
      customerId: parseString(r.customerId),
      reason: parseString(r.reason) || undefined,
      voidDate: parseString(r.voidDate),
      settlementMode: (parseString(r.settlementMode) || undefined) as any,
      refundAmount: parseOptionalNumber(r.refundAmount),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parsePayments(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      partyType: parseString(r.partyType, 'CUSTOMER') as any,
      partyId: parseString(r.partyId) || undefined,
      referenceType: parseString(r.referenceType, 'DIRECT') as any,
      referenceId: parseString(r.referenceId) || undefined,
      amount: parseNumber(r.amount),
      paymentDate: parseString(r.paymentDate),
      paymentMethod: parseString(r.paymentMethod, 'CASH') as any,
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parsePaymentAllocations(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      paymentId: parseString(r.paymentId),
      saleId: parseString(r.saleId),
      customerId: parseString(r.customerId),
      amount: parseNumber(r.amount),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parsePaymentReversals(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      originalPaymentId: parseString(r.originalPaymentId),
      customerId: parseString(r.customerId),
      amount: parseNumber(r.amount),
      reason: parseString(r.reason) || undefined,
      reversalDate: parseString(r.reversalDate),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseRefunds(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      customerId: parseString(r.customerId) || undefined,
      saleReturnId: parseString(r.saleReturnId) || undefined,
      saleVoidId: parseString(r.saleVoidId) || undefined,
      amount: parseNumber(r.amount),
      refundDate: parseString(r.refundDate),
      paymentMethod: parseString(r.paymentMethod, 'CASH') as any,
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parsePurchases(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      purchaseNumber: parseString(r.purchaseNumber),
      supplierId: parseString(r.supplierId) || undefined,
      supplierNameSnapshot: parseString(r.supplierNameSnapshot),
      purchaseDate: parseString(r.purchaseDate),
      status: parseString(r.status, 'FINAL') as any,
      subtotal: parseNumber(r.subtotal),
      discountType: (parseString(r.discountType) || undefined) as any,
      discountValue: parseOptionalNumber(r.discountValue),
      discountAmount: parseNumber(r.discountAmount),
      taxAmount: parseNumber(r.taxAmount),
      totalAmount: parseNumber(r.totalAmount),
      paidAmount: parseNumber(r.paidAmount),
      dueAmount: parseNumber(r.dueAmount),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parsePurchaseLines(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      purchaseId: parseString(r.purchaseId),
      itemId: parseString(r.itemId),
      itemNameSnapshot: parseString(r.itemNameSnapshot),
      quantity: parseNumber(r.quantity),
      unit: parseString(r.unit, 'pcs'),
      unitCost: parseNumber(r.unitCost),
      discountType: (parseString(r.discountType) || undefined) as any,
      discountValue: parseOptionalNumber(r.discountValue),
      discountAmount: parseNumber(r.discountAmount),
      taxAmount: parseNumber(r.taxAmount),
      lineTotal: parseNumber(r.lineTotal),
      trackInventory: parseBoolean(r.trackInventory),
      createdAt: parseString(r.createdAt),
      updatedAt: parseString(r.updatedAt),
      version: parseNumber(r.version, 1),
    }));
  },

  parsePurchaseReturns(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      originalPurchaseId: parseString(r.originalPurchaseId),
      supplierId: parseString(r.supplierId) || undefined,
      returnNumber: parseString(r.returnNumber),
      returnDate: parseString(r.returnDate),
      totalAmount: parseNumber(r.totalAmount),
      reason: (parseString(r.reason) || undefined) as any,
      notes: parseString(r.notes) || undefined,
      settlementMode: parseString(r.settlementMode, 'SUPPLIER_CREDIT') as any,
      refundAmount: parseOptionalNumber(r.refundAmount),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parsePurchaseReturnLines(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      purchaseReturnId: parseString(r.purchaseReturnId),
      originalPurchaseId: parseString(r.originalPurchaseId),
      originalPurchaseLineId: parseString(r.originalPurchaseLineId),
      itemId: parseString(r.itemId),
      itemNameSnapshot: parseString(r.itemNameSnapshot),
      quantity: parseNumber(r.quantity),
      unit: parseString(r.unit, 'pcs'),
      unitCost: parseNumber(r.unitCost),
      discountAmount: parseNumber(r.discountAmount),
      taxAmount: parseNumber(r.taxAmount),
      totalAmount: parseNumber(r.totalAmount),
      trackInventory: parseBoolean(r.trackInventory),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parsePurchaseVoids(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      originalPurchaseId: parseString(r.originalPurchaseId),
      supplierId: parseString(r.supplierId) || undefined,
      reason: parseString(r.reason) || undefined,
      voidDate: parseString(r.voidDate),
      settlementMode: (parseString(r.settlementMode) || undefined) as any,
      refundAmount: parseOptionalNumber(r.refundAmount),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSupplierPayments(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      supplierId: parseString(r.supplierId) || undefined,
      referenceType: parseString(r.referenceType, 'PURCHASE') as any,
      referenceId: parseString(r.referenceId) || undefined,
      amount: parseNumber(r.amount),
      paymentDate: parseString(r.paymentDate),
      paymentMethod: parseString(r.paymentMethod, 'CASH') as any,
      direction: 'OUT' as const,
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSupplierPaymentAllocations(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      supplierPaymentId: parseString(r.supplierPaymentId),
      purchaseId: parseString(r.purchaseId),
      supplierId: parseString(r.supplierId),
      amount: parseNumber(r.amount),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSupplierPaymentReversals(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      originalPaymentId: parseString(r.originalPaymentId),
      supplierId: parseString(r.supplierId),
      amount: parseNumber(r.amount),
      reason: parseString(r.reason) || undefined,
      reversalDate: parseString(r.reversalDate),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseRefundsReceived(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      supplierId: parseString(r.supplierId) || undefined,
      purchaseReturnId: parseString(r.purchaseReturnId) || undefined,
      purchaseVoidId: parseString(r.purchaseVoidId) || undefined,
      amount: parseNumber(r.amount),
      refundDate: parseString(r.refundDate),
      paymentMethod: parseString(r.paymentMethod, 'CASH') as any,
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseStockMovements(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      itemId: parseString(r.itemId),
      type: parseString(r.type, 'ADJUSTMENT') as any,
      quantityChange: parseNumber(r.quantityChange),
      reason: parseString(r.reason) || undefined,
      referenceId: parseString(r.referenceId) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      version: parseNumber(r.version, 1),
    }));
  },

  parseFinancialAccounts(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      name: parseString(r.name),
      type: parseString(r.type, 'CASH') as any,
      openingBalance: parseOptionalNumber(r.openingBalance),
      isDefault: parseBoolean(r.isDefault),
      isArchived: parseBoolean(r.isArchived),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseFinancialMovements(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      accountId: parseString(r.accountId),
      type: parseString(r.type, 'MANUAL_ADJUSTMENT') as any,
      direction: parseString(r.direction, 'INFLOW') as any,
      amount: parseNumber(r.amount),
      movementDate: parseString(r.movementDate),
      referenceType: (parseString(r.referenceType) || undefined) as any,
      referenceId: parseString(r.referenceId) || undefined,
      description: parseString(r.description) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseExpenseCategories(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      name: parseString(r.name),
      icon: parseString(r.icon) || undefined,
      color: parseString(r.color) || undefined,
      isDefault: parseBoolean(r.isDefault),
      isArchived: parseBoolean(r.isArchived),
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseExpenses(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      expenseNumber: parseString(r.expenseNumber),
      categoryId: parseString(r.categoryId),
      financialAccountId: parseString(r.financialAccountId) || undefined,
      amount: parseNumber(r.amount),
      paymentMethod: parseString(r.paymentMethod, 'CASH') as any,
      expenseDate: parseString(r.expenseDate),
      payee: parseString(r.payee) || undefined,
      notes: parseString(r.notes) || undefined,
      receiptUrl: parseString(r.receiptUrl) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseExpenseReversals(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      originalExpenseId: parseString(r.originalExpenseId),
      financialAccountId: parseString(r.financialAccountId) || undefined,
      amount: parseNumber(r.amount),
      reason: parseString(r.reason) || undefined,
      reversalDate: parseString(r.reversalDate),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseAccountTransfers(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      transferNumber: parseString(r.transferNumber),
      fromAccountId: parseString(r.fromAccountId),
      toAccountId: parseString(r.toAccountId),
      amount: parseNumber(r.amount),
      transferDate: parseString(r.transferDate),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseAccountTransferReversals(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      businessId: parseString(r.businessId),
      originalTransferId: parseString(r.originalTransferId),
      fromAccountId: parseString(r.fromAccountId),
      toAccountId: parseString(r.toAccountId),
      amount: parseNumber(r.amount),
      reason: parseString(r.reason) || undefined,
      reversalDate: parseString(r.reversalDate),
      notes: parseString(r.notes) || undefined,
      createdAt: parseString(r.createdAt),
      createdByDeviceId: parseString(r.createdByDeviceId),
      updatedAt: parseString(r.updatedAt),
      updatedByDeviceId: parseString(r.updatedByDeviceId),
      version: parseNumber(r.version, 1),
      isDeleted: parseBoolean(r.isDeleted),
    }));
  },

  parseSyncMetadata(rawRows: any[][]): any[] {
    const records = this.parseRawTableToObjects(rawRows);
    return records.map((r) => ({
      id: parseString(r.id),
      recordId: parseString(r.recordId),
      recordType: parseString(r.recordType) as any,
      syncState: parseString(r.syncState, 'LOCAL_ONLY') as any,
      lastSyncedAt: parseString(r.lastSyncedAt) || undefined,
      lastSyncedVersion: parseNumber(r.lastSyncedVersion),
      updatedAt: parseString(r.updatedAt),
      version: parseNumber(r.version, 1),
    }));
  },
};
