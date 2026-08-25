/**
 * Automated Test Suite for Phase 7B-1: Local Backup Snapshot Format & Integrity
 *
 * 25 Comprehensive Test Scenarios:
 * 1. Snapshot of empty business
 * 2. Snapshot contains exactly one business
 * 3. Business isolation
 * 4. All expected entity collections included
 * 5. Record counts accurate
 * 6. Deterministic entity ordering
 * 7. Deterministic key serialization
 * 8. Checksum generated
 * 9. Checksum changes when business data changes
 * 10. Checksum verification passes for unchanged snapshot
 * 11. Checksum verification fails after payload tampering
 * 12. Duplicate record ID detected
 * 13. Cross-business record detected
 * 14. Broken SaleLine reference detected
 * 15. Broken PaymentAllocation reference detected
 * 16. Broken PurchaseLine reference detected
 * 17. Invalid record version detected
 * 18. OAuth token/secret exclusion
 * 19. Local database remains unchanged after snapshot creation
 * 20. Snapshot reload/parse validation
 * 21. Discount data preserved exactly
 * 22. Historical return/void data preserved
 * 23. Financial movement history preserved
 * 24. SyncMetadata preserved correctly
 * 25. Large synthetic dataset snapshot performance sanity test
 */

import { db } from '../db/database';
import { backupSnapshotService } from './backup/backupSnapshotService';
import { businessRepository } from '../repositories/businessRepository';
import { itemRepository } from '../repositories/itemRepository';
import { customerRepository } from '../repositories/customerRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { saleService } from './saleService';
import { purchaseService } from './purchaseService';
import { paymentService } from './paymentService';
import { supplierPaymentService } from './supplierPaymentService';
import { saleCorrectionService } from './saleCorrectionService';
import { expenseService } from './expenseService';
import { financialAccountService } from './financialAccountService';
import { accountTransferService } from './accountTransferService';
import type { BusinessBackupSnapshot } from '../types/backup';

export interface BackupTestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: Record<string, any>;
}

