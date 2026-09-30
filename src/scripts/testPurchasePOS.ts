import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { purchaseService } from '../services/purchaseService';
import { itemRepository } from '../repositories/itemRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { supplierPaymentService } from '../services/supplierPaymentService';
import { generateUniqueId } from '../utils/id';

async function runTests() {
  console.log('================================================================');
  console.log('      DUKANDAR BY BANI — PURCHASE POS & BATCH TEST SUITE        ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  try {
    const businessId = generateUniqueId('BIZ_PUR_TEST');
    await db.businesses.add({
      id: businessId,
      businessId,
      name: 'Inward Test Dukandar',
      currencyCode: 'INR',
      currencySymbol: '₹',
      allowNegativeStock: true,
      enableExpiryTracking: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByDeviceId: 'TEST_DEV',
      updatedByDeviceId: 'TEST_DEV',
      version: 1,
      isDeleted: false,
    });

    // Create default Cash Account
    await db.financialAccounts.add({
      id: generateUniqueId('ACC'),
      businessId,
      name: 'Cash Drawer',
      type: 'CASH',
      isDefault: true,
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByDeviceId: 'TEST_DEV',
      updatedByDeviceId: 'TEST_DEV',
      version: 1,
      isDeleted: false,
    });

    // Create supplier
    const supplier = await supplierRepository.createSupplier(businessId, {
      name: 'Hindustan Logistics Corp',
      phone: '9876543210',
      isActive: true,
    });

    // Create item
    const item = await itemRepository.createItem(businessId, {
      name: 'Amul Butter 500g',
      type: 'PRODUCT',
      unit: 'pcs',
      purchasePrice: 200,
      costPrice: 200,
      sellingPrice: 250,
      openingStock: 0,
      trackInventory: true,
      isActive: true,
    });

    // Test 1: Inward Purchase with Batch Number, Expiry, and updated Selling Price
    const p1 = await purchaseService.completePurchase(businessId, {
      supplierId: supplier.id,
      supplierNameSnapshot: supplier.name,
      purchaseDate: new Date().toISOString(),
      lines: [
        {
          itemId: item.id,
          itemNameSnapshot: item.name,
          quantity: 20,
          unit: 'pcs',
          unitCost: 210, // Wholesale cost went up
          sellingPrice: 270, // Dukandar increases retail price
          batchNumber: 'BATCH-AMUL-01',
          expiryDate: '2027-12-31',
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: true,
        },
      ],
      subtotal: 4200,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 4200,
      paidAmount: 2000, // Partial payment
      paymentMethod: 'CASH',
    });

    const updatedItem1 = await itemRepository.getItemById(item.id);
    const purchaseLines1 = await db.purchaseLines.where('purchaseId').equals(p1.id).toArray();

    if (
      p1 &&
      purchaseLines1.length === 1 &&
      purchaseLines1[0].batchNumber === 'BATCH-AMUL-01' &&
      purchaseLines1[0].expiryDate === '2027-12-31' &&
      updatedItem1?.purchasePrice === 210 &&
      updatedItem1?.sellingPrice === 270 &&
      updatedItem1?.batches?.length === 1 &&
      updatedItem1.batches[0].batchNumber === 'BATCH-AMUL-01' &&
      updatedItem1.batches[0].stockQuantity === 20 &&
      updatedItem1.batches[0].mrp === 270
    ) {
      console.log('[✓ PASS] Test 1: Purchase created with batchNumber, expiryDate, updated cost & selling price');
      passed++;
    } else {
      console.error('[✗ FAIL] Test 1: Item batch or price mismatch', { updatedItem1, lines: purchaseLines1 });
      failed++;
    }

    // Test 2: Inward second purchase with SAME batch increments quantity rather than creating duplicate
    const p2 = await purchaseService.completePurchase(businessId, {
      supplierId: supplier.id,
      supplierNameSnapshot: supplier.name,
      purchaseDate: new Date().toISOString(),
      lines: [
        {
          itemId: item.id,
          itemNameSnapshot: item.name,
          quantity: 10,
          unit: 'pcs',
          unitCost: 210,
          batchNumber: 'BATCH-AMUL-01',
          expiryDate: '2027-12-31',
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: true,
        },
      ],
      subtotal: 2100,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 2100,
      paidAmount: 0, // Full credit
      paymentMethod: 'CASH',
    });

    const updatedItem2 = await itemRepository.getItemById(item.id);
    if (
      updatedItem2?.batches?.length === 1 &&
      updatedItem2.batches[0].stockQuantity === 30 // 20 + 10 = 30
    ) {
      console.log('[✓ PASS] Test 2: Inward stock to existing batch successfully incremented stockQuantity to 30');
      passed++;
    } else {
      console.error('[✗ FAIL] Test 2: Batch consolidation mismatch', updatedItem2?.batches);
      failed++;
    }

    // Test 3: Inward third purchase with a NEW second batch creates second batch cleanly
    await purchaseService.completePurchase(businessId, {
      supplierId: supplier.id,
      supplierNameSnapshot: supplier.name,
      purchaseDate: new Date().toISOString(),
      lines: [
        {
          itemId: item.id,
          itemNameSnapshot: item.name,
          quantity: 15,
          unit: 'pcs',
          unitCost: 215,
          batchNumber: 'BATCH-AMUL-02',
          expiryDate: '2028-06-30',
          sellingPrice: 280,
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: true,
        },
      ],
      subtotal: 3225,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 3225,
      paidAmount: 3225, // Full cash
      paymentMethod: 'CASH',
    });

    const updatedItem3 = await itemRepository.getItemById(item.id);
    if (
      updatedItem3?.batches?.length === 2 &&
      updatedItem3.batches.find((b) => b.batchNumber === 'BATCH-AMUL-02')?.stockQuantity === 15 &&
      updatedItem3.purchasePrice === 215 &&
      updatedItem3.sellingPrice === 280
    ) {
      console.log('[✓ PASS] Test 3: Second batch added cleanly and latest retail prices updated');
      passed++;
    } else {
      console.error('[✗ FAIL] Test 3: Multiple batches mismatch', updatedItem3?.batches);
      failed++;
    }

    // Test 4: Supplier ledger balances are correctly updated
    const summary = await supplierPaymentService.getSupplierFinancialSummary(supplier.id);
    // Bill 1: 4200 (Paid 2000, Due 2200)
    // Bill 2: 2100 (Paid 0, Due 2100)
    // Bill 3: 3225 (Paid 3225, Due 0)
    // Total Purchases = 9525, Total Paid = 5225, Outstanding Payable = 4300
    if (
      summary.totalPurchases === 9525 &&
      summary.totalPaid === 5225 &&
      summary.outstandingPayable === 4300
    ) {
      console.log('[✓ PASS] Test 4: Supplier financial summary reconciled (Purchases: ₹9525, Paid: ₹5225, Due: ₹4300)');
      passed++;
    } else {
      console.error('[✗ FAIL] Test 4: Supplier summary mismatch', summary);
      failed++;
    }

    // Test 5: Stock ledger movement validation
    const movements = await db.stockMovements.where('businessId').equals(businessId).toArray();
    const totalStockIn = movements.reduce((sum, m) => sum + m.quantityChange, 0);
    if (totalStockIn === 45) { // 20 + 10 + 15
      console.log('[✓ PASS] Test 5: Positive StockMovement ledger entries created accurately (+45 total)');
      passed++;
    } else {
      console.error('[✗ FAIL] Test 5: Stock movement mismatch', { movements, totalStockIn });
      failed++;
    }

    // Test 6: Inward purchase with expiryDate but NO batch name creates batch and preserves expiryDate
    const p4 = await purchaseService.completePurchase(businessId, {
      supplierId: supplier.id,
      supplierNameSnapshot: supplier.name,
      purchaseDate: new Date().toISOString(),
      lines: [
        {
          itemId: item.id,
          itemNameSnapshot: item.name,
          quantity: 5,
          unit: 'pcs',
          unitCost: 215,
          expiryDate: '2029-01-15', // NO batchNumber provided!
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: true,
        },
      ],
      subtotal: 1075,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 1075,
      paidAmount: 1075,
      paymentMethod: 'CASH',
    });

    const updatedItem4 = await itemRepository.getItemById(item.id);
    const purchaseLines4 = await db.purchaseLines.where('purchaseId').equals(p4.id).toArray();
    const expiryBatch = updatedItem4?.batches?.find((b) => b.expiryDate === '2029-01-15');

    if (
      purchaseLines4.length === 1 &&
      purchaseLines4[0].expiryDate === '2029-01-15' &&
      expiryBatch &&
      expiryBatch.stockQuantity === 5 &&
      expiryBatch.batchNumber.startsWith('EXP-')
    ) {
      console.log('[✓ PASS] Test 6: Purchase with expiryDate only successfully created batch (EXP-2029-01-15) and preserved expiryDate');
      passed++;
    } else {
      console.error('[✗ FAIL] Test 6: Expiry without batch name failed', { purchaseLines4, batches: updatedItem4?.batches });
      failed++;
    }

    // Test 7: Smart Match Consolidation — Same Expiry + Same MRP + Same Cost without batch name merges into existing batch
    const p5 = await purchaseService.completePurchase(businessId, {
      supplierId: supplier.id,
      supplierNameSnapshot: supplier.name,
      purchaseDate: new Date().toISOString(),
      lines: [
        {
          itemId: item.id,
          itemNameSnapshot: item.name,
          quantity: 8,
          unit: 'pcs',
          unitCost: 215, // Same CP
          sellingPrice: 280, // Same MRP
          expiryDate: '2029-01-15', // Same Expiry, NO batch name provided
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: true,
        },
      ],
      subtotal: 1720,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 1720,
      paidAmount: 1720,
      paymentMethod: 'CASH',
    });

    const updatedItem5 = await itemRepository.getItemById(item.id);
    const purchaseLines5 = await db.purchaseLines.where('purchaseId').equals(p5.id).toArray();
    const matchedBatch = updatedItem5?.batches?.find((b) => b.expiryDate === '2029-01-15');

    if (
      updatedItem5?.batches?.length === 3 && // Still 3 batches: AMUL-01, AMUL-02, EXP-2029-01-15 (no duplicate!)
      matchedBatch &&
      matchedBatch.stockQuantity === 13 && // 5 + 8 = 13
      purchaseLines5.length === 1 &&
      purchaseLines5[0].batchNumber === matchedBatch.batchNumber &&
      purchaseLines5[0].expiryDate === '2029-01-15'
    ) {
      console.log('[✓ PASS] Test 7: Smart match consolidated into existing batch (stock 5 -> 13) and inherited batchNumber without creating duplicate');
      passed++;
    } else {
      console.error('[✗ FAIL] Test 7: Smart match consolidation failed', {
        batches: updatedItem5?.batches,
        purchaseLines5,
      });
      failed++;
    }

    // Test 8: Price Tranche Preservation — Same Expiry but DIFFERENT MRP/Cost creates distinct pricing batch
    const p6 = await purchaseService.completePurchase(businessId, {
      supplierId: supplier.id,
      supplierNameSnapshot: supplier.name,
      purchaseDate: new Date().toISOString(),
      lines: [
        {
          itemId: item.id,
          itemNameSnapshot: item.name,
          quantity: 4,
          unit: 'pcs',
          unitCost: 235, // HIGHER CP
          sellingPrice: 300, // HIGHER MRP
          expiryDate: '2029-01-15', // Same Expiry, but different price tranche
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: true,
        },
      ],
      subtotal: 940,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 940,
      paidAmount: 940,
      paymentMethod: 'CASH',
    });

    const updatedItem6 = await itemRepository.getItemById(item.id);
    const purchaseLines6 = await db.purchaseLines.where('purchaseId').equals(p6.id).toArray();
    const trancheBatch = updatedItem6?.batches?.find((b) => b.expiryDate === '2029-01-15' && b.mrp === 300);

    if (
      updatedItem6?.batches?.length === 4 && // 4 batches now due to distinct price tranche
      trancheBatch &&
      trancheBatch.stockQuantity === 4 &&
      trancheBatch.costPrice === 235 &&
      trancheBatch.mrp === 300 &&
      purchaseLines6.length === 1 &&
      purchaseLines6[0].batchNumber === trancheBatch.batchNumber
    ) {
      console.log('[✓ PASS] Test 8: Different price tranche with same expiry created distinct batch (EXP-2029-01-15-₹300)');
      passed++;
    } else {
      console.error('[✗ FAIL] Test 8: Price tranche distinction failed', {
        batches: updatedItem6?.batches,
        purchaseLines6,
      });
      failed++;
    }

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
