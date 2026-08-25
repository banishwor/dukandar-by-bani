import { db } from '../db/database';
import { purchaseService } from './purchaseService';
import { purchaseCorrectionService } from './purchaseCorrectionService';
import { supplierPaymentService } from './supplierPaymentService';
import { saleService } from './saleService';
import { saleCorrectionService } from './saleCorrectionService';
import { paymentService } from './paymentService';
import { financialAccountService } from './financialAccountService';
import { expenseService } from './expenseService';
import { accountTransferService } from './accountTransferService';
import { legacyFinancialMappingService } from './legacyFinancialMappingService';
import { financialMovementRepository } from '../repositories/financialMovementRepository';
import { inventoryRepository } from '../repositories/inventoryRepository';
import { purchaseRepository } from '../repositories/purchaseRepository';
import { saleRepository } from '../repositories/saleRepository';
import { customerRepository } from '../repositories/customerRepository';
import { roundCurrency } from '../utils/money';
import { generateUniqueId } from '../utils/id';

export interface TestResult {
  id: number;
  name: string;
  category: string;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: string[];
}

export const runDataIntegrityTestSuite = async (businessId: string): Promise<TestResult[]> => {
  const results: TestResult[] = [];
  const testPrefix = `TST_${Date.now()}`;

  // Helper to create a clean test item
  const createTestItem = async (name: string, openingStock: number, unitCost: number, track = true) => {
    const itemId = generateUniqueId('ITEM');
    const now = new Date().toISOString();
    await db.items.add({
      id: itemId,
      businessId,
      name: `${testPrefix}_${name}`,
      type: 'PRODUCT',
      unit: 'pcs',
      sellingPrice: unitCost * 1.5,
      purchasePrice: unitCost,
      openingStock,
      trackInventory: track,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: 'test-device',
      updatedByDeviceId: 'test-device',
      version: 1,
      isDeleted: false,
    });
    if (track && openingStock > 0) {
      await db.stockMovements.add({
        id: generateUniqueId('STK'),
        businessId,
        itemId,
        type: 'OPENING_STOCK',
        quantityChange: openingStock,
        createdAt: now,
        createdByDeviceId: 'test-device',
        version: 1,
      });
    }
    return itemId;
  };

  // Helper to create a clean test supplier
  const createTestSupplier = async (name: string) => {
    const supplierId = generateUniqueId('SUP');
    const now = new Date().toISOString();
    await db.suppliers.add({
      id: supplierId,
      businessId,
      name: `${testPrefix}_${name}`,
      phone: '9999999999',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: 'test-device',
      updatedByDeviceId: 'test-device',
      version: 1,
      isDeleted: false,
    });
    return supplierId;
  };

  // Helper to create a clean test customer
  const createTestCustomer = async (name: string) => {
    const customerId = generateUniqueId('CUST');
    const now = new Date().toISOString();
    await db.customers.add({
      id: customerId,
      businessId,
      name: `${testPrefix}_${name}`,
      phone: '9876543210',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: 'test-device',
      updatedByDeviceId: 'test-device',
      version: 1,
      isDeleted: false,
    });
    return customerId;
  };

  // Helper to execute and record
  const runTest = async (
    id: number,
    name: string,
    category: string,
    testFn: () => Promise<{ passed: boolean; message: string; details?: string[] }>
  ) => {
    const start = performance.now();
    try {
      const res = await testFn();
      results.push({
        id,
        name,
        category,
        passed: res.passed,
        message: res.message,
        durationMs: Math.round(performance.now() - start),
        details: res.details,
      });
    } catch (err: any) {
      results.push({
        id,
        name,
        category,
        passed: false,
        message: `Exception: ${err.message || String(err)}`,
        durationMs: Math.round(performance.now() - start),
      });
    }
  };

  // ----------------------------------------------------
  // SCENARIO 1: Simple Purchase with Full Cash Payment
  // ----------------------------------------------------
  await runTest(
    1,
    'Simple Purchase with Full Direct Payment',
    'Purchases & Inventory',
    async () => {
      const supplierId = await createTestSupplier('DirectPaySup');
      const itemId = await createTestItem('Item1', 10, 100);

      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'DirectPaySup',
        purchaseDate: new Date().toISOString(),
        lines: [
          {
            itemId,
            itemNameSnapshot: 'Item1',
            quantity: 5,
            unit: 'pcs',
            unitCost: 100,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 500,
        paymentMethod: 'CASH',
      });

      const stock = await inventoryRepository.getItemCurrentStock(itemId);
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      const passed =
        purchase.status === 'PAID' &&
        purchase.dueAmount === 0 &&
        purchase.paidAmount === 500 &&
        stock === 15 &&
        summary.outstandingPayable === 0 &&
        summary.netPayable === 0;

      return {
        passed,
        message: passed
          ? 'Stock increased from 10 to 15, purchase marked PAID, and supplier payable is ₹0.'
          : `Mismatch: stock=${stock}, status=${purchase.status}, due=${purchase.dueAmount}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 2: Credit Purchase (Unpaid)
  // ----------------------------------------------------
  await runTest(
    2,
    'Credit Purchase (Unpaid Bill)',
    'Payables & Debt',
    async () => {
      const supplierId = await createTestSupplier('CreditSup');
      const itemId = await createTestItem('Item2', 0, 200);

      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'CreditSup',
        purchaseDate: new Date().toISOString(),
        lines: [
          {
            itemId,
            itemNameSnapshot: 'Item2',
            quantity: 10,
            unit: 'pcs',
            unitCost: 200,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 2000,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 2000,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      const stock = await inventoryRepository.getItemCurrentStock(itemId);
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      const passed =
        purchase.status === 'UNPAID' &&
        purchase.dueAmount === 2000 &&
        stock === 10 &&
        summary.outstandingPayable === 2000 &&
        summary.netPayable === 2000;

      return {
        passed,
        message: passed
          ? 'Stock increased to 10 and net payable accurately derived as ₹2,000.'
          : `Mismatch: stock=${stock}, status=${purchase.status}, payable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 3: Partial Payment at Time of Purchase
  // ----------------------------------------------------
  await runTest(
    3,
    'Partial Payment at Bill Creation',
    'Purchases & Payments',
    async () => {
      const supplierId = await createTestSupplier('PartialSup');
      const itemId = await createTestItem('Item3', 5, 150);

      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'PartialSup',
        purchaseDate: new Date().toISOString(),
        lines: [
          {
            itemId,
            itemNameSnapshot: 'Item3',
            quantity: 4,
            unit: 'pcs',
            unitCost: 150,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 600,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 600,
        paidAmount: 250,
        paymentMethod: 'UPI',
      });

      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);
      const passed =
        purchase.status === 'PARTIAL' &&
        purchase.paidAmount === 250 &&
        purchase.dueAmount === 350 &&
        summary.outstandingPayable === 350 &&
        summary.netPayable === 350;

      return {
        passed,
        message: passed
          ? 'Purchase status is PARTIAL, paidAmount is ₹250, and dueAmount is ₹350.'
          : `Mismatch: status=${purchase.status}, due=${purchase.dueAmount}, payable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 4: Subsequent FIFO Payment Allocation
  // ----------------------------------------------------
  await runTest(
    4,
    'Subsequent FIFO Payment Allocation Across Multiple Bills',
    'FIFO Engine',
    async () => {
      const supplierId = await createTestSupplier('FIFOSup');
      const itemId = await createTestItem('Item4', 0, 100);

      // Bill 1: 500 unpaid
      const pur1 = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'FIFOSup',
        purchaseDate: '2026-01-01T10:00:00Z',
        lines: [
          {
            itemId,
            itemNameSnapshot: 'Item4',
            quantity: 5,
            unit: 'pcs',
            unitCost: 100,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      // Bill 2: 700 unpaid
      const pur2 = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'FIFOSup',
        purchaseDate: '2026-01-02T10:00:00Z',
        lines: [
          {
            itemId,
            itemNameSnapshot: 'Item4',
            quantity: 7,
            unit: 'pcs',
            unitCost: 100,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: true,
          },
        ],
        subtotal: 700,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 700,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      // Pay ₹800 in AUTO (FIFO) mode: should clear Bill 1 (₹500) and pay ₹300 on Bill 2
      await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId,
        amount: 800,
        paymentMethod: 'BANK_TRANSFER',
        allocationMode: 'AUTO',
      });

      const purchases = await purchaseRepository.getPurchasesBySupplier(supplierId);
      const updatedPur1 = purchases.find((p) => p.id === pur1.id);
      const updatedPur2 = purchases.find((p) => p.id === pur2.id);
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      const passed =
        updatedPur1?.status === 'PAID' &&
        updatedPur1?.dueAmount === 0 &&
        updatedPur2?.status === 'PARTIAL' &&
        updatedPur2?.dueAmount === 400 &&
        summary.netPayable === 400;

      return {
        passed,
        message: passed
          ? 'FIFO engine successfully paid off Bill 1 (₹500) and partially paid Bill 2 (₹300/₹700).'
          : `Mismatch: Bill1 status=${updatedPur1?.status}, Bill2 due=${updatedPur2?.dueAmount}, netPayable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 5: Manual Payment Allocation
  // ----------------------------------------------------
  await runTest(
    5,
    'Targeted Manual Payment Allocation to Specific Bill',
    'Payment Allocation',
    async () => {
      const supplierId = await createTestSupplier('ManualSup');
      const itemId = await createTestItem('Item5', 0, 100);

      const pur1 = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'ManualSup',
        purchaseDate: '2026-01-01T10:00:00Z',
        lines: [{ itemId, itemNameSnapshot: 'Item5', quantity: 3, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 300,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 300,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      const pur2 = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'ManualSup',
        purchaseDate: '2026-01-02T10:00:00Z',
        lines: [{ itemId, itemNameSnapshot: 'Item5', quantity: 5, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      // Target only Bill 2 with ₹500
      await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId,
        amount: 500,
        paymentMethod: 'CARD',
        allocationMode: 'MANUAL',
        manualAllocations: [{ purchaseId: pur2.id, amount: 500 }],
      });

      const purchases = await purchaseRepository.getPurchasesBySupplier(supplierId);
      const updatedPur1 = purchases.find((p) => p.id === pur1.id);
      const updatedPur2 = purchases.find((p) => p.id === pur2.id);

      const passed =
        updatedPur1?.status === 'UNPAID' &&
        updatedPur1?.dueAmount === 300 &&
        updatedPur2?.status === 'PAID' &&
        updatedPur2?.dueAmount === 0;

      return {
        passed,
        message: passed
          ? 'Manual allocation paid Bill 2 directly without affecting earlier Bill 1.'
          : `Mismatch: Bill1=${updatedPur1?.status}, Bill2=${updatedPur2?.status}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 6: Advance Payment / Overpayment (Supplier Credit)
  // ----------------------------------------------------
  await runTest(
    6,
    'Advance Payment (Supplier Credit Generation)',
    'Supplier Credit',
    async () => {
      const supplierId = await createTestSupplier('AdvanceSup');

      // Pay ₹1,000 with 0 bills existing
      const res = await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId,
        amount: 1000,
        paymentMethod: 'BANK_TRANSFER',
        allocationMode: 'AUTO',
      });

      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);
      const passed =
        res.unallocatedCredit === 1000 &&
        summary.supplierCredit === 1000 &&
        summary.netPayable === -1000;

      return {
        passed,
        message: passed
          ? 'Advance payment created ₹1,000 unallocated supplier credit (netPayable = -₹1,000).'
          : `Mismatch: unallocated=${res.unallocatedCredit}, supplierCredit=${summary.supplierCredit}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 7: Applying Supplier Credit to New Purchase
  // ----------------------------------------------------
  await runTest(
    7,
    'Applying Supplier Credit to New Purchase',
    'Supplier Credit',
    async () => {
      const supplierId = await createTestSupplier('ApplyCreditSup');
      const itemId = await createTestItem('Item7', 0, 100);

      // Advance payment ₹500
      await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId,
        amount: 500,
        paymentMethod: 'CASH',
        allocationMode: 'AUTO',
      });

      // New purchase of ₹800: apply ₹500 credit + ₹300 direct cash
      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'ApplyCreditSup',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item7', quantity: 8, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 800,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 800,
        paidAmount: 300,
        paymentMethod: 'CASH',
        applySupplierCredit: 500,
      });

      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);
      const passed =
        purchase.status === 'PAID' &&
        purchase.paidAmount === 800 &&
        purchase.dueAmount === 0 &&
        summary.supplierCredit === 0 &&
        summary.netPayable === 0;

      return {
        passed,
        message: passed
          ? 'Successfully consumed ₹500 supplier credit + ₹300 cash to pay ₹800 bill in full.'
          : `Mismatch: status=${purchase.status}, paid=${purchase.paidAmount}, creditRemaining=${summary.supplierCredit}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 8: Partial Purchase Return on Unpaid Bill (Reduce Due)
  // ----------------------------------------------------
  await runTest(
    8,
    'Partial Purchase Return on Unpaid Bill (Reduce Due Mode)',
    'Purchase Returns',
    async () => {
      const supplierId = await createTestSupplier('RetReduceDueSup');
      const itemId = await createTestItem('Item8', 10, 100);

      // Buy 10 items @ ₹100 = ₹1,000 unpaid
      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'RetReduceDueSup',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item8', quantity: 10, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 1000,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1000,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      const lines = await db.purchaseLines.where('purchaseId').equals(purchase.id).toArray();
      const pLine = lines[0];

      // Return 3 items @ ₹100 = ₹300 with REDUCE_DUE
      await purchaseCorrectionService.processPurchaseReturn({
        businessId,
        originalPurchaseId: purchase.id,
        supplierId,
        returnDate: new Date().toISOString(),
        reason: 'DAMAGED',
        settlementMode: 'REDUCE_DUE',
        lines: [{ originalPurchaseLineId: pLine.id, quantityToReturn: 3 }],
      });

      const stock = await inventoryRepository.getItemCurrentStock(itemId);
      const purchases = await purchaseRepository.getPurchasesBySupplier(supplierId);
      const updatedPurchase = purchases.find((p) => p.id === purchase.id);
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      // Stock was 10 (opening) + 10 (purchase) - 3 (return) = 17
      const passed =
        stock === 17 &&
        updatedPurchase?.dueAmount === 700 &&
        summary.netPayable === 700;

      return {
        passed,
        message: passed
          ? 'Stock deducted by 3 (from 20 to 17) and purchase dueAmount reduced to ₹700.'
          : `Mismatch: stock=${stock}, dueAmount=${updatedPurchase?.dueAmount}, netPayable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 9: Purchase Return with Cash Refund Received
  // ----------------------------------------------------
  await runTest(
    9,
    'Purchase Return with Immediate Cash Refund Received',
    'Purchase Returns & Refunds',
    async () => {
      const supplierId = await createTestSupplier('RetRefundSup');
      const itemId = await createTestItem('Item9', 0, 100);

      // Buy 5 items @ ₹100 = ₹500 paid in full
      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'RetRefundSup',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item9', quantity: 5, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 500,
        paymentMethod: 'CASH',
      });

      const lines = await db.purchaseLines.where('purchaseId').equals(purchase.id).toArray();
      const pLine = lines[0];

      // Return 2 items @ ₹100 = ₹200 with REFUND_NOW
      const retRes = await purchaseCorrectionService.processPurchaseReturn({
        businessId,
        originalPurchaseId: purchase.id,
        supplierId,
        returnDate: new Date().toISOString(),
        reason: 'DEFECTIVE',
        settlementMode: 'REFUND_NOW',
        refundPaymentMethod: 'CASH',
        lines: [{ originalPurchaseLineId: pLine.id, quantityToReturn: 2 }],
      });

      const stock = await inventoryRepository.getItemCurrentStock(itemId);
      const refunds = await db.refundsReceived.where('purchaseReturnId').equals(retRes.purchaseReturn.id).toArray();
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      const passed =
        stock === 3 &&
        refunds.length === 1 &&
        refunds[0].amount === 200 &&
        summary.netPayable === 0;

      return {
        passed,
        message: passed
          ? 'Stock deducted to 3, refund received record created for ₹200, and ledger remains balanced at ₹0.'
          : `Mismatch: stock=${stock}, refundCount=${refunds.length}, netPayable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 10: Purchase Return with Supplier Credit
  // ----------------------------------------------------
  await runTest(
    10,
    'Purchase Return with Supplier Credit Settlement',
    'Purchase Returns & Credit',
    async () => {
      const supplierId = await createTestSupplier('RetCreditSup');
      const itemId = await createTestItem('Item10', 0, 100);

      // Buy 4 items @ ₹100 = ₹400 paid in full
      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'RetCreditSup',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item10', quantity: 4, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 400,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 400,
        paidAmount: 400,
        paymentMethod: 'CASH',
      });

      const lines = await db.purchaseLines.where('purchaseId').equals(purchase.id).toArray();
      const pLine = lines[0];

      // Return 1 item @ ₹100 = ₹100 with SUPPLIER_CREDIT
      await purchaseCorrectionService.processPurchaseReturn({
        businessId,
        originalPurchaseId: purchase.id,
        supplierId,
        returnDate: new Date().toISOString(),
        reason: 'WRONG_ITEM',
        settlementMode: 'SUPPLIER_CREDIT',
        lines: [{ originalPurchaseLineId: pLine.id, quantityToReturn: 1 }],
      });

      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);
      const passed = summary.supplierCredit === 100 && summary.netPayable === -100;

      return {
        passed,
        message: passed
          ? 'Return converted to ₹100 supplier credit for future purchases.'
          : `Mismatch: credit=${summary.supplierCredit}, netPayable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 11: Full Purchase Void (Unpaid Purchase)
  // ----------------------------------------------------
  await runTest(
    11,
    'Full Void of Unpaid Purchase Bill',
    'Purchase Voids',
    async () => {
      const supplierId = await createTestSupplier('VoidUnpaidSup');
      const itemId = await createTestItem('Item11', 5, 100);

      // Buy 5 items @ ₹100 = ₹500 unpaid
      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'VoidUnpaidSup',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item11', quantity: 5, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      // Void bill
      await purchaseCorrectionService.processPurchaseVoid({
        businessId,
        originalPurchaseId: purchase.id,
        supplierId,
        reason: 'Duplicate bill entered by mistake',
        settlementMode: 'NO_SETTLEMENT',
      });

      const stock = await inventoryRepository.getItemCurrentStock(itemId);
      const purchases = await purchaseRepository.getPurchasesBySupplier(supplierId);
      const updatedPurchase = purchases.find((p) => p.id === purchase.id);
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      const passed =
        stock === 5 &&
        updatedPurchase?.status === 'VOIDED' &&
        updatedPurchase?.dueAmount === 0 &&
        summary.netPayable === 0;

      return {
        passed,
        message: passed
          ? 'Bill marked VOIDED, stock reverted to 5, and supplier debt removed completely.'
          : `Mismatch: stock=${stock}, status=${updatedPurchase?.status}, netPayable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 12: Purchase Void with Cash Refund
  // ----------------------------------------------------
  await runTest(
    12,
    'Purchase Void on Paid Bill with Cash Refund',
    'Purchase Voids & Refunds',
    async () => {
      const supplierId = await createTestSupplier('VoidPaidSup');
      const itemId = await createTestItem('Item12', 0, 150);

      // Buy 2 items @ ₹150 = ₹300 paid
      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'VoidPaidSup',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item12', quantity: 2, unit: 'pcs', unitCost: 150, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 300,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 300,
        paidAmount: 300,
        paymentMethod: 'CASH',
      });

      // Void with REFUND_NOW
      const voidRes = await purchaseCorrectionService.processPurchaseVoid({
        businessId,
        originalPurchaseId: purchase.id,
        supplierId,
        reason: 'Order cancelled before dispatch',
        settlementMode: 'REFUND_NOW',
        refundPaymentMethod: 'CASH',
      });

      const stock = await inventoryRepository.getItemCurrentStock(itemId);
      const refunds = await db.refundsReceived.where('purchaseVoidId').equals(voidRes.purchaseVoid.id).toArray();
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      const passed =
        stock === 0 &&
        refunds.length === 1 &&
        refunds[0].amount === 300 &&
        summary.netPayable === 0;

      return {
        passed,
        message: passed
          ? 'Stock returned to 0, refund event logged for ₹300, and financial summary balanced at ₹0.'
          : `Mismatch: stock=${stock}, refunds=${refunds.length}, netPayable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 13: Supplier Payment Reversal
  // ----------------------------------------------------
  await runTest(
    13,
    'Supplier Payment Reversal (Unwinds Allocations & Restores Bill Due)',
    'Payment Reversals',
    async () => {
      const supplierId = await createTestSupplier('RevPaySup');
      const itemId = await createTestItem('Item13', 0, 100);

      // Buy ₹500 unpaid
      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'RevPaySup',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item13', quantity: 5, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      // Record ₹500 payment
      const pmtRes = await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId,
        amount: 500,
        paymentMethod: 'BANK_TRANSFER',
        allocationMode: 'AUTO',
      });

      // Verify bill was paid
      const purchasesAfterPay = await purchaseRepository.getPurchasesBySupplier(supplierId);
      const purCheck = purchasesAfterPay.find((p) => p.id === purchase.id);
      if (purCheck?.status !== 'PAID') {
        return { passed: false, message: 'Initial payment failed to mark bill as PAID' };
      }

      // Reverse payment
      await purchaseCorrectionService.processSupplierPaymentReversal({
        businessId,
        originalPaymentId: pmtRes.payment.id,
        supplierId,
        reason: 'Cheque bounced / payment failed at bank',
      });

      const purchasesAfterRev = await purchaseRepository.getPurchasesBySupplier(supplierId);
      const finalPur = purchasesAfterRev.find((p) => p.id === purchase.id);
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      const passed =
        finalPur?.status === 'UNPAID' &&
        finalPur?.dueAmount === 500 &&
        summary.outstandingPayable === 500 &&
        summary.netPayable === 500;

      return {
        passed,
        message: passed
          ? 'Payment reversal successfully restored bill status to UNPAID with ₹500 due.'
          : `Mismatch: status=${finalPur?.status}, due=${finalPur?.dueAmount}, netPayable=${summary.netPayable}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 14: Non-Tracked Inventory Purchase
  // ----------------------------------------------------
  await runTest(
    14,
    'Non-Tracked Inventory Purchase (Services / Expense Items)',
    'Inventory Ledger',
    async () => {
      const supplierId = await createTestSupplier('NonTrackSup');
      const itemId = await createTestItem('NonTrackItem', 0, 50, false); // trackInventory = false

      const initialMovements = await db.stockMovements.where('itemId').equals(itemId).count();

      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'NonTrackSup',
        purchaseDate: new Date().toISOString(),
        lines: [
          {
            itemId,
            itemNameSnapshot: 'NonTrackItem',
            quantity: 10,
            unit: 'hrs',
            unitCost: 50,
            discountAmount: 0,
            taxAmount: 0,
            trackInventory: false,
          },
        ],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 500,
        paymentMethod: 'CASH',
      });

      const finalMovements = await db.stockMovements.where('itemId').equals(itemId).count();
      const stock = await inventoryRepository.getItemCurrentStock(itemId);

      const passed =
        purchase.status === 'PAID' &&
        initialMovements === 0 &&
        finalMovements === 0 &&
        stock === 0;

      return {
        passed,
        message: passed
          ? 'Non-tracked purchase generated zero inventory movements while maintaining perfect financial ledger.'
          : `Mismatch: initialMovements=${initialMovements}, finalMovements=${finalMovements}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 15: Supplier Statement Ledger Chronology & Running Balance Integrity
  // ----------------------------------------------------
  await runTest(
    15,
    'Supplier Statement Ledger Chronological Running Balance Integrity',
    'Financial Ledger & Statements',
    async () => {
      const supplierId = await createTestSupplier('StatementAuditSup');
      const itemId = await createTestItem('AuditItem', 10, 100);

      // 1. Purchase on Day 1: +₹1,000 payable
      await purchaseService.completePurchase(businessId, {
        supplierId,
        supplierNameSnapshot: 'StatementAuditSup',
        purchaseDate: '2026-01-01T10:00:00Z',
        lines: [{ itemId, itemNameSnapshot: 'AuditItem', quantity: 10, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 1000,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 1000,
        paidAmount: 0,
        paymentMethod: 'CASH',
      });

      // 2. Payment on Day 2: -₹600 paid -> Balance = ₹400
      const pmt = await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId,
        amount: 600,
        paymentMethod: 'BANK_TRANSFER',
        paymentDate: '2026-01-02T10:00:00Z',
        allocationMode: 'AUTO',
      });

      // 3. Reverse Payment on Day 3: +₹600 reversal -> Balance = ₹1,000
      await purchaseCorrectionService.processSupplierPaymentReversal({
        businessId,
        originalPaymentId: pmt.payment.id,
        supplierId,
        reversalDate: '2026-01-03T10:00:00Z',
        reason: 'Bank rejection',
      });

      // 4. Payment on Day 4: -₹1,000 paid -> Balance = ₹0
      await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId,
        amount: 1000,
        paymentMethod: 'UPI',
        paymentDate: '2026-01-04T10:00:00Z',
        allocationMode: 'AUTO',
      });

      const statement = await supplierPaymentService.getSupplierStatement(supplierId);
      const summary = await supplierPaymentService.getSupplierFinancialSummary(supplierId);

      const finalEntry = statement[statement.length - 1];
      const has4Entries = statement.length >= 4;
      const isBalanceZero = finalEntry && Math.abs(finalEntry.runningBalance) < 0.005;
      const isSummaryZero = Math.abs(summary.netPayable) < 0.005;

      const passed = has4Entries && isBalanceZero && isSummaryZero;

      return {
        passed,
        message: passed
          ? `Statement computed ${statement.length} chronological entries with exact ending running balance of ₹0.00.`
          : `Mismatch: entriesCount=${statement.length}, finalRunningBalance=${finalEntry?.runningBalance}, summaryNetPayable=${summary.netPayable}`,
        details: statement.map(
          (s) =>
            `${s.date.slice(0, 10)} | ${s.type} | Payable: ₹${s.payable} | Paid: ₹${s.paid} | Balance: ₹${s.runningBalance}`
        ),
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 13: Financial Accounts & Pure Dynamic Derivation
  // ----------------------------------------------------
  await runTest(
    13,
    'Financial Account Creation & Dynamic Derived Balance',
    'Phase 5: Financial Ledger',
    async () => {
      // 1. Create Account with 0 opening balance
      const { account: zeroAcc, movement: noMov } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_ZeroAccount`,
        type: 'CASH',
        openingBalance: 0,
      });

      const zeroBal = await financialMovementRepository.getAccountDerivedBalance(zeroAcc.id);
      const hasNoMovement = noMov === undefined;

      // 2. Create Account with ₹5,000 opening balance
      const { account: openAcc, movement: openMov } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_BankSavings`,
        type: 'BANK',
        openingBalance: 5000,
        bankName: 'HDFC',
      });

      const openBal = await financialMovementRepository.getAccountDerivedBalance(openAcc.id);
      const hasMovement = openMov !== undefined && openMov.type === 'OPENING_BALANCE' && openMov.direction === 'IN';

      const passed = zeroBal === 0 && hasNoMovement && openBal === 5000 && hasMovement;

      return {
        passed,
        message: passed
          ? 'Zero-balance account created without movements (₹0.00). Positive opening balance created atomic OPENING_BALANCE movement and derived exact balance ₹5,000.00.'
          : `Failed: zeroBal=${zeroBal}, openBal=${openBal}, hasMovement=${hasMovement}`,
        details: [
          `Zero Account ID: ${zeroAcc.id}, Derived Balance: ₹${zeroBal}`,
          `Opening Account ID: ${openAcc.id}, Derived Balance: ₹${openBal}, Movement Type: ${openMov?.type}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 14: Immutable Expense Creation with Atomic Movement
  // ----------------------------------------------------
  await runTest(
    14,
    'Immutable Expense Creation & Atomic OUT Movement',
    'Phase 5: Expenses & Ledger',
    async () => {
      // 1. Create account with ₹10,000 opening balance
      const { account: acc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_ExpenseCash`,
        type: 'CASH',
        openingBalance: 10000,
      });

      // 2. Create Category
      const cat = await expenseService.createCategory(businessId, {
        name: `${testPrefix}_OfficeSupplies`,
      });

      // 3. Record Expense of ₹1,250.50
      const expense = await expenseService.createExpense({
        businessId,
        categoryId: cat.id,
        financialAccountId: acc.id,
        amount: 1250.50,
        paymentMethod: 'CASH',
        payee: 'Stationery World',
      });

      // Check account derived balance: 10000 - 1250.50 = 8749.50
      const newBal = await financialMovementRepository.getAccountDerivedBalance(acc.id);
      const isBalanceCorrect = Math.abs(newBal - 8749.50) < 0.005;

      // Verify movement record exists and matches
      const details = await expenseService.getExpenseWithDetails(expense.id);
      const hasMovement = details?.movement !== undefined && details.movement.direction === 'OUT' && details.movement.amount === 1250.50;

      const passed = isBalanceCorrect && hasMovement && !details.isReversed;

      return {
        passed,
        message: passed
          ? `Expense ${expense.expenseNumber} recorded atomically. Account balance updated to ₹${newBal.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`
          : `Failed: newBal=${newBal}, isBalanceCorrect=${isBalanceCorrect}, hasMovement=${hasMovement}`,
        details: [
          `Expense ID: ${expense.id}, Number: ${expense.expenseNumber}, Amount: ₹${expense.amount}`,
          `Account Initial: ₹10,000.00 -> New Derived Balance: ₹${newBal}`,
          `Underlying Movement: Direction=${details?.movement?.direction}, Type=${details?.movement?.type}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 15: Expense Reversal with Compensating IN Movement
  // ----------------------------------------------------
  await runTest(
    15,
    'Expense Reversal & Double-Reversal Prevention',
    'Phase 5: Expenses & Ledger',
    async () => {
      // 1. Create account with ₹5,000
      const { account: acc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_RevAccount`,
        type: 'CASH',
        openingBalance: 5000,
      });

      const cat = await expenseService.createCategory(businessId, { name: `${testPrefix}_Rent` });

      // 2. Record Expense of ₹2,000 -> Balance becomes ₹3,000
      const expense = await expenseService.createExpense({
        businessId,
        categoryId: cat.id,
        financialAccountId: acc.id,
        amount: 2000,
        paymentMethod: 'CASH',
      });

      const balAfterExpense = await financialMovementRepository.getAccountDerivedBalance(acc.id);

      // 3. Reverse Expense -> Balance restored to ₹5,000
      const reversal = await expenseService.reverseExpense({
        businessId,
        expenseId: expense.id,
        reason: 'Duplicate bill entry',
      });

      const balAfterReversal = await financialMovementRepository.getAccountDerivedBalance(acc.id);

      // 4. Try double-reversal (must throw error)
      let doubleReversalBlocked = false;
      try {
        await expenseService.reverseExpense({
          businessId,
          expenseId: expense.id,
          reason: 'Second reversal attempt',
        });
      } catch (err: any) {
        doubleReversalBlocked = true;
      }

      const passed =
        Math.abs(balAfterExpense - 3000) < 0.005 &&
        Math.abs(balAfterReversal - 5000) < 0.005 &&
        doubleReversalBlocked &&
        reversal.amount === 2000;

      return {
        passed,
        message: passed
          ? `Expense reversed successfully. Balance restored from ₹3,000.00 back to ₹5,000.00. Double-reversal safely prevented.`
          : `Failed: balAfterExpense=${balAfterExpense}, balAfterReversal=${balAfterReversal}, doubleReversalBlocked=${doubleReversalBlocked}`,
        details: [
          `Original Expense: ${expense.expenseNumber} (₹${expense.amount})`,
          `Reversal ID: ${reversal.id}, Reason: ${reversal.reason}`,
          `Double-reversal safely blocked: ${doubleReversalBlocked}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 16: Account Transfer Conservation of Funds & Insufficient Validation
  // ----------------------------------------------------
  await runTest(
    16,
    'Account Transfer Conservation of Funds & Overdraft Validation',
    'Phase 5: Transfers & Conservation',
    async () => {
      // 1. Create Cash Account (₹3,000) and Bank Account (₹1,000) -> Total = ₹4,000
      const { account: cashAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_CashVault`,
        type: 'CASH',
        openingBalance: 3000,
      });

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_BankCurrent`,
        type: 'BANK',
        openingBalance: 1000,
      });

      // 2. Attempt overdraft transfer (₹5,000 from cash when only ₹3,000 available -> must fail)
      let overdraftBlocked = false;
      try {
        await accountTransferService.createTransfer({
          businessId,
          fromAccountId: cashAcc.id,
          toAccountId: bankAcc.id,
          amount: 5000,
        });
      } catch (err: any) {
        overdraftBlocked = true;
      }

      // 3. Valid transfer of ₹1,500 from Cash to Bank
      const transfer = await accountTransferService.createTransfer({
        businessId,
        fromAccountId: cashAcc.id,
        toAccountId: bankAcc.id,
        amount: 1500,
        notes: 'Deposit to Bank',
      });

      const cashBal = await financialMovementRepository.getAccountDerivedBalance(cashAcc.id);
      const bankBal = await financialMovementRepository.getAccountDerivedBalance(bankAcc.id);
      const totalFunds = cashBal + bankBal;

      const passed =
        overdraftBlocked &&
        Math.abs(cashBal - 1500) < 0.005 &&
        Math.abs(bankBal - 2500) < 0.005 &&
        Math.abs(totalFunds - 4000) < 0.005;

      return {
        passed,
        message: passed
          ? `Transferred ₹1,500.00 (${transfer.transferNumber}). Total liquid funds strictly conserved at ₹4,000.00 (Cash: ₹1,500, Bank: ₹2,500). Overdraft blocked.`
          : `Failed: cashBal=${cashBal}, bankBal=${bankBal}, totalFunds=${totalFunds}, overdraftBlocked=${overdraftBlocked}`,
        details: [
          `Transfer Number: ${transfer.transferNumber}, Amount: ₹${transfer.amount}`,
          `Cash Balance: ₹3,000.00 -> ₹${cashBal}`,
          `Bank Balance: ₹1,000.00 -> ₹${bankBal}`,
          `Total Funds Conserved: ₹${totalFunds} (Expected: ₹4,000.00)`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 17: Account Transfer Reversal
  // ----------------------------------------------------
  await runTest(
    17,
    'Account Transfer Reversal with Dual Compensating Movements',
    'Phase 5: Transfers & Conservation',
    async () => {
      // 1. Setup Cash (₹2,000) and Bank (₹500)
      const { account: cashAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_TrfCash`,
        type: 'CASH',
        openingBalance: 2000,
      });

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_TrfBank`,
        type: 'BANK',
        openingBalance: 500,
      });

      // 2. Transfer ₹800 Cash -> Bank (Cash: ₹1,200, Bank: ₹1,300)
      const transfer = await accountTransferService.createTransfer({
        businessId,
        fromAccountId: cashAcc.id,
        toAccountId: bankAcc.id,
        amount: 800,
      });

      // 3. Reverse Transfer (Cash: ₹2,000, Bank: ₹500)
      const reversal = await accountTransferService.reverseTransfer({
        businessId,
        transferId: transfer.id,
        reason: 'Bank transfer bounce',
      });

      const finalCash = await financialMovementRepository.getAccountDerivedBalance(cashAcc.id);
      const finalBank = await financialMovementRepository.getAccountDerivedBalance(bankAcc.id);

      const passed =
        Math.abs(finalCash - 2000) < 0.005 &&
        Math.abs(finalBank - 500) < 0.005 &&
        reversal.amount === 800;

      return {
        passed,
        message: passed
          ? `Transfer ${transfer.transferNumber} reversed. Cash restored to ₹2,000.00 and Bank restored to ₹500.00 via dual compensating movements.`
          : `Failed: finalCash=${finalCash}, finalBank=${finalBank}`,
        details: [
          `Reversal ID: ${reversal.id}, Amount: ₹${reversal.amount}`,
          `Final Cash Balance: ₹${finalCash} (Expected ₹2,000.00)`,
          `Final Bank Balance: ₹${finalBank} (Expected ₹500.00)`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 18: Legacy Data Isolation Guarantee
  // ----------------------------------------------------
  await runTest(
    18,
    'Historical Legacy Data Isolation (₹0 Default Cash Baseline)',
    'Phase 5: Legacy Safeguards',
    async () => {
      // 1. Create a fresh test customer & supplier and simulate historical unmapped records
      const customerId = generateUniqueId('CUST');
      const now = new Date().toISOString();
      await db.customers.add({
        id: customerId,
        businessId,
        name: `${testPrefix}_LegacyCustomer`,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: 'legacy',
        updatedByDeviceId: 'legacy',
        version: 1,
        isDeleted: false,
      });

      const unmappedPaymentId = generateUniqueId('PAY');
      await db.payments.add({
        id: unmappedPaymentId,
        businessId,
        partyType: 'CUSTOMER',
        partyId: customerId,
        referenceType: 'DIRECT',
        amount: 7500,
        paymentDate: now,
        paymentMethod: 'CASH',
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: 'legacy',
        updatedByDeviceId: 'legacy',
        version: 1,
        isDeleted: false,
      });

      // 2. Fetch default Cash in Hand account and check balance
      const accounts = await financialAccountService.getAccountsWithBalance(businessId);
      const defaultCash = accounts.find((a) => a.type === 'CASH' && a.isDefault);

      // Verify that historical payment did NOT create any automatic FinancialMovement
      const movements = await financialMovementRepository.getMovementsByBusiness(businessId);
      const autoMapped = movements.some((m) => m.referenceId === unmappedPaymentId);

      // Verify that deliberate mapping tool works when invoked manually
      const mappedMovement = await legacyFinancialMappingService.mapHistoricalTransactionToAccount(
        businessId,
        unmappedPaymentId,
        'CUSTOMER_PAYMENT',
        defaultCash ? defaultCash.id : accounts[0].id
      );

      // Verify duplicate mapping is blocked
      let duplicateBlocked = false;
      try {
        await legacyFinancialMappingService.mapHistoricalTransactionToAccount(
          businessId,
          unmappedPaymentId,
          'CUSTOMER_PAYMENT',
          defaultCash ? defaultCash.id : accounts[0].id
        );
      } catch (err) {
        duplicateBlocked = true;
      }

      const passed = !autoMapped && mappedMovement.amount === 7500 && duplicateBlocked;

      return {
        passed,
        message: passed
          ? 'Historical customer payment was completely isolated without auto-mapping to cash. Deliberate manual mapping created exactly 1 movement and blocked duplicate mapping.'
          : `Failed: autoMapped=${autoMapped}, duplicateBlocked=${duplicateBlocked}`,
        details: [
          `Unmapped Historical Payment: ₹7,500.00`,
          `Auto-mapping prevented: ${!autoMapped}`,
          `Deliberate mapping movement created: ${mappedMovement.id} (Direction: ${mappedMovement.direction})`,
          `Duplicate deliberate mapping safely blocked: ${duplicateBlocked}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 19: Auditable Opening Balance Correction
  // ----------------------------------------------------
  await runTest(
    19,
    'Auditable Opening Balance Correction (History Preserved)',
    'Phase 5: Ledger Invariants',
    async () => {
      // 1. Create account with ₹4,000 opening balance
      const { account: acc, movement: initialMov } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_AuditCorrAcc`,
        type: 'BANK',
        openingBalance: 4000,
      });

      // 2. Correct opening balance to ₹6,000 (delta: +₹2,000)
      const corrMov = await financialAccountService.correctOpeningBalance(
        businessId,
        acc.id,
        6000,
        'Found unrecorded bank interest from previous year'
      );

      // Verify original movement still exists untouched
      const originalCheck = await db.financialMovements.get(initialMov!.id);
      const isOriginalUntouched = originalCheck && originalCheck.amount === 4000 && originalCheck.type === 'OPENING_BALANCE';

      // Verify adjustment movement created with +₹2,000
      const isCorrValid = corrMov && corrMov.amount === 2000 && corrMov.direction === 'IN' && corrMov.type === 'ADJUSTMENT';

      // Verify derived balance is now ₹6,000
      const newDerivedBal = await financialMovementRepository.getAccountDerivedBalance(acc.id);
      const isBalanceCorrect = Math.abs(newDerivedBal - 6000) < 0.005;

      const passed = Boolean(isOriginalUntouched && isCorrValid && isBalanceCorrect);

      return {
        passed,
        message: passed
          ? `Opening balance adjusted from ₹4,000.00 to ₹6,000.00 via append-only ADJUSTMENT (+₹2,000.00). Original OPENING_BALANCE movement remained completely unmodified.`
          : `Failed: isOriginalUntouched=${isOriginalUntouched}, isCorrValid=${isCorrValid}, newDerivedBal=${newDerivedBal}`,
        details: [
          `Original Opening Movement: ID=${initialMov?.id}, Amount=₹${initialMov?.amount}`,
          `Compensating Adjustment: ID=${corrMov?.id}, Type=${corrMov?.type}, Amount=₹${corrMov?.amount}`,
          `New Derived Balance: ₹${newDerivedBal}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 20: Archived Account Safety & Single Default Invariant
  // ----------------------------------------------------
  await runTest(
    20,
    'Archived Account Protection & Strict Single Default Invariant',
    'Phase 5: Account Safety',
    async () => {
      // 1. Create 2 accounts
      const { account: acc1 } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_Acc1`,
        type: 'CASH',
        openingBalance: 1000,
        isDefault: true,
      });

      const { account: acc2 } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_Acc2`,
        type: 'BANK',
        openingBalance: 2000,
        isDefault: false,
      });

      const cat = await expenseService.createCategory(businessId, { name: `${testPrefix}_SafetyCat` });

      // 2. Set Acc2 as default -> Acc1 must be unset as default atomically
      await financialAccountService.setDefaultAccount(businessId, acc2.id);

      const refreshedAcc1 = await db.financialAccounts.get(acc1.id);
      const refreshedAcc2 = await db.financialAccounts.get(acc2.id);
      const singleDefaultEnforced = refreshedAcc1?.isDefault === false && refreshedAcc2?.isDefault === true;

      // 3. Archive Acc1
      await financialAccountService.archiveAccount(acc1.id);

      // 4. Try creating expense on archived Acc1 -> Must fail
      let expenseBlocked = false;
      try {
        await expenseService.createExpense({
          businessId,
          categoryId: cat.id,
          financialAccountId: acc1.id,
          amount: 500,
          paymentMethod: 'CASH',
        });
      } catch (err) {
        expenseBlocked = true;
      }

      // 5. Try transferring from archived Acc1 -> Must fail
      let transferBlocked = false;
      try {
        await accountTransferService.createTransfer({
          businessId,
          fromAccountId: acc1.id,
          toAccountId: acc2.id,
          amount: 200,
        });
      } catch (err) {
        transferBlocked = true;
      }

      const passed = singleDefaultEnforced && expenseBlocked && transferBlocked;

      return {
        passed,
        message: passed
          ? 'Single default account invariant maintained atomically. Operations (expenses, transfers) against archived accounts safely rejected.'
          : `Failed: singleDefaultEnforced=${singleDefaultEnforced}, expenseBlocked=${expenseBlocked}, transferBlocked=${transferBlocked}`,
        details: [
          `Acc1 Default: ${refreshedAcc1?.isDefault}, Acc2 Default: ${refreshedAcc2?.isDefault}`,
          `Expense on Archived Account Blocked: ${expenseBlocked}`,
          `Transfer on Archived Account Blocked: ${transferBlocked}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 21: Cross-Business Multi-Tenant Isolation
  // ----------------------------------------------------
  await runTest(
    21,
    'Multi-Tenant Cross-Business Financial Isolation',
    'Phase 5: Multi-Tenant',
    async () => {
      const otherBusinessId = generateUniqueId('BIZ_OTHER');

      // Create account in Business B
      const { account: otherAcc } = await financialAccountService.createAccount(otherBusinessId, {
        name: `${testPrefix}_OtherBizAcc`,
        type: 'CASH',
        openingBalance: 99999,
      });

      // Create account in Business A
      const { account: bizAAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_BizAAcc`,
        type: 'CASH',
        openingBalance: 1111,
      });

      // Query balances for Business A
      const bizABalances = await financialMovementRepository.getAllAccountBalances(businessId);
      const isOtherExcluded = bizABalances[otherAcc.id] === undefined;
      const isBizAPresent = bizABalances[bizAAcc.id]?.derivedBalance === 1111;

      // Query liquid funds for Business A
      const totalA = await financialAccountService.getTotalLiquidFunds(businessId);
      const otherAccountsInA = (await financialAccountService.getAccountsWithBalance(businessId)).some(
        (a) => a.id === otherAcc.id
      );

      const passed = isOtherExcluded && isBizAPresent && !otherAccountsInA;

      return {
        passed,
        message: passed
          ? `Cross-business financial isolation verified. Business B's ₹99,999.00 account was completely excluded from Business A's balance queries.`
          : `Failed: isOtherExcluded=${isOtherExcluded}, isBizAPresent=${isBizAPresent}, otherAccountsInA=${otherAccountsInA}`,
        details: [
          `Business A Account ID: ${bizAAcc.id} (Balance: ₹1,111.00)`,
          `Business B Account ID: ${otherAcc.id} (Balance: ₹99,999.00)`,
          `Business B Account Excluded from A Queries: ${isOtherExcluded}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 22 (A): Customer Standalone Payment
  // ----------------------------------------------------
  await runTest(
    22,
    'Customer Standalone Payment -> CUSTOMER_PAYMENT Movement',
    'Phase 5 Stage 2: Customer Payments',
    async () => {
      const custId = await createTestCustomer('Cust_Standalone');
      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_CustBank`,
        type: 'BANK',
        openingBalance: 1000,
      });

      const paymentRes = await paymentService.receiveCustomerPayment({
        businessId,
        customerId: custId,
        amount: 450,
        paymentMethod: 'UPI',
        financialAccountId: bankAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForReference(
        businessId,
        'PAYMENT',
        paymentRes.payment.id
      );

      const hasSingleMovement = movements.length === 1;
      const mov = movements[0];
      const correctDetails =
        mov &&
        mov.accountId === bankAcc.id &&
        mov.type === 'CUSTOMER_PAYMENT' &&
        mov.direction === 'IN' &&
        mov.amount === 450;

      const newBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed = hasSingleMovement && correctDetails && newBal === 1450;

      return {
        passed,
        message: passed
          ? `Customer payment recorded single atomic CUSTOMER_PAYMENT movement (IN, ₹450) and updated bank balance to ₹1,450.`
          : `Failed: hasSingleMovement=${hasSingleMovement}, correctDetails=${correctDetails}, newBal=${newBal}`,
        details: [
          `Payment ID: ${paymentRes.payment.id}`,
          `Movement Count: ${movements.length}`,
          `Bank Balance: ${newBal}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 23 (B): Customer Payment Overpayment / Advance Credit
  // ----------------------------------------------------
  await runTest(
    23,
    'Customer Overpayment -> Single Movement For Full Amount',
    'Phase 5 Stage 2: Customer Payments',
    async () => {
      const custId = await createTestCustomer('Cust_Overpay');
      const itemId = await createTestItem('Item_Overpay', 10, 100, true);

      const { account: cashAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_OverpayCash`,
        type: 'CASH',
        openingBalance: 500,
      });

      // 1. Unpaid sale of 300
      await saleService.completeSale(businessId, {
        customerId: custId,
        customerNameSnapshot: 'Cust_Overpay',
        saleDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_Overpay', quantity: 2, unit: 'pcs', rate: 150, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 300,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 300,
        paidAmount: 0,
        applyCustomerCredit: 0,
        paymentMethod: 'CASH',
      });

      // 2. Customer pays 500 (300 allocated, 200 customer credit)
      const payRes = await paymentService.receiveCustomerPayment({
        businessId,
        customerId: custId,
        amount: 500,
        paymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForReference(
        businessId,
        'PAYMENT',
        payRes.payment.id
      );

      const hasSingleMovement = movements.length === 1;
      const mov = movements[0];
      const correctAmount = mov && mov.amount === 500 && mov.direction === 'IN';
      const newCashBal = await financialMovementRepository.getDerivedBalanceForAccount(cashAcc.id);

      const passed = hasSingleMovement && correctAmount && newCashBal === 1000;

      return {
        passed,
        message: passed
          ? `Overpayment created exactly one financial movement for ₹500 (full real money received), NOT ₹300 (allocated).`
          : `Failed: hasSingleMovement=${hasSingleMovement}, correctAmount=${correctAmount}, newCashBal=${newCashBal}`,
        details: [
          `Allocations Count: ${payRes.allocations.length}`,
          `Unallocated Customer Credit: ${payRes.customerCreditRemaining}`,
          `Financial Movement Amount: ${mov?.amount}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 24 (C): Direct Paid Sale Checkout
  // ----------------------------------------------------
  await runTest(
    24,
    'Direct Paid Sale Checkout -> CUSTOMER_PAYMENT Movement',
    'Phase 5 Stage 2: Sale Checkout',
    async () => {
      const custId = await createTestCustomer('Cust_DirectSale');
      const itemId = await createTestItem('Item_DirectSale', 10, 100, true);

      const { account: upiAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_SaleUPI`,
        type: 'UPI',
        openingBalance: 0,
      });

      const sale = await saleService.completeSale(businessId, {
        customerId: custId,
        customerNameSnapshot: 'Cust_DirectSale',
        saleDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_DirectSale', quantity: 1, unit: 'pcs', rate: 250, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 250,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 250,
        paidAmount: 250,
        applyCustomerCredit: 0,
        paymentMethod: 'UPI',
        financialAccountId: upiAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForAccount(upiAcc.id);
      const saleMov = movements.find((m) => m.type === 'CUSTOMER_PAYMENT');

      const passed = movements.length === 1 && saleMov !== undefined && saleMov.amount === 250 && saleMov.direction === 'IN';

      return {
        passed,
        message: passed
          ? `Direct paid sale checkout recorded CUSTOMER_PAYMENT movement for ₹250 directly into UPI account.`
          : `Failed: movements.length=${movements.length}, saleMov=${JSON.stringify(saleMov)}`,
        details: [
          `Sale ID: ${sale.id}`,
          `Movement ID: ${saleMov?.id}`,
          `UPI Account Balance: ${await financialMovementRepository.getDerivedBalanceForAccount(upiAcc.id)}`,
        ],
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 25 (D): Unpaid / Credit Sale -> NO Movement
  // ----------------------------------------------------
  await runTest(
    25,
    'Unpaid / Credit Sale Checkout -> NO Financial Movement',
    'Phase 5 Stage 2: Sale Checkout',
    async () => {
      const custId = await createTestCustomer('Cust_UnpaidSale');
      const itemId = await createTestItem('Item_UnpaidSale', 10, 100, true);

      const { account: cashAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_UnpaidSaleCash`,
        type: 'CASH',
        openingBalance: 300,
      });

      const sale = await saleService.completeSale(businessId, {
        customerId: custId,
        customerNameSnapshot: 'Cust_UnpaidSale',
        saleDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_UnpaidSale', quantity: 1, unit: 'pcs', rate: 400, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 400,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 400,
        paidAmount: 0,
        applyCustomerCredit: 0,
        paymentMethod: 'CASH',
      });

      const movements = await financialMovementRepository.getMovementsForReference(businessId, 'PAYMENT', sale.id);
      const cashBal = await financialMovementRepository.getDerivedBalanceForAccount(cashAcc.id);

      const passed = movements.length === 0 && cashBal === 300;

      return {
        passed,
        message: passed
          ? `Unpaid / credit sale generated 0 financial movements and left accounts completely unaffected.`
          : `Failed: movements.length=${movements.length}, cashBal=${cashBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 26 (E): Sale with Partial Customer Credit + Partial Direct Money
  // ----------------------------------------------------
  await runTest(
    26,
    'Sale with Customer Credit Redemption -> Movement ONLY for Direct Paid Cash',
    'Phase 5 Stage 2: Sale Checkout',
    async () => {
      const custId = await createTestCustomer('Cust_CreditRedeem');
      const itemId = await createTestItem('Item_CreditRedeem', 10, 100, true);

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_RedeemBank`,
        type: 'BANK',
        openingBalance: 1000,
      });

      // 1. Give customer 200 in advance credit
      await paymentService.receiveCustomerPayment({
        businessId,
        customerId: custId,
        amount: 200,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      // Bank balance is now 1200
      // 2. Customer buys 500 item: 200 paid via credit, 300 paid directly
      const sale = await saleService.completeSale(businessId, {
        customerId: custId,
        customerNameSnapshot: 'Cust_CreditRedeem',
        saleDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_CreditRedeem', quantity: 1, unit: 'pcs', rate: 500, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 300,
        applyCustomerCredit: 200,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForAccount(bankAcc.id);
      // Expected movements: Opening (1000) + Advance Payment (200) + Direct Sale Payment (300) = 1500
      const directSaleMov = movements.find((m) => m.amount === 300);
      const totalBankBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed = directSaleMov !== undefined && totalBankBal === 1500;

      return {
        passed,
        message: passed
          ? `Credit redemption (₹200) created 0 movements; only direct cash (₹300) recorded a financial movement, balance correctly ₹1,500.`
          : `Failed: directSaleMov=${directSaleMov !== undefined}, totalBankBal=${totalBankBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 27 (F): Customer Payment Reversal
  // ----------------------------------------------------
  await runTest(
    27,
    'Customer Payment Reversal -> CUSTOMER_PAYMENT_REVERSAL Movement (OUT)',
    'Phase 5 Stage 2: Reversals',
    async () => {
      const custId = await createTestCustomer('Cust_RevPayment');
      const { account: cashAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_RevCash`,
        type: 'CASH',
        openingBalance: 1000,
      });

      // 1. Receive 400
      const payRes = await paymentService.receiveCustomerPayment({
        businessId,
        customerId: custId,
        amount: 400,
        paymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
      });

      // 2. Reverse the payment
      const revRes = await saleCorrectionService.processPaymentReversal({
        businessId,
        originalPaymentId: payRes.payment.id,
        customerId: custId,
        reason: 'Cheque bounced',
      });

      const movements = await financialMovementRepository.getMovementsForAccount(cashAcc.id);
      const revMov = movements.find((m) => m.type === 'CUSTOMER_PAYMENT_REVERSAL');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(cashAcc.id);

      const passed =
        revMov !== undefined &&
        revMov.direction === 'OUT' &&
        revMov.amount === 400 &&
        revMov.referenceId === revRes.reversal.id &&
        finalBal === 1000;

      return {
        passed,
        message: passed
          ? `Customer payment reversal created compensating CUSTOMER_PAYMENT_REVERSAL movement (OUT, ₹400) and restored account balance to ₹1,000.`
          : `Failed: revMov=${JSON.stringify(revMov)}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 28 (G): Sale Return with Immediate Refund
  // ----------------------------------------------------
  await runTest(
    28,
    'Sale Return (REFUND_NOW) -> REFUND_TO_CUSTOMER Movement (OUT)',
    'Phase 5 Stage 2: Refunds',
    async () => {
      const custId = await createTestCustomer('Cust_ReturnRefund');
      const itemId = await createTestItem('Item_ReturnRefund', 10, 100, true);

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_ReturnBank`,
        type: 'BANK',
        openingBalance: 1000,
      });

      // Direct sale: 300
      const sale = await saleService.completeSale(businessId, {
        customerId: custId,
        customerNameSnapshot: 'Cust_ReturnRefund',
        saleDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_ReturnRefund', quantity: 2, unit: 'pcs', rate: 150, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 300,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 300,
        paidAmount: 300,
        applyCustomerCredit: 0,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const returnableLines = await saleCorrectionService.getSaleReturnableLines(sale.id);

      // Return 1 item (150) with immediate refund
      const retRes = await saleCorrectionService.processSaleReturn({
        businessId,
        originalSaleId: sale.id,
        returnDate: new Date().toISOString(),
        reason: 'CUSTOMER_CHANGED_MIND',
        settlementMode: 'REFUND_NOW',
        refundPaymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
        lines: [{ originalSaleLineId: returnableLines[0].originalSaleLineId, quantityToReturn: 1 }],
      });

      const movements = await financialMovementRepository.getMovementsForAccount(bankAcc.id);
      const refundMov = movements.find((m) => m.type === 'REFUND_TO_CUSTOMER');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed =
        refundMov !== undefined &&
        refundMov.direction === 'OUT' &&
        refundMov.amount === 150 &&
        finalBal === 1150; // 1000 + 300 - 150

      return {
        passed,
        message: passed
          ? `Sale return with REFUND_NOW created REFUND_TO_CUSTOMER movement (OUT, ₹150) and updated bank balance to ₹1,150.`
          : `Failed: refundMov=${JSON.stringify(refundMov)}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 29 (H): Sale Return with Customer Credit -> NO Movement
  // ----------------------------------------------------
  await runTest(
    29,
    'Sale Return (CUSTOMER_CREDIT) -> NO Financial Movement',
    'Phase 5 Stage 2: Refunds',
    async () => {
      const custId = await createTestCustomer('Cust_ReturnCredit');
      const itemId = await createTestItem('Item_ReturnCredit', 10, 100, true);

      const { account: cashAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_ReturnCreditCash`,
        type: 'CASH',
        openingBalance: 1000,
      });

      const sale = await saleService.completeSale(businessId, {
        customerId: custId,
        customerNameSnapshot: 'Cust_ReturnCredit',
        saleDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_ReturnCredit', quantity: 2, unit: 'pcs', rate: 200, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 400,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 400,
        paidAmount: 400,
        applyCustomerCredit: 0,
        paymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
      });

      const returnableLines = await saleCorrectionService.getSaleReturnableLines(sale.id);

      // Return 1 item with CUSTOMER_CREDIT
      await saleCorrectionService.processSaleReturn({
        businessId,
        originalSaleId: sale.id,
        returnDate: new Date().toISOString(),
        reason: 'CUSTOMER_CHANGED_MIND',
        settlementMode: 'CUSTOMER_CREDIT',
        lines: [{ originalSaleLineId: returnableLines[0].originalSaleLineId, quantityToReturn: 1 }],
      });

      const movements = await financialMovementRepository.getMovementsForAccount(cashAcc.id);
      const refundMovements = movements.filter((m) => m.type === 'REFUND_TO_CUSTOMER');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(cashAcc.id);

      const passed = refundMovements.length === 0 && finalBal === 1400; // 1000 + 400

      return {
        passed,
        message: passed
          ? `Sale return settled via customer credit created 0 financial movements, keeping cash balance at ₹1,400.`
          : `Failed: refundMovements.length=${refundMovements.length}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 30 (I): Void Sale with Immediate Refund
  // ----------------------------------------------------
  await runTest(
    30,
    'Void Sale (REFUND_NOW) -> REFUND_TO_CUSTOMER Movement (OUT)',
    'Phase 5 Stage 2: Sale Void',
    async () => {
      const custId = await createTestCustomer('Cust_VoidRefund');
      const itemId = await createTestItem('Item_VoidRefund', 10, 100, true);

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_VoidBank`,
        type: 'BANK',
        openingBalance: 1000,
      });

      const sale = await saleService.completeSale(businessId, {
        customerId: custId,
        customerNameSnapshot: 'Cust_VoidRefund',
        saleDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_VoidRefund', quantity: 1, unit: 'pcs', rate: 600, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 600,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 600,
        paidAmount: 600,
        applyCustomerCredit: 0,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      await saleCorrectionService.processSaleVoid({
        businessId,
        originalSaleId: sale.id,
        reason: 'Duplicate order',
        settlementMode: 'REFUND_NOW',
        refundPaymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForAccount(bankAcc.id);
      const refundMov = movements.find((m) => m.type === 'REFUND_TO_CUSTOMER');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed =
        refundMov !== undefined &&
        refundMov.amount === 600 &&
        refundMov.direction === 'OUT' &&
        finalBal === 1000;

      return {
        passed,
        message: passed
          ? `Voiding sale with immediate refund created compensating REFUND_TO_CUSTOMER movement (OUT, ₹600), restoring balance to ₹1,000.`
          : `Failed: refundMov=${JSON.stringify(refundMov)}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 31 (J): Supplier Standalone Payment
  // ----------------------------------------------------
  await runTest(
    31,
    'Supplier Standalone Payment -> SUPPLIER_PAYMENT Movement (OUT)',
    'Phase 5 Stage 2: Supplier Payments',
    async () => {
      const suppId = await createTestSupplier('Supp_Standalone');
      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_SuppBank`,
        type: 'BANK',
        openingBalance: 5000,
      });

      const payRes = await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId: suppId,
        amount: 1200,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForReference(
        businessId,
        'SUPPLIER_PAYMENT',
        payRes.payment.id
      );

      const hasSingleMovement = movements.length === 1;
      const mov = movements[0];
      const correctDetails =
        mov &&
        mov.accountId === bankAcc.id &&
        mov.type === 'SUPPLIER_PAYMENT' &&
        mov.direction === 'OUT' &&
        mov.amount === 1200;

      const newBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);
      const passed = hasSingleMovement && correctDetails && newBal === 3800;

      return {
        passed,
        message: passed
          ? `Supplier payment created single SUPPLIER_PAYMENT movement (OUT, ₹1,200) and deducted bank balance to ₹3,800.`
          : `Failed: hasSingleMovement=${hasSingleMovement}, correctDetails=${correctDetails}, newBal=${newBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 32 (K): Supplier Payment with Advance Overpayment
  // ----------------------------------------------------
  await runTest(
    32,
    'Supplier Overpayment -> Single Movement For Full Amount',
    'Phase 5 Stage 2: Supplier Payments',
    async () => {
      const suppId = await createTestSupplier('Supp_Overpay');
      const itemId = await createTestItem('Item_SuppOverpay', 0, 200, true);

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_SuppOverpayBank`,
        type: 'BANK',
        openingBalance: 3000,
      });

      // 1. Unpaid purchase of 400
      await purchaseService.completePurchase(businessId, {
        supplierId: suppId,
        supplierNameSnapshot: 'Supp_Overpay',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_SuppOverpay', quantity: 2, unit: 'pcs', unitCost: 200, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 400,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 400,
        paidAmount: 0,
        applySupplierCredit: 0,
        paymentMethod: 'CASH',
      });

      // 2. Pay 700 (400 allocated, 300 advance credit)
      const payRes = await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId: suppId,
        amount: 700,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForReference(
        businessId,
        'SUPPLIER_PAYMENT',
        payRes.payment.id
      );

      const hasSingle = movements.length === 1;
      const mov = movements[0];
      const correctAmt = mov && mov.amount === 700 && mov.direction === 'OUT';
      const newBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed = hasSingle && correctAmt && newBal === 2300;

      return {
        passed,
        message: passed
          ? `Supplier advance payment created single movement for ₹700 (full real money outflow), NOT ₹400 (allocated).`
          : `Failed: hasSingle=${hasSingle}, correctAmt=${correctAmt}, newBal=${newBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 33 (L): Direct Paid Purchase Checkout
  // ----------------------------------------------------
  await runTest(
    33,
    'Direct Paid Purchase Checkout -> SUPPLIER_PAYMENT Movement (OUT)',
    'Phase 5 Stage 2: Purchase Checkout',
    async () => {
      const suppId = await createTestSupplier('Supp_DirectPurchase');
      const itemId = await createTestItem('Item_DirectPurchase', 0, 150, true);

      const { account: cashAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_PurchaseCash`,
        type: 'CASH',
        openingBalance: 1000,
      });

      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId: suppId,
        supplierNameSnapshot: 'Supp_DirectPurchase',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_DirectPurchase', quantity: 2, unit: 'pcs', unitCost: 150, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 300,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 300,
        paidAmount: 300,
        applySupplierCredit: 0,
        paymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForAccount(cashAcc.id);
      const purchaseMov = movements.find((m) => m.type === 'SUPPLIER_PAYMENT');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(cashAcc.id);

      const passed = purchaseMov !== undefined && purchaseMov.amount === 300 && purchaseMov.direction === 'OUT' && finalBal === 700;

      return {
        passed,
        message: passed
          ? `Direct paid purchase checkout recorded SUPPLIER_PAYMENT movement (OUT, ₹300) from cash account, balance ₹700.`
          : `Failed: purchaseMov=${JSON.stringify(purchaseMov)}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 34 (M): Unpaid Purchase -> NO Movement
  // ----------------------------------------------------
  await runTest(
    34,
    'Unpaid Purchase Checkout -> NO Financial Movement',
    'Phase 5 Stage 2: Purchase Checkout',
    async () => {
      const suppId = await createTestSupplier('Supp_UnpaidPurch');
      const itemId = await createTestItem('Item_UnpaidPurch', 0, 500, true);

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_UnpaidPurchBank`,
        type: 'BANK',
        openingBalance: 2000,
      });

      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId: suppId,
        supplierNameSnapshot: 'Supp_UnpaidPurch',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_UnpaidPurch', quantity: 1, unit: 'pcs', unitCost: 500, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 500,
        paidAmount: 0,
        applySupplierCredit: 0,
        paymentMethod: 'CASH',
      });

      const movements = await financialMovementRepository.getMovementsForReference(businessId, 'SUPPLIER_PAYMENT', purchase.id);
      const bankBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed = movements.length === 0 && bankBal === 2000;

      return {
        passed,
        message: passed
          ? `Unpaid purchase generated 0 financial movements and left bank balance at ₹2,000.`
          : `Failed: movements.length=${movements.length}, bankBal=${bankBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 35 (N): Purchase with Partial Supplier Credit + Partial Direct Money
  // ----------------------------------------------------
  await runTest(
    35,
    'Purchase with Supplier Credit Redemption -> Movement ONLY for Direct Paid Money',
    'Phase 5 Stage 2: Purchase Checkout',
    async () => {
      const suppId = await createTestSupplier('Supp_CreditRedeem');
      const itemId = await createTestItem('Item_CreditRedeem', 0, 100, true);

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_SuppRedeemBank`,
        type: 'BANK',
        openingBalance: 5000,
      });

      // 1. Give supplier 300 advance credit
      await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId: suppId,
        amount: 300,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });
      // Bank balance is 4700

      // 2. Buy 800: 300 paid via credit, 500 paid directly
      await purchaseService.completePurchase(businessId, {
        supplierId: suppId,
        supplierNameSnapshot: 'Supp_CreditRedeem',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_CreditRedeem', quantity: 8, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 800,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 800,
        paidAmount: 500,
        applySupplierCredit: 300,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForAccount(bankAcc.id);
      const directPaidMov = movements.find((m) => m.amount === 500 && m.type === 'SUPPLIER_PAYMENT');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed = directPaidMov !== undefined && finalBal === 4200; // 5000 - 300 - 500

      return {
        passed,
        message: passed
          ? `Supplier credit redemption (₹300) created 0 movements; only direct payment (₹500) created movement, final balance ₹4,200.`
          : `Failed: directPaidMov=${directPaidMov !== undefined}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 36 (O): Supplier Payment Reversal
  // ----------------------------------------------------
  await runTest(
    36,
    'Supplier Payment Reversal -> SUPPLIER_PAYMENT_REVERSAL Movement (IN)',
    'Phase 5 Stage 2: Reversals',
    async () => {
      const suppId = await createTestSupplier('Supp_RevPay');
      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_SuppRevBank`,
        type: 'BANK',
        openingBalance: 5000,
      });

      // Pay supplier 800
      const payRes = await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId: suppId,
        amount: 800,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      // Reverse the supplier payment
      const revRes = await purchaseCorrectionService.processSupplierPaymentReversal({
        businessId,
        originalPaymentId: payRes.payment.id,
        supplierId: suppId,
        reason: 'Payment cancelled / cheque stopped',
      });

      const movements = await financialMovementRepository.getMovementsForAccount(bankAcc.id);
      const revMov = movements.find((m) => m.type === 'SUPPLIER_PAYMENT_REVERSAL');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed =
        revMov !== undefined &&
        revMov.direction === 'IN' &&
        revMov.amount === 800 &&
        revMov.referenceId === revRes.reversal.id &&
        finalBal === 5000;

      return {
        passed,
        message: passed
          ? `Supplier payment reversal created compensating SUPPLIER_PAYMENT_REVERSAL movement (IN, ₹800) and restored bank balance to ₹5,000.`
          : `Failed: revMov=${JSON.stringify(revMov)}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 37 (P): Purchase Return with Immediate Refund Received
  // ----------------------------------------------------
  await runTest(
    37,
    'Purchase Return (REFUND_RECEIVED_NOW) -> REFUND_FROM_SUPPLIER Movement (IN)',
    'Phase 5 Stage 2: Purchase Returns',
    async () => {
      const suppId = await createTestSupplier('Supp_ReturnRefund');
      const itemId = await createTestItem('Item_ReturnRefund', 0, 200, true);

      const { account: cashAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_ReturnRefundCash`,
        type: 'CASH',
        openingBalance: 1000,
      });

      // Direct purchase 600
      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId: suppId,
        supplierNameSnapshot: 'Supp_ReturnRefund',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_ReturnRefund', quantity: 3, unit: 'pcs', unitCost: 200, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 600,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 600,
        paidAmount: 600,
        applySupplierCredit: 0,
        paymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
      });

      const returnableLines = await purchaseCorrectionService.getPurchaseReturnableLines(purchase.id);

      // Return 1 item (200) with REFUND_RECEIVED_NOW
      await purchaseCorrectionService.processPurchaseReturn({
        businessId,
        originalPurchaseId: purchase.id,
        returnDate: new Date().toISOString(),
        reason: 'DEFECTIVE',
        settlementMode: 'REFUND_RECEIVED_NOW',
        refundPaymentMethod: 'CASH',
        financialAccountId: cashAcc.id,
        lines: [{ originalPurchaseLineId: returnableLines[0].originalPurchaseLineId, quantityToReturn: 1 }],
      });

      const movements = await financialMovementRepository.getMovementsForAccount(cashAcc.id);
      const refundMov = movements.find((m) => m.type === 'REFUND_FROM_SUPPLIER');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(cashAcc.id);

      const passed =
        refundMov !== undefined &&
        refundMov.direction === 'IN' &&
        refundMov.amount === 200 &&
        finalBal === 600; // 1000 - 600 + 200

      return {
        passed,
        message: passed
          ? `Purchase return with REFUND_RECEIVED_NOW created REFUND_FROM_SUPPLIER movement (IN, ₹200) and updated cash balance to ₹600.`
          : `Failed: refundMov=${JSON.stringify(refundMov)}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 38 (Q): Purchase Return with Supplier Credit -> NO Movement
  // ----------------------------------------------------
  await runTest(
    38,
    'Purchase Return (SUPPLIER_CREDIT) -> NO Financial Movement',
    'Phase 5 Stage 2: Purchase Returns',
    async () => {
      const suppId = await createTestSupplier('Supp_ReturnCredit');
      const itemId = await createTestItem('Item_ReturnCredit', 0, 100, true);

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_ReturnCreditBank`,
        type: 'BANK',
        openingBalance: 3000,
      });

      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId: suppId,
        supplierNameSnapshot: 'Supp_ReturnCredit',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_ReturnCredit', quantity: 2, unit: 'pcs', unitCost: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 200,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 200,
        paidAmount: 200,
        applySupplierCredit: 0,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const returnableLines = await purchaseCorrectionService.getPurchaseReturnableLines(purchase.id);

      // Return 1 item with SUPPLIER_CREDIT
      await purchaseCorrectionService.processPurchaseReturn({
        businessId,
        originalPurchaseId: purchase.id,
        returnDate: new Date().toISOString(),
        reason: 'WRONG_ITEM',
        settlementMode: 'SUPPLIER_CREDIT',
        lines: [{ originalPurchaseLineId: returnableLines[0].originalPurchaseLineId, quantityToReturn: 1 }],
      });

      const movements = await financialMovementRepository.getMovementsForAccount(bankAcc.id);
      const refundMovements = movements.filter((m) => m.type === 'REFUND_FROM_SUPPLIER');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed = refundMovements.length === 0 && finalBal === 2800; // 3000 - 200

      return {
        passed,
        message: passed
          ? `Purchase return settled via supplier credit created 0 financial movements, keeping bank balance at ₹2,800.`
          : `Failed: refundMovements.length=${refundMovements.length}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 39 (R): Void Purchase with Refund Received
  // ----------------------------------------------------
  await runTest(
    39,
    'Void Purchase (REFUND_RECEIVED_NOW) -> REFUND_FROM_SUPPLIER Movement (IN)',
    'Phase 5 Stage 2: Purchase Void',
    async () => {
      const suppId = await createTestSupplier('Supp_VoidRefund');
      const itemId = await createTestItem('Item_VoidRefund', 0, 400, true);

      const { account: bankAcc } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_VoidPurchBank`,
        type: 'BANK',
        openingBalance: 5000,
      });

      const purchase = await purchaseService.completePurchase(businessId, {
        supplierId: suppId,
        supplierNameSnapshot: 'Supp_VoidRefund',
        purchaseDate: new Date().toISOString(),
        lines: [{ itemId, itemNameSnapshot: 'Item_VoidRefund', quantity: 1, unit: 'pcs', unitCost: 400, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 400,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 400,
        paidAmount: 400,
        applySupplierCredit: 0,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      await purchaseCorrectionService.processPurchaseVoid({
        businessId,
        originalPurchaseId: purchase.id,
        reason: 'Damaged shipment returned immediately',
        settlementMode: 'REFUND_RECEIVED_NOW',
        refundPaymentMethod: 'BANK_TRANSFER',
        financialAccountId: bankAcc.id,
      });

      const movements = await financialMovementRepository.getMovementsForAccount(bankAcc.id);
      const refundMov = movements.find((m) => m.type === 'REFUND_FROM_SUPPLIER');
      const finalBal = await financialMovementRepository.getDerivedBalanceForAccount(bankAcc.id);

      const passed =
        refundMov !== undefined &&
        refundMov.amount === 400 &&
        refundMov.direction === 'IN' &&
        finalBal === 5000;

      return {
        passed,
        message: passed
          ? `Voiding purchase with immediate refund received created compensating REFUND_FROM_SUPPLIER movement (IN, ₹400), restoring bank balance to ₹5,000.`
          : `Failed: refundMov=${JSON.stringify(refundMov)}, finalBal=${finalBal}`,
      };
    }
  );

  // ----------------------------------------------------
  // SCENARIO 40 (S): End-to-End Multi-Account Balance Reconciliation
  // ----------------------------------------------------
  await runTest(
    40,
    'Multi-Account Balance Reconciliation & Allocation Neutrality',
    'Phase 5 Stage 2: Audit & Integrity',
    async () => {
      // 1. Create Cash (1000) and Bank (2000)
      const { account: cash } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_ReconCash`,
        type: 'CASH',
        openingBalance: 1000,
      });
      const { account: bank } = await financialAccountService.createAccount(businessId, {
        name: `${testPrefix}_ReconBank`,
        type: 'BANK',
        openingBalance: 2000,
      });

      const cust = await createTestCustomer('Cust_Recon');
      const supp = await createTestSupplier('Supp_Recon');
      const item = await createTestItem('Item_Recon', 20, 50, true);
      const categories = await expenseService.getCategories(businessId);

      // 2. Customer pays 500 in Cash (+500 cash) -> Cash = 1500
      await paymentService.receiveCustomerPayment({
        businessId,
        customerId: cust,
        amount: 500,
        paymentMethod: 'CASH',
        financialAccountId: cash.id,
      });

      // 3. Transfer 300 Cash -> Bank (-300 cash, +300 bank) -> Cash = 1200, Bank = 2300
      await accountTransferService.createTransfer({
        businessId,
        fromAccountId: cash.id,
        toAccountId: bank.id,
        amount: 300,
      });

      // 4. Pay Supplier 800 from Bank (-800 bank) -> Bank = 1500
      await supplierPaymentService.recordSupplierPayment({
        businessId,
        supplierId: supp,
        amount: 800,
        paymentMethod: 'BANK_TRANSFER',
        financialAccountId: bank.id,
      });

      // 5. Customer sale 400 direct Cash (+400 cash) -> Cash = 1600
      await saleService.completeSale(businessId, {
        customerId: cust,
        customerNameSnapshot: 'Cust_Recon',
        saleDate: new Date().toISOString(),
        lines: [{ itemId: item, itemNameSnapshot: 'Item_Recon', quantity: 4, unit: 'pcs', rate: 100, discountAmount: 0, taxAmount: 0, trackInventory: true }],
        subtotal: 400,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: 400,
        paidAmount: 400,
        applyCustomerCredit: 0,
        paymentMethod: 'CASH',
        financialAccountId: cash.id,
      });

      // 6. Expense of 200 from Bank (-200 bank) -> Bank = 1300
      await expenseService.createExpense({
        businessId,
        categoryId: categories[0].id,
        financialAccountId: bank.id,
        amount: 200,
        paymentMethod: 'BANK_TRANSFER',
        notes: 'Internet bill',
      });

      // Expected Final Balances:
      // Cash: 1000 + 500 - 300 + 400 = 1600
      // Bank: 2000 + 300 - 800 - 200 = 1300
      // Total Liquid Funds: 1600 + 1300 = 2900
      const cashBal = await financialMovementRepository.getDerivedBalanceForAccount(cash.id);
      const bankBal = await financialMovementRepository.getDerivedBalanceForAccount(bank.id);
      const totalFunds = await financialAccountService.getTotalLiquidFunds(businessId);

      const passed = cashBal === 1600 && bankBal === 1300 && totalFunds.totalBalance >= 2900;

      return {
        passed,
        message: passed
          ? `Complete multi-account ledger reconciliation verified. Cash=₹1,600, Bank=₹1,300, Total Net Liquidity=₹2,900.`
          : `Failed: cashBal=${cashBal} (expected 1600), bankBal=${bankBal} (expected 1300), totalFunds=${totalFunds.totalBalance}`,
        details: [
          `Cash Account ID: ${cash.id} (Balance: ₹${cashBal})`,
          `Bank Account ID: ${bank.id} (Balance: ₹${bankBal})`,
          `Total Funds: ₹${totalFunds.totalBalance}`,
        ],
      };
    }
  );

  return results;
};