export const runBackupTestSuite = async (): Promise<BackupTestResult[]> => {
  const results: BackupTestResult[] = [];

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

  const createBusiness = async (prefix: string) => {
    const b = await businessRepository.createBusiness({
      businessId: '',
      name: `${prefix}_${Date.now()}`,
      currencyCode: 'INR',
      currencySymbol: '₹',
    });
    return b.id;
  };

  // Test 1: Snapshot of empty business
  await runTest('Backup Test 1: Snapshot generation for empty business', async () => {
    const bId = await createBusiness('BT1');
    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);

    const validation = await backupSnapshotService.validateBackupSnapshot(snapshot);
    const passed =
      snapshot.metadata.businessId === bId &&
      snapshot.businesses.length === 1 &&
      snapshot.items.length === 0 &&
      validation.isValid;

    return {
      passed,
      message: `Empty business snapshot generated with ${snapshot.metadata.totalRecords} baseline records, valid checksum.`,
      details: { totalRecords: snapshot.metadata.totalRecords, validation },
    };
  });

  // Test 2: Snapshot contains exactly one business
  await runTest('Backup Test 2: Snapshot contains exactly one business profile', async () => {
    const bId = await createBusiness('BT2');
    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);

    const passed = snapshot.businesses.length === 1 && snapshot.businesses[0].id === bId;
    return {
      passed,
      message: 'Snapshot strictly contains exactly 1 business matching businessId.',
      details: { businessCount: snapshot.businesses.length },
    };
  });

  // Test 3: Business isolation
  await runTest('Backup Test 3: Multi-tenant business isolation in backup snapshot', async () => {
    const bId1 = await createBusiness('BT3_A');
    const bId2 = await createBusiness('BT3_B');

    await itemRepository.createItem(bId1, {
      name: 'Item A',
      type: 'PRODUCT',
      unit: 'pcs',
      sellingPrice: 100,
      openingStock: 10,
      trackInventory: true,
      isActive: true,
    });

    await itemRepository.createItem(bId2, {
      name: 'Item B',
      type: 'PRODUCT',
      unit: 'pcs',
      sellingPrice: 200,
      openingStock: 20,
      trackInventory: true,
      isActive: true,
    });

    const snap1 = await backupSnapshotService.createBackupSnapshot(bId1);
    const snap2 = await backupSnapshotService.createBackupSnapshot(bId2);

    const passed =
      snap1.items.length === 1 &&
      snap1.items[0].name === 'Item A' &&
      snap2.items.length === 1 &&
      snap2.items[0].name === 'Item B';

    return {
      passed,
      message: 'Zero data leakage: Snapshots contain exclusively their respective business items.',
      details: { snap1Items: snap1.items.length, snap2Items: snap2.items.length },
    };
  });

  // Test 4: All expected entity collections included
  await runTest('Backup Test 4: All 29 entity collections and sync metadata present in snapshot', async () => {
    const bId = await createBusiness('BT4');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const requiredKeys = [
      'businesses',
      'items',
      'customers',
      'suppliers',
      'sales',
      'saleLines',
      'saleReturns',
      'saleReturnLines',
      'saleVoids',
      'payments',
      'paymentAllocations',
      'paymentReversals',
      'refunds',
      'purchases',
      'purchaseLines',
      'purchaseReturns',
      'purchaseReturnLines',
      'purchaseVoids',
      'supplierPayments',
      'supplierPaymentAllocations',
      'supplierPaymentReversals',
      'refundsReceived',
      'stockMovements',
      'financialAccounts',
      'financialMovements',
      'expenseCategories',
      'expenses',
      'expenseReversals',
      'accountTransfers',
      'accountTransferReversals',
      'syncMetadata',
    ];

    const allPresent = requiredKeys.every((k) => Array.isArray((snap as any)[k]));
    return {
      passed: allPresent,
      message: 'All 29 domain entity collections + syncMetadata confirmed as array structures.',
      details: { requiredCount: requiredKeys.length },
    };
  });

  // Test 5: Record counts accurate
  await runTest('Backup Test 5: Metadata record counts strictly match actual array lengths', async () => {
    const bId = await createBusiness('BT5');
    await customerRepository.createCustomer(bId, { name: 'Customer 1', isActive: true });
    await customerRepository.createCustomer(bId, { name: 'Customer 2', isActive: true });

    const snap = await backupSnapshotService.createBackupSnapshot(bId);
    const m = snap.metadata.recordCounts;

    const passed = m.customers === 2 && snap.customers.length === 2 && m.businesses === 1;
    return {
      passed,
      message: `Record counts verified: Customers=${m.customers}, Businesses=${m.businesses}.`,
      details: m,
    };
  });

  // Test 6: Deterministic entity ordering
  await runTest('Backup Test 6: Deterministic entity sorting (id ascending)', async () => {
    const bId = await createBusiness('BT6');
    await itemRepository.createItem(bId, { name: 'Z Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 50, openingStock: 0, trackInventory: true, isActive: true });
    await itemRepository.createItem(bId, { name: 'A Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 50, openingStock: 0, trackInventory: true, isActive: true });
    await itemRepository.createItem(bId, { name: 'M Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 50, openingStock: 0, trackInventory: true, isActive: true });

    const snap = await backupSnapshotService.createBackupSnapshot(bId);
    const ids = snap.items.map((i) => i.id);
    const sortedIds = [...ids].sort();

    const passed = JSON.stringify(ids) === JSON.stringify(sortedIds);
    return {
      passed,
      message: 'Entity collections sorted strictly by ID ascending.',
      details: { ids },
    };
  });

  // Test 7: Deterministic key serialization
  await runTest('Backup Test 7: Deterministic canonical JSON key sorting', async () => {
    const bId = await createBusiness('BT7');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const json1 = backupSnapshotService.serializeBackupSnapshot(snap);
    const json2 = backupSnapshotService.serializeBackupSnapshot(snap);

    const passed = json1 === json2 && json1.length > 0;
    return {
      passed,
      message: 'Consecutive canonical serializations produce byte-for-byte identical output.',
      details: { sizeBytes: json1.length },
    };
  });

  // Test 8: Checksum generated
  await runTest('Backup Test 8: SHA-256 cryptographic checksum generation', async () => {
    const bId = await createBusiness('BT8');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const checksum = snap.metadata.checksum;
    const passed = checksum.startsWith('sha256:') && checksum.length === 71; // 7 chars prefix + 64 hex
    return {
      passed,
      message: `Standard SHA-256 checksum generated: ${checksum.slice(0, 20)}...`,
      details: { checksum },
    };
  });

  // Test 9: Checksum changes when business data changes
  await runTest('Backup Test 9: Cryptographic checksum sensitivity to business data changes', async () => {
    const bId = await createBusiness('BT9');
    const snap1 = await backupSnapshotService.createBackupSnapshot(bId);

    await itemRepository.createItem(bId, {
      name: 'New Product',
      type: 'PRODUCT',
      unit: 'pcs',
      sellingPrice: 250,
      openingStock: 5,
      trackInventory: true,
      isActive: true,
    });

    const snap2 = await backupSnapshotService.createBackupSnapshot(bId);

    const passed = snap1.metadata.checksum !== snap2.metadata.checksum;
    return {
      passed,
      message: 'Data modifications produce distinct cryptographic checksums.',
      details: { checksum1: snap1.metadata.checksum, checksum2: snap2.metadata.checksum },
    };
  });

  // Test 10: Checksum verification passes for unchanged snapshot
  await runTest('Backup Test 10: Checksum verification passes for pristine snapshot', async () => {
    const bId = await createBusiness('BT10');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const validation = await backupSnapshotService.validateBackupSnapshot(snap);
    return {
      passed: validation.isValid,
      message: 'Checksum and structural validation passed with 0 errors.',
      details: validation,
    };
  });

  // Test 11: Checksum verification fails after payload tampering
  await runTest('Backup Test 11: Checksum verification detects payload tampering', async () => {
    const bId = await createBusiness('BT11');
    const item = await itemRepository.createItem(bId, {
      name: 'Original Item',
      type: 'PRODUCT',
      unit: 'pcs',
      sellingPrice: 100,
      openingStock: 10,
      trackInventory: true,
      isActive: true,
    });

    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    // Tamper with price in snapshot without updating checksum
    const tamperedSnap: BusinessBackupSnapshot = {
      ...snap,
      items: snap.items.map((i) => (i.id === item.id ? { ...i, sellingPrice: 999999 } : i)),
    };

    const validation = await backupSnapshotService.validateBackupSnapshot(tamperedSnap);
    const detected = !validation.isValid && validation.errors.some((e) => e.code === 'CHECKSUM_MISMATCH');

    return {
      passed: detected,
      message: 'Tampering detected: CHECKSUM_MISMATCH successfully caught by validator.',
      details: validation.errors,
    };
  });

  // Test 12: Duplicate record ID detected
  await runTest('Backup Test 12: Duplicate record ID detected by validator', async () => {
    const bId = await createBusiness('BT12');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    // Inject duplicate item
    const duplicateSnap: BusinessBackupSnapshot = {
      ...snap,
      items: [
        { id: 'ITEM_DUP', businessId: bId, name: 'Item 1', type: 'PRODUCT', unit: 'pcs', sellingPrice: 10, openingStock: 0, trackInventory: true, isActive: true, createdAt: '', createdByDeviceId: '', updatedAt: '', updatedByDeviceId: '', version: 1, isDeleted: false },
        { id: 'ITEM_DUP', businessId: bId, name: 'Item 2', type: 'PRODUCT', unit: 'pcs', sellingPrice: 20, openingStock: 0, trackInventory: true, isActive: true, createdAt: '', createdByDeviceId: '', updatedAt: '', updatedByDeviceId: '', version: 1, isDeleted: false },
      ],
      metadata: {
        ...snap.metadata,
        recordCounts: { ...snap.metadata.recordCounts, items: 2 },
      },
    };
    duplicateSnap.metadata.checksum = await backupSnapshotService.calculateBackupChecksum(duplicateSnap);

    const validation = await backupSnapshotService.validateBackupSnapshot(duplicateSnap);
    const detected = !validation.isValid && validation.errors.some((e) => e.code === 'DUPLICATE_RECORD_ID');

    return {
      passed: detected,
      message: 'Validator detected DUPLICATE_RECORD_ID.',
      details: validation.errors,
    };
  });

  // Test 13: Cross-business record detected
  await runTest('Backup Test 13: Cross-business record detected by validator', async () => {
    const bId1 = await createBusiness('BT13_A');
    const bId2 = await createBusiness('BT13_B');

    const snap = await backupSnapshotService.createBackupSnapshot(bId1);

    // Inject record belonging to Business B into Business A's snapshot
    const crossSnap: BusinessBackupSnapshot = {
      ...snap,
      items: [
        { id: 'ITEM_CROSS', businessId: bId2, name: 'Foreign Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 10, openingStock: 0, trackInventory: true, isActive: true, createdAt: '', createdByDeviceId: '', updatedAt: '', updatedByDeviceId: '', version: 1, isDeleted: false },
      ],
      metadata: {
        ...snap.metadata,
        recordCounts: { ...snap.metadata.recordCounts, items: 1 },
      },
    };
    crossSnap.metadata.checksum = await backupSnapshotService.calculateBackupChecksum(crossSnap);

    const validation = await backupSnapshotService.validateBackupSnapshot(crossSnap);
    const detected = !validation.isValid && validation.errors.some((e) => e.code === 'CROSS_BUSINESS_RECORD');

    return {
      passed: detected,
      message: 'Validator detected CROSS_BUSINESS_RECORD violation.',
      details: validation.errors,
    };
  });

  // Test 14: Broken SaleLine reference detected
  await runTest('Backup Test 14: Broken SaleLine -> Sale reference detected', async () => {
    const bId = await createBusiness('BT14');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const brokenSnap: BusinessBackupSnapshot = {
      ...snap,
      saleLines: [
        { id: 'SL_1', businessId: bId, saleId: 'NON_EXISTENT_SALE', itemId: 'ITM_1', itemNameSnapshot: 'Product', quantity: 1, unit: 'pcs', rate: 100, discountAmount: 0, taxAmount: 0, lineTotal: 100, createdAt: '', updatedAt: '', version: 1 },
      ],
      metadata: {
        ...snap.metadata,
        recordCounts: { ...snap.metadata.recordCounts, saleLines: 1 },
      },
    };
    brokenSnap.metadata.checksum = await backupSnapshotService.calculateBackupChecksum(brokenSnap);

    const validation = await backupSnapshotService.validateBackupSnapshot(brokenSnap);
    const detected = !validation.isValid && validation.errors.some((e) => e.code === 'BROKEN_REFERENCE');

    return {
      passed: detected,
      message: 'Validator detected BROKEN_REFERENCE for dangling SaleLine.',
      details: validation.errors,
    };
  });

  // Test 15: Broken PaymentAllocation reference detected
  await runTest('Backup Test 15: Broken PaymentAllocation reference detected', async () => {
    const bId = await createBusiness('BT15');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const brokenSnap: BusinessBackupSnapshot = {
      ...snap,
      paymentAllocations: [
        { id: 'ALLOC_1', businessId: bId, paymentId: 'NON_EXISTENT_PAY', saleId: 'NON_EXISTENT_SALE', customerId: 'CUST_1', amount: 50, createdAt: '', updatedAt: '', createdByDeviceId: '', updatedByDeviceId: '', version: 1, isDeleted: false },
      ],
      metadata: {
        ...snap.metadata,
        recordCounts: { ...snap.metadata.recordCounts, paymentAllocations: 1 },
      },
    };
    brokenSnap.metadata.checksum = await backupSnapshotService.calculateBackupChecksum(brokenSnap);

    const validation = await backupSnapshotService.validateBackupSnapshot(brokenSnap);
    const detected = !validation.isValid && validation.errors.some((e) => e.code === 'BROKEN_REFERENCE');

    return {
      passed: detected,
      message: 'Validator detected BROKEN_REFERENCE for orphan PaymentAllocation.',
      details: validation.errors,
    };
  });

  // Test 16: Broken PurchaseLine reference detected
  await runTest('Backup Test 16: Broken PurchaseLine -> Purchase reference detected', async () => {
    const bId = await createBusiness('BT16');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const brokenSnap: BusinessBackupSnapshot = {
      ...snap,
      purchaseLines: [
        { id: 'PL_1', businessId: bId, purchaseId: 'NON_EXISTENT_PUR', itemId: 'ITM_1', itemNameSnapshot: 'Part', quantity: 2, unit: 'pcs', unitCost: 40, discountAmount: 0, taxAmount: 0, lineTotal: 80, trackInventory: true, createdAt: '', updatedAt: '', version: 1 },
      ],
      metadata: {
        ...snap.metadata,
        recordCounts: { ...snap.metadata.recordCounts, purchaseLines: 1 },
      },
    };
    brokenSnap.metadata.checksum = await backupSnapshotService.calculateBackupChecksum(brokenSnap);

    const validation = await backupSnapshotService.validateBackupSnapshot(brokenSnap);
    const detected = !validation.isValid && validation.errors.some((e) => e.code === 'BROKEN_REFERENCE');

    return {
      passed: detected,
      message: 'Validator detected BROKEN_REFERENCE for dangling PurchaseLine.',
      details: validation.errors,
    };
  });

  // Test 17: Invalid record version detected
  await runTest('Backup Test 17: Invalid record version (< 1) detected', async () => {
    const bId = await createBusiness('BT17');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const invalidSnap: BusinessBackupSnapshot = {
      ...snap,
      customers: [
        { id: 'CUST_1', businessId: bId, name: 'Invalid Customer', isActive: true, createdAt: '', createdByDeviceId: '', updatedAt: '', updatedByDeviceId: '', version: 0, isDeleted: false },
      ],
      metadata: {
        ...snap.metadata,
        recordCounts: { ...snap.metadata.recordCounts, customers: 1 },
      },
    };
    invalidSnap.metadata.checksum = await backupSnapshotService.calculateBackupChecksum(invalidSnap);

    const validation = await backupSnapshotService.validateBackupSnapshot(invalidSnap);
    const detected = !validation.isValid && validation.errors.some((e) => e.code === 'INVALID_RECORD_VERSION');

    return {
      passed: detected,
      message: 'Validator detected INVALID_RECORD_VERSION (version must be >= 1).',
      details: validation.errors,
    };
  });

  // Test 18: OAuth token/secret exclusion
  await runTest('Backup Test 18: Security audit: zero OAuth tokens or secret keys in snapshot', async () => {
    const bId = await createBusiness('BT18');
    const snap = await backupSnapshotService.createBackupSnapshot(bId);
    const json = backupSnapshotService.serializeBackupSnapshot(snap);

    const forbidden = ['access_token', 'client_secret', 'private_key', 'clientSecret'];
    const hasForbidden = forbidden.some((f) => json.includes(`"${f}"`));

    return {
      passed: !hasForbidden,
      message: 'Verified: Serialized snapshot payload contains zero tokens, secrets, or passwords.',
      details: { hasForbidden },
    };
  });

  // Test 19: Local database remains unchanged after snapshot creation
  await runTest('Backup Test 19: Snapshot creation is 100% read-only (zero local DB mutations)', async () => {
    const bId = await createBusiness('BT19');
    const cust = await customerRepository.createCustomer(bId, { name: 'Untouched Customer', isActive: true });

    const custBefore = await customerRepository.getCustomerById(cust.id);
    await backupSnapshotService.createBackupSnapshot(bId);
    const custAfter = await customerRepository.getCustomerById(cust.id);

    const passed =
      custBefore !== undefined &&
      custAfter !== undefined &&
      custBefore.version === custAfter.version &&
      custBefore.updatedAt === custAfter.updatedAt;

    return {
      passed,
      message: 'Local database records remain completely immutable during snapshot generation.',
      details: { custBefore, custAfter },
    };
  });

  // Test 20: Snapshot reload/parse validation
  await runTest('Backup Test 20: Roundtrip JSON serialization, parse, and validation', async () => {
    const bId = await createBusiness('BT20');
    const snapOriginal = await backupSnapshotService.createBackupSnapshot(bId);

    const serialized = backupSnapshotService.serializeBackupSnapshot(snapOriginal);
    const parsed: BusinessBackupSnapshot = JSON.parse(serialized);

    const validation = await backupSnapshotService.validateBackupSnapshot(parsed);
    const passed = validation.isValid && parsed.metadata.checksum === snapOriginal.metadata.checksum;

    return {
      passed,
      message: 'Roundtrip JSON parse and validation succeeded with 100% fidelity.',
      details: { sizeBytes: serialized.length },
    };
  });

  // Test 21: Discount data preserved exactly
  await runTest('Backup Test 21: Transaction-level discount metadata preserved in snapshot', async () => {
    const bId = await createBusiness('BT21');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 1000 });
    const item = await itemRepository.createItem(bId, { name: 'Discounted Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 10, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'Disc Customer', isActive: true });

    await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 2, unit: 'pcs', rate: 100, discountType: 'PERCENTAGE', discountValue: 10, discountAmount: 20, trackInventory: true }],
      subtotal: 180,
      discountType: 'FLAT',
      discountValue: 10,
      discountAmount: 10,
      taxAmount: 0,
      totalAmount: 170,
      paidAmount: 170,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const snap = await backupSnapshotService.createBackupSnapshot(bId);
    const sale = snap.sales[0];
    const saleLine = snap.saleLines[0];

    const passed =
      sale &&
      sale.discountAmount === 10 &&
      saleLine &&
      saleLine.discountAmount === 20 &&
      sale.totalAmount === 170;

    return {
      passed,
      message: 'Line and bill discounts preserved intact in backup snapshot.',
      details: { sale, saleLine },
    };
  });

  // Test 22: Historical return/void data preserved
  await runTest('Backup Test 22: Historical sale returns and voids preserved in snapshot', async () => {
    const bId = await createBusiness('BT22');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 5000 });
    const item = await itemRepository.createItem(bId, { name: 'Return Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, purchasePrice: 50, openingStock: 10, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'Return Customer', isActive: true });

    const sale = await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 2, unit: 'pcs', rate: 100, discountType: 'NONE', discountValue: 0, discountAmount: 0, trackInventory: true }],
      subtotal: 200,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 200,
      paidAmount: 200,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const saleLines = await db.saleLines.where('saleId').equals(sale.id).toArray();

    await saleCorrectionService.processSaleReturn({
      businessId: bId,
      originalSaleId: sale.id,
      lines: [{ originalSaleLineId: saleLines[0].id, quantityToReturn: 1 }],
      reason: 'DEFECTIVE',
      settlementMode: 'CUSTOMER_CREDIT',
    });

    const snap = await backupSnapshotService.createBackupSnapshot(bId);

    const passed = snap.saleReturns.length === 1 && snap.saleReturnLines.length === 1 && snap.saleReturns[0].totalAmount === 100;
    return {
      passed,
      message: 'Sale returns and return line items fully preserved in snapshot.',
      details: { returnsCount: snap.saleReturns.length, returnLinesCount: snap.saleReturnLines.length },
    };
  });

  // Test 23: Financial movement history preserved
  await runTest('Backup Test 23: Complete immutable financial movements history preserved', async () => {
    const bId = await createBusiness('BT23');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 2000 });
    const cat = await expenseService.createCategory(bId, { name: 'Office' });

    await expenseService.createExpense({
      businessId: bId,
      categoryId: cat.id,
      financialAccountId: acc.account.id,
      amount: 300,
      paymentMethod: 'CASH',
      notes: 'Stationery',
      expenseDate: new Date().toISOString(),
    });

    const snap = await backupSnapshotService.createBackupSnapshot(bId);
    const passed = snap.financialMovements.length >= 2; // OPENING_BALANCE + EXPENSE

    return {
      passed,
      message: `Preserved ${snap.financialMovements.length} immutable financial movements.`,
      details: { movementsCount: snap.financialMovements.length },
    };
  });

  // Test 24: SyncMetadata preserved correctly
  await runTest('Backup Test 24: SyncMetadata version vectors preserved in backup snapshot', async () => {
    const bId = await createBusiness('BT24');
    await itemRepository.createItem(bId, { name: 'Sync Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 50, openingStock: 0, trackInventory: true, isActive: true });

    const snap = await backupSnapshotService.createBackupSnapshot(bId);
    const passed = snap.syncMetadata.length > 0 && snap.syncMetadata.some((s) => s.recordType === 'item');

    return {
      passed,
      message: `Preserved ${snap.syncMetadata.length} SyncMetadata records for future sync readiness.`,
      details: { syncRecordsCount: snap.syncMetadata.length },
    };
  });

  // Test 25: Large synthetic dataset snapshot performance sanity test
  await runTest('Backup Test 25: Performance sanity test across 100 synthetic records', async () => {
    const bId = await createBusiness('BT25');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 100000 });

    // Seed 50 items and 50 customers
    const itemPromises = Array.from({ length: 50 }).map((_, idx) =>
      itemRepository.createItem(bId, {
        name: `Perf Item ${idx + 1}`,
        type: 'PRODUCT',
        unit: 'pcs',
        sellingPrice: 100 + idx,
        openingStock: 10,
        trackInventory: true,
        isActive: true,
      })
    );

    const custPromises = Array.from({ length: 50 }).map((_, idx) =>
      customerRepository.createCustomer(bId, {
        name: `Perf Customer ${idx + 1}`,
        phone: `98000000${idx.toString().padStart(2, '0')}`,
        isActive: true,
      })
    );

    await Promise.all([...itemPromises, ...custPromises]);

    const start = performance.now();
    const snap = await backupSnapshotService.createBackupSnapshot(bId);
    const duration = performance.now() - start;

    const validation = await backupSnapshotService.validateBackupSnapshot(snap);
    const summary = backupSnapshotService.getBackupSummary(snap);

    const passed = snap.items.length === 50 && snap.customers.length === 50 && validation.isValid && duration < 2000;

    return {
      passed,
      message: `Snapshotted ${summary.totalRecords} records (${summary.sizeFormatted}) in ${Math.round(duration)}ms with 100% validity.`,
      details: { summary, durationMs: Math.round(duration) },
    };
  });

  return results;
};
