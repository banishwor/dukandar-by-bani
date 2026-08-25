import { db } from '../db/database';
import { discountUtils, DiscountValidationError } from '../utils/discount';
import { saleService } from './saleService';
import { purchaseService } from './purchaseService';
import { saleCorrectionService } from './saleCorrectionService';
import { purchaseCorrectionService } from './purchaseCorrectionService';
import { paymentService } from './paymentService';
import { supplierPaymentService } from './supplierPaymentService';
import { financialAccountService } from './financialAccountService';
import { customerRepository } from '../repositories/customerRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { itemRepository } from '../repositories/itemRepository';
import { businessRepository } from '../repositories/businessRepository';
import { generateUniqueId } from '../utils/id';
import { roundCurrency } from '../utils/money';
import type { DiscountType, CompleteSalePayload, CompletePurchasePayload } from '../types';

export interface DiscountTestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: Record<string, any>;
}

export const runDiscountTestSuite = async (): Promise<DiscountTestResult[]> => {
  const results: DiscountTestResult[] = [];

  const runTest = async (
    name: string,
    testFn: () => Promise<{ passed: boolean; message: string; details?: Record<string, any> }>
  ) => {
    const start = performance.now();
    try {
      const outcome = await testFn();
      results.push({
        name,
        passed: outcome.passed,
        message: outcome.message,
        durationMs: Math.round(performance.now() - start),
        details: outcome.details,
      });
    } catch (err: any) {
      results.push({
        name,
        passed: false,
        message: `Exception: ${err?.message || String(err)}`,
        durationMs: Math.round(performance.now() - start),
        details: { error: String(err), stack: err?.stack },
      });
    }
  };

  const createTestBusiness = async (prefix: string) => {
    const created = await businessRepository.createBusiness({
      businessId: '',
      name: `${prefix}_${Date.now()}`,
      currencyCode: 'INR',
      currencySymbol: '₹',
    });
    return created.id;
  };

  const createItem = async (businessId: string, name: string, stock: number, cost: number, rate: number) => {
    return await itemRepository.createItem(businessId, {
      name: `${name}_${Date.now().toString().slice(-4)}`,
      type: 'PRODUCT',
      unit: 'pcs',
      sellingPrice: rate,
      purchasePrice: cost,
      openingStock: stock,
      trackInventory: true,
      lowStockThreshold: 5,
      isActive: true,
    });
  };

  const createCustomer = async (businessId: string, name: string) => {
    return await customerRepository.createCustomer(businessId, {
      name: `${name}_${Date.now().toString().slice(-4)}`,
      phone: '9876543210',
      isActive: true,
    });
  };

  const createSupplier = async (businessId: string, name: string) => {
    return await supplierRepository.createSupplier(businessId, {
      name: `${name}_${Date.now().toString().slice(-4)}`,
      phone: '9123456780',
      isActive: true,
    });
  };

  // Test 1: No discount
  await runTest('Discount Test 1: No Discount baseline', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [{ quantity: 2, rateOrCost: 100, discountType: 'NONE', discountValue: 0 }],
      'NONE',
      0
    );
    const passed = calc.subtotal === 200 && calc.overallDiscountAmount === 0 && calc.finalTotal === 200;
    return { passed, message: 'Gross=₹200, Subtotal=₹200, Final=₹200.', details: calc };
  });

  // Test 2: Line percentage discount
  await runTest('Discount Test 2: Line percentage discount', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [{ quantity: 2, rateOrCost: 100, discountType: 'PERCENTAGE', discountValue: 10 }],
      'NONE',
      0
    );
    const passed = calc.totalLineDiscounts === 20 && calc.subtotal === 180 && calc.finalTotal === 180;
    return { passed, message: '2 × ₹100 with 10% disc = ₹180.', details: calc };
  });

  // Test 3: Line flat discount
  await runTest('Discount Test 3: Line flat discount', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [{ quantity: 2, rateOrCost: 100, discountType: 'FLAT', discountValue: 20 }],
      'NONE',
      0
    );
    const passed = calc.totalLineDiscounts === 20 && calc.subtotal === 180 && calc.finalTotal === 180;
    return { passed, message: '2 × ₹100 with ₹20 flat disc = ₹180.', details: calc };
  });

  // Test 4: Multiple lines with different discount types
  await runTest('Discount Test 4: Multiple lines with mixed discount types', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [
        { quantity: 2, rateOrCost: 100, discountType: 'PERCENTAGE', discountValue: 10 }, // 200 - 20 = 180
        { quantity: 1, rateOrCost: 50, discountType: 'FLAT', discountValue: 10 },        // 50 - 10 = 40
        { quantity: 3, rateOrCost: 20, discountType: 'NONE', discountValue: 0 },          // 60 - 0 = 60
      ],
      'NONE',
      0
    );
    const passed = calc.grossSubtotal === 310 && calc.totalLineDiscounts === 30 && calc.subtotal === 280 && calc.finalTotal === 280;
    return { passed, message: 'Gross=₹310, LineDisc=₹30, Subtotal=₹280, Final=₹280.', details: calc };
  });

  // Test 5: Overall percentage discount
  await runTest('Discount Test 5: Overall percentage discount', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [{ quantity: 10, rateOrCost: 100, discountType: 'NONE', discountValue: 0 }],
      'PERCENTAGE',
      10
    );
    const passed = calc.subtotal === 1000 && calc.overallDiscountAmount === 100 && calc.finalTotal === 900;
    return { passed, message: 'Subtotal=₹1,000, 10% Overall=₹100, Final=₹900.', details: calc };
  });

  // Test 6: Overall flat discount
  await runTest('Discount Test 6: Overall flat discount', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [{ quantity: 10, rateOrCost: 100, discountType: 'NONE', discountValue: 0 }],
      'FLAT',
      150
    );
    const passed = calc.subtotal === 1000 && calc.overallDiscountAmount === 150 && calc.finalTotal === 850;
    return { passed, message: 'Subtotal=₹1,000, ₹150 Flat Overall=₹150, Final=₹850.', details: calc };
  });

  // Test 7: Line discounts + overall discount together (Order verification)
  await runTest('Discount Test 7: Line discounts + overall discount strict calculation order', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [
        { quantity: 2, rateOrCost: 100, discountType: 'PERCENTAGE', discountValue: 10 }, // 180
        { quantity: 1, rateOrCost: 50, discountType: 'FLAT', discountValue: 10 },        // 40
      ],
      'PERCENTAGE',
      5 // 5% of 220 = 11
    );
    const passed = calc.subtotal === 220 && calc.overallDiscountAmount === 11 && calc.finalTotal === 209;
    return { passed, message: 'Subtotal=₹220, Overall 5%=₹11, Final=₹209.', details: calc };
  });

  // Test 8: Maximum 100% percentage discount
  await runTest('Discount Test 8: 100% max percentage discount', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [{ quantity: 5, rateOrCost: 100, discountType: 'PERCENTAGE', discountValue: 100 }],
      'NONE',
      0
    );
    const passed = calc.totalLineDiscounts === 500 && calc.subtotal === 0 && calc.finalTotal === 0;
    return { passed, message: '100% discount reduces total to ₹0 without going negative.', details: calc };
  });

  // Test 9: Flat discount equal to line amount
  await runTest('Discount Test 9: Flat discount equal to exact line gross amount', async () => {
    const calc = discountUtils.calculateTransactionTotals(
      [{ quantity: 2, rateOrCost: 100, discountType: 'FLAT', discountValue: 200 }],
      'NONE',
      0
    );
    const passed = calc.subtotal === 0 && calc.finalTotal === 0;
    return { passed, message: '₹200 flat discount on ₹200 gross = ₹0 line total.', details: calc };
  });

  // Test 10: Over-discount rejected
  await runTest('Discount Test 10: Over-discount rejected', async () => {
    let lineOverRejected = false;
    let txOverRejected = false;

    try {
      discountUtils.calculateLineDiscount(100, 'FLAT', 150);
    } catch (e: any) {
      if (e instanceof DiscountValidationError) lineOverRejected = true;
    }

    try {
      discountUtils.calculateTransactionDiscount(100, 'PERCENTAGE', 110);
    } catch (e: any) {
      if (e instanceof DiscountValidationError) txOverRejected = true;
    }

    const passed = lineOverRejected && txOverRejected;
    return { passed, message: 'Line and transaction over-discounts properly rejected by validation.', details: { lineOverRejected, txOverRejected } };
  });

  // Test 11: Negative discount rejected
  await runTest('Discount Test 11: Negative discount rejected', async () => {
    let rejected = false;
    try {
      discountUtils.calculateLineDiscount(100, 'PERCENTAGE', -10);
    } catch (e: any) {
      if (e instanceof DiscountValidationError) rejected = true;
    }
    return { passed: rejected, message: 'Negative discount rejected.', details: { rejected } };
  });

  // Test 12: Sale payment uses discounted final total
  await runTest('Discount Test 12: Sale payment uses discounted final total', async () => {
    const businessId = await createTestBusiness('DT12');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await createItem(businessId, 'Prod12', 10, 50, 100);
    const cust = await createCustomer(businessId, 'Cust12');

    // 2 x 100 = 200, 10% line disc = 180, 10% overall = 162
    const sale = await saleService.completeSale(businessId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 2,
        unit: 'pcs',
        rate: 100,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        trackInventory: true,
      }],
      subtotal: 180,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      discountAmount: 18,
      taxAmount: 0,
      totalAmount: 162,
      paidAmount: 162,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const passed = sale.totalAmount === 162 && sale.paidAmount === 162 && sale.dueAmount === 0 && sale.status === 'PAID';
    return { passed, message: 'Sale total amount is ₹162, paid in full for ₹162.', details: sale };
  });

  // Test 13: Purchase payable uses discounted final total
  await runTest('Discount Test 13: Purchase payable uses discounted final total', async () => {
    const businessId = await createTestBusiness('DT13');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await createItem(businessId, 'Prod13', 0, 80, 120);
    const supp = await createSupplier(businessId, 'Supp13');

    // 10 x 80 = 800, flat 100 line disc = 700, flat 50 overall = 650
    const pur = await purchaseService.completePurchase(businessId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 10,
        unit: 'pcs',
        unitCost: 80,
        discountType: 'FLAT',
        discountValue: 100,
        trackInventory: true,
      }],
      subtotal: 700,
      discountType: 'FLAT',
      discountValue: 50,
      discountAmount: 50,
      taxAmount: 0,
      totalAmount: 650,
      paidAmount: 0, // Unpaid
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const summary = await supplierPaymentService.getSupplierFinancialSummary(supp.id);
    const passed = pur.totalAmount === 650 && pur.dueAmount === 650 && summary.outstandingPayable === 650;
    return { passed, message: 'Purchase total is ₹650, supplier payable is ₹650.', details: { pur, summary } };
  });

  // Test 14: Sale return uses historical discounted line values
  await runTest('Discount Test 14: Sale return uses historical discounted line values', async () => {
    const businessId = await createTestBusiness('DT14');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await createItem(businessId, 'Prod14', 10, 50, 100);
    const cust = await createCustomer(businessId, 'Cust14');

    // 5 units x 100 = 500, with 10% line discount = 450 (effective ₹90/unit)
    const sale = await saleService.completeSale(businessId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 5,
        unit: 'pcs',
        rate: 100,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        trackInventory: true,
      }],
      subtotal: 450,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 450,
      paidAmount: 450,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const returnable = await saleCorrectionService.getSaleReturnableLines(sale.id);
    const retLine = returnable[0];

    // Return 2 units
    const retResult = await saleCorrectionService.processSaleReturn({
      businessId,
      originalSaleId: sale.id,
      reason: 'DEFECTIVE',
      settlementMode: 'CUSTOMER_CREDIT',
      lines: [{
        originalSaleLineId: retLine.originalSaleLineId,
        quantityToReturn: 2,
      }],
    });

    // 2 x ₹90 = ₹180 return total
    const passed = retLine.effectiveUnitRate === 90 && retResult.saleReturn.totalAmount === 180;
    return { passed, message: 'Return unit rate = ₹90, total return amount for 2 units = ₹180.', details: { retLine, saleReturn: retResult.saleReturn } };
  });

  // Test 15: Purchase return uses historical discounted line values
  await runTest('Discount Test 15: Purchase return uses historical discounted line values', async () => {
    const businessId = await createTestBusiness('DT15');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await createItem(businessId, 'Prod15', 0, 100, 150);
    const supp = await createSupplier(businessId, 'Supp15');

    // 4 units x 100 = 400, flat 80 line disc = 320 (effective ₹80/unit)
    const pur = await purchaseService.completePurchase(businessId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 4,
        unit: 'pcs',
        unitCost: 100,
        discountType: 'FLAT',
        discountValue: 80,
        trackInventory: true,
      }],
      subtotal: 320,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 320,
      paidAmount: 320,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const returnable = await purchaseCorrectionService.getPurchaseReturnableLines(pur.id);
    const retLine = returnable[0];

    const retResult = await purchaseCorrectionService.processPurchaseReturn({
      businessId,
      originalPurchaseId: pur.id,
      reason: 'DEFECTIVE',
      settlementMode: 'SUPPLIER_CREDIT',
      lines: [{
        originalPurchaseLineId: retLine.originalPurchaseLineId,
        quantityToReturn: 2,
      }],
    });

    // 2 x ₹80 = ₹160 return total
    const passed = retLine.effectiveUnitCost === 80 && retResult.purchaseReturn.totalAmount === 160;
    return { passed, message: 'Purchase return unit cost = ₹80, total return amount for 2 units = ₹160.', details: { retLine, purchaseReturn: retResult.purchaseReturn } };
  });

  // Test 16: Sale void uses historical discounted total
  await runTest('Discount Test 16: Sale void cancels historical discounted total', async () => {
    const businessId = await createTestBusiness('DT16');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await createItem(businessId, 'Prod16', 10, 50, 100);
    const cust = await createCustomer(businessId, 'Cust16');

    const sale = await saleService.completeSale(businessId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 2,
        unit: 'pcs',
        rate: 100,
        discountType: 'PERCENTAGE',
        discountValue: 20,
        trackInventory: true,
      }],
      subtotal: 160,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 160,
      paidAmount: 0, // Unpaid
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const voidRes = await saleCorrectionService.processSaleVoid({
      businessId,
      originalSaleId: sale.id,
      reason: 'Customer cancelled before payment',
    });

    const voidRecord = await db.saleVoids.where('originalSaleId').equals(sale.id).first();
    const summary = await paymentService.getCustomerFinancialSummary(cust.id);
    const passed = voidRes.saleVoid.originalSaleId === sale.id && !!voidRecord && summary.totalSales === 0 && summary.outstandingBalance === 0;
    return { passed, message: 'Sale void canceled historical discounted total ₹160, customer balance = ₹0.', details: { voidRes, voidRecord, summary } };
  });

  // Test 17: Purchase void uses historical discounted total
  await runTest('Discount Test 17: Purchase void cancels historical discounted total', async () => {
    const businessId = await createTestBusiness('DT17');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await createItem(businessId, 'Prod17', 0, 100, 150);
    const supp = await createSupplier(businessId, 'Supp17');

    const pur = await purchaseService.completePurchase(businessId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 3,
        unit: 'pcs',
        unitCost: 100,
        discountType: 'FLAT',
        discountValue: 60,
        trackInventory: true,
      }],
      subtotal: 240,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 240,
      paidAmount: 0,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const voidRes = await purchaseCorrectionService.processPurchaseVoid({
      businessId,
      originalPurchaseId: pur.id,
      reason: 'Rejected order',
    });

    const purVoidRecord = await db.purchaseVoids.where('originalPurchaseId').equals(pur.id).first();
    const summary = await supplierPaymentService.getSupplierFinancialSummary(supp.id);
    const passed = voidRes.purchaseVoid.originalPurchaseId === pur.id && !!purVoidRecord && summary.totalPurchases === 0 && summary.outstandingPayable === 0;
    return { passed, message: 'Purchase void canceled historical discounted total ₹240, supplier payable = ₹0.', details: { voidRes, purVoidRecord, summary } };
  });

  // Test 18: Customer balance reconciles after discounted sale
  await runTest('Discount Test 18: Customer balance reconciles after discounted sale', async () => {
    const businessId = await createTestBusiness('DT18');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Cash', type: 'CASH', openingBalance: 10000 });
    const item = await createItem(businessId, 'Prod18', 10, 50, 100);
    const cust = await createCustomer(businessId, 'Cust18');

    // Gross ₹1000, Line disc ₹100 -> ₹900, Overall flat ₹50 -> ₹850. Paid ₹500. Due = ₹350
    await saleService.completeSale(businessId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 10,
        unit: 'pcs',
        rate: 100,
        discountType: 'FLAT',
        discountValue: 100,
        trackInventory: true,
      }],
      subtotal: 900,
      discountType: 'FLAT',
      discountValue: 50,
      discountAmount: 50,
      taxAmount: 0,
      totalAmount: 850,
      paidAmount: 500,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const summary = await paymentService.getCustomerFinancialSummary(cust.id);
    const passed = summary.totalSales === 850 && summary.totalPaid === 500 && summary.outstandingBalance === 350 && summary.netReceivable === 350;
    return { passed, message: 'Sales=₹850, Paid=₹500, Due=₹350.', details: summary };
  });

  // Test 19: Supplier balance reconciles after discounted purchase
  await runTest('Discount Test 19: Supplier balance reconciles after discounted purchase', async () => {
    const businessId = await createTestBusiness('DT19');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Bank', type: 'BANK', openingBalance: 10000 });
    const item = await createItem(businessId, 'Prod19', 0, 500, 700);
    const supp = await createSupplier(businessId, 'Supp19');

    // Gross ₹2000, 10% Line Disc = ₹1800, 10% Overall Disc = ₹1620. Paid ₹1000. Payable = ₹620
    await purchaseService.completePurchase(businessId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 4,
        unit: 'pcs',
        unitCost: 500,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        trackInventory: true,
      }],
      subtotal: 1800,
      discountType: 'PERCENTAGE',
      discountValue: 10,
      discountAmount: 180,
      taxAmount: 0,
      totalAmount: 1620,
      paidAmount: 1000,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const summary = await supplierPaymentService.getSupplierFinancialSummary(supp.id);
    const passed = summary.totalPurchases === 1620 && summary.totalPaid === 1000 && summary.outstandingPayable === 620 && summary.netPayable === 620;
    return { passed, message: 'Purchases=₹1,620, Paid=₹1,000, Payable=₹620.', details: summary };
  });

  // Test 20: Discount does not create a FinancialMovement by itself
  await runTest('Discount Test 20: Discount does not create a FinancialMovement by itself', async () => {
    const businessId = await createTestBusiness('DT20');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Cash', type: 'CASH', openingBalance: 5000 });
    const item = await createItem(businessId, 'Prod20', 10, 50, 100);
    const cust = await createCustomer(businessId, 'Cust20');

    // Unpaid sale with ₹50 discount
    await saleService.completeSale(businessId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 2,
        unit: 'pcs',
        rate: 100,
        discountType: 'FLAT',
        discountValue: 50,
        trackInventory: true,
      }],
      subtotal: 150,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 150,
      paidAmount: 0, // Unpaid
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const movements = await db.financialMovements.where('businessId').equals(businessId).filter(m => !m.isDeleted).toArray();
    // Only 1 movement should exist: the OPENING_BALANCE movement of ₹5000
    const passed = movements.length === 1 && movements[0].type === 'OPENING_BALANCE';
    return { passed, message: 'Zero financial movements created for unpaid discounted sale.', details: { movementsCount: movements.length } };
  });

  // Test 21: Discount does not appear as a separate cash movement
  await runTest('Discount Test 21: Discount does not appear as a separate cash movement', async () => {
    const businessId = await createTestBusiness('DT21');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Cash', type: 'CASH', openingBalance: 5000 });
    const item = await createItem(businessId, 'Prod21', 10, 50, 100);
    const cust = await createCustomer(businessId, 'Cust21');

    // Sale of ₹200 discounted to ₹150, fully paid with ₹150 cash
    await saleService.completeSale(businessId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 2,
        unit: 'pcs',
        rate: 100,
        discountType: 'FLAT',
        discountValue: 50,
        trackInventory: true,
      }],
      subtotal: 150,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 150,
      paidAmount: 150,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const movements = await db.financialMovements.where('businessId').equals(businessId).filter(m => !m.isDeleted && m.type !== 'OPENING_BALANCE').toArray();
    // Exactly 1 movement of ₹150 IN
    const passed = movements.length === 1 && movements[0].amount === 150 && movements[0].direction === 'IN';
    return { passed, message: 'Exactly 1 movement of ₹150 IN created; ₹50 discount is NOT recorded as a movement.', details: movements[0] };
  });

  // Test 22: Existing pre-discount transaction remains financially unchanged
  await runTest('Discount Test 22: Legacy transaction without discount fields remains intact', async () => {
    const businessId = await createTestBusiness('DT22');
    const saleId = generateUniqueId('SALE_LEG');
    const lineId = generateUniqueId('LINE_LEG');
    const now = new Date().toISOString();

    // Legacy record without discountType or discountValue
    await db.sales.put({
      id: saleId,
      businessId,
      invoiceNumber: 'INV-LEGACY-001',
      customerNameSnapshot: 'Legacy Cust',
      saleDate: now,
      status: 'PAID',
      subtotal: 500,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 500,
      paidAmount: 500,
      dueAmount: 0,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: 'dev1',
      updatedByDeviceId: 'dev1',
      version: 1,
      isDeleted: false,
    });

    await db.saleLines.put({
      id: lineId,
      saleId,
      businessId,
      itemId: 'ITEM_LEG',
      itemNameSnapshot: 'Legacy Item',
      quantity: 5,
      unit: 'pcs',
      rate: 100,
      discountAmount: 0,
      taxAmount: 0,
      lineTotal: 500,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    const fetchedSale = await db.sales.get(saleId);
    const fetchedLine = await db.saleLines.get(lineId);

    const passed = fetchedSale?.totalAmount === 500 && fetchedLine?.lineTotal === 500;
    return { passed, message: 'Legacy transaction totals remain intact and unaltered.', details: { fetchedSale, fetchedLine } };
  });

  // Test 23: Rapid repeated discount updates do not corrupt totals
  await runTest('Discount Test 23: Rapid repeated discount recalculations maintain deterministic accuracy', async () => {
    const baseLines = [
      { quantity: 3, rateOrCost: 150, discountType: 'PERCENTAGE' as DiscountType, discountValue: 15 },
      { quantity: 2, rateOrCost: 80, discountType: 'FLAT' as DiscountType, discountValue: 25 },
    ];

    let allIdentical = true;
    const firstRun = discountUtils.calculateTransactionTotals(baseLines, 'PERCENTAGE', 7.5);

    for (let i = 0; i < 100; i++) {
      const run = discountUtils.calculateTransactionTotals(baseLines, 'PERCENTAGE', 7.5);
      if (
        run.grossSubtotal !== firstRun.grossSubtotal ||
        run.totalLineDiscounts !== firstRun.totalLineDiscounts ||
        run.subtotal !== firstRun.subtotal ||
        run.finalTotal !== firstRun.finalTotal
      ) {
        allIdentical = false;
        break;
      }
    }

    return { passed: allIdentical, message: '100 rapid consecutive recalculations produced identical deterministic results.', details: firstRun };
  });

  // Test 24: Offline creation and reload preserve discount values
  await runTest('Discount Test 24: Offline creation and Dexie persistence preserve exact discount schema', async () => {
    const businessId = await createTestBusiness('DT24');
    const acc = await financialAccountService.createAccount(businessId, { name: 'Cash', type: 'CASH', openingBalance: 5000 });
    const item = await createItem(businessId, 'Prod24', 20, 50, 100);
    const cust = await createCustomer(businessId, 'Cust24');

    const createdSale = await saleService.completeSale(businessId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 4,
        unit: 'pcs',
        rate: 100,
        discountType: 'PERCENTAGE',
        discountValue: 12.5,
        trackInventory: true,
      }],
      subtotal: 350,
      discountType: 'FLAT',
      discountValue: 30,
      discountAmount: 30,
      taxAmount: 0,
      totalAmount: 320,
      paidAmount: 320,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    // Query directly from raw Dexie tables
    const reloadedSale = await db.sales.get(createdSale.id);
    const reloadedLines = await db.saleLines.where('saleId').equals(createdSale.id).toArray();
    const line = reloadedLines[0];

    const passed =
      reloadedSale?.discountType === 'FLAT' &&
      reloadedSale?.discountValue === 30 &&
      reloadedSale?.discountAmount === 30 &&
      reloadedSale?.totalAmount === 320 &&
      line?.discountType === 'PERCENTAGE' &&
      line?.discountValue === 12.5 &&
      line?.discountAmount === 50 &&
      line?.lineTotal === 350;

    return {
      passed: !!passed,
      message: 'Sale and SaleLine persisted and reloaded with complete discount metadata (types, values, amounts).',
      details: { reloadedSale, line },
    };
  });

  return results;
};
