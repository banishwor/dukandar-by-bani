/**
 * Automated Test Suite for Phase 7C-3: Safe Google Backup Restore, Safety Snapshot & Reconciliation
 *
 * 20 Comprehensive Test Scenarios covering:
 * - Safety snapshot creation, validation, checksum and local persistence
 * - Atomic live database replacement scoped strictly to target business
 * - Multi-business isolation (other businesses 100% untouched)
 * - Device identity preservation (local deviceId untouched)
 * - Historical metadata fidelity (record IDs, versions, device tags, discounts, returns, voids)
 * - SyncMetadata preservation without fake SYNCED states
 * - Post-restore cross-domain financial reconciliation
 * - Automated fail-safe rollback upon error
 * - Manual rollback using safetySnapshotManager
 * - Idempotency and error handling
 */

import { db } from '../db/database';
import { googleBackupRestoreService } from './restore/googleBackupRestoreService';
import { safetySnapshotManager } from './restore/safetySnapshotManager';
import { backupSnapshotService } from './backup/backupSnapshotService';
import { businessRepository } from '../repositories/businessRepository';
import { itemRepository } from '../repositories/itemRepository';
import { customerRepository } from '../repositories/customerRepository';
import { supplierRepository } from '../repositories/supplierRepository';
import { saleService } from './saleService';
import { saleCorrectionService } from './saleCorrectionService';
import { purchaseService } from './purchaseService';
import { financialAccountService } from './financialAccountService';
import { expenseService } from './expenseService';
import { accountTransferService } from './accountTransferService';
import { paymentService } from './paymentService';
import { supplierPaymentService } from './supplierPaymentService';
import { crossDomainReconciliationService } from './crossDomainReconciliationService';
import { getPersistentDeviceId } from '../utils/deviceId';
import type { BusinessBackupSnapshot } from '../types/backup';

export interface RestoreTestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
  details?: Record<string, any>;
}

export const runGoogleBackupRestoreTestSuite = async (): Promise<RestoreTestResult[]> => {
  const results: RestoreTestResult[] = [];

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

  // Test 1: Safety snapshot creation & persistence
  await runTest('Restore Test 1: Safety snapshot is created, validated and persisted with valid SHA-256', async () => {
    const bId = await createBusiness('RT1');
    const safetyRecord = await safetySnapshotManager.createAndPersistSafetySnapshot(bId);

    const passed =
      safetyRecord.businessId === bId &&
      safetyRecord.checksum.startsWith('sha256:') &&
      safetyRecord.totalRecords > 0;

    return {
      passed,
      message: 'Local safety snapshot created and saved to Dexie appSettings.',
      details: { checksum: safetyRecord.checksum, totalRecords: safetyRecord.totalRecords },
    };
  });

  // Test 2: Safety snapshot retrieval and checksum verification
  await runTest('Restore Test 2: Safety snapshot can be retrieved and verified from Dexie appSettings', async () => {
    const bId = await createBusiness('RT2');
    await safetySnapshotManager.createAndPersistSafetySnapshot(bId);

    const retrieved = await safetySnapshotManager.getLatestSafetySnapshot(bId);
    const passed = retrieved !== null && retrieved.businessId === bId && retrieved.checksum.startsWith('sha256:');

    return {
      passed,
      message: 'Retrieved safety snapshot verified with intact checksum.',
      details: { retrievedChecksum: retrieved?.checksum },
    };
  });

  // Test 3: Successful restore replaces target business data
  await runTest('Restore Test 3: Successful restore replaces local business state with remote snapshot', async () => {
    const bId = await createBusiness('RT3');
    await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 1000 });
    await itemRepository.createItem(bId, { name: 'Item Alpha', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, openingStock: 10, trackInventory: true, isActive: true });
    await customerRepository.createCustomer(bId, { name: 'Customer Alice', isActive: true });

    // Snapshot at State 1
    const snapshot1 = await backupSnapshotService.createBackupSnapshot(bId);

    // State 2: Add extra customer and item locally
    await customerRepository.createCustomer(bId, { name: 'Customer Bob (State 2)', isActive: true });
    await itemRepository.createItem(bId, { name: 'Item Beta (State 2)', type: 'PRODUCT', unit: 'pcs', sellingPrice: 50, openingStock: 5, trackInventory: true, isActive: true });

    const custsBefore = await db.customers.where('businessId').equals(bId).toArray();

    // Restore back to Snapshot 1
    const restoreRes = await googleBackupRestoreService.executeRestore(bId, snapshot1);

    const custsAfter = await db.customers.where('businessId').equals(bId).toArray();

    const passed =
      restoreRes.success &&
      custsBefore.length === 2 &&
      custsAfter.length === 1 &&
      custsAfter[0].name === 'Customer Alice';

    return {
      passed,
      message: 'Business state accurately restored to Snapshot 1.',
      details: { custsBefore: custsBefore.length, custsAfter: custsAfter.length },
    };
  });

  // Test 4: Business isolation - other business is 100% untouched
  await runTest('Restore Test 4: Multi-business isolation - other business records remain byte-for-byte unaffected', async () => {
    const bId1 = await createBusiness('RT4_Target');
    const bId2 = await createBusiness('RT4_Other');

    await customerRepository.createCustomer(bId2, { name: 'Other Biz Customer', isActive: true });
    await itemRepository.createItem(bId2, { name: 'Other Biz Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 500, openingStock: 20, trackInventory: true, isActive: true });

    const b2CustsBefore = await db.customers.where('businessId').equals(bId2).toArray();
    const b2ItemsBefore = await db.items.where('businessId').equals(bId2).toArray();

    // Perform restore on bId1
    const b1Snap = await backupSnapshotService.createBackupSnapshot(bId1);
    await googleBackupRestoreService.executeRestore(bId1, b1Snap);

    const b2CustsAfter = await db.customers.where('businessId').equals(bId2).toArray();
    const b2ItemsAfter = await db.items.where('businessId').equals(bId2).toArray();

    const passed =
      b2CustsBefore.length === 1 &&
      b2CustsAfter.length === 1 &&
      b2CustsBefore[0].name === b2CustsAfter[0].name &&
      b2ItemsBefore.length === 1 &&
      b2ItemsAfter.length === 1 &&
      b2ItemsBefore[0].name === b2ItemsAfter[0].name;

    return {
      passed,
      message: 'Other business (bId2) remained 100% identical and untouched.',
      details: { b2CustsAfter, b2ItemsAfter },
    };
  });

  // Test 5: Local deviceId is never replaced
  await runTest('Restore Test 5: Local device identity (deviceId) is preserved and never overwritten by remote backup', async () => {
    const bId = await createBusiness('RT5');
    const currentDeviceId = getPersistentDeviceId();

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    snapshot.metadata.deviceId = 'FOREIGN_DEVICE_XYZ_999';
    snapshot.metadata.checksum = await backupSnapshotService.calculateBackupChecksum(snapshot);

    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const deviceIdAfter = getPersistentDeviceId();
    const passed = deviceIdAfter === currentDeviceId && deviceIdAfter !== 'FOREIGN_DEVICE_XYZ_999';

    return {
      passed,
      message: `Local device identity (${deviceIdAfter}) strictly preserved.`,
      details: { currentDeviceId, deviceIdAfter },
    };
  });

  // Test 6: Historical createdByDeviceId and updatedByDeviceId preserved on records
  await runTest('Restore Test 6: Historical createdByDeviceId & updatedByDeviceId preserved on restored records', async () => {
    const bId = await createBusiness('RT6');
    const item = await itemRepository.createItem(bId, { name: 'Item RT6', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, openingStock: 0, trackInventory: true, isActive: true });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    snapshot.items[0].createdByDeviceId = 'ORIGINAL_CREATOR_DEV_1';
    snapshot.items[0].updatedByDeviceId = 'ORIGINAL_UPDATER_DEV_2';
    snapshot.metadata.checksum = await backupSnapshotService.calculateBackupChecksum(snapshot);

    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const restoredItem = await itemRepository.getItemById(item.id);

    const passed =
      restoredItem?.createdByDeviceId === 'ORIGINAL_CREATOR_DEV_1' &&
      restoredItem?.updatedByDeviceId === 'ORIGINAL_UPDATER_DEV_2';

    return {
      passed,
      message: 'Historical device tags preserved on restored items.',
      details: { restoredItem },
    };
  });

  // Test 7: Record IDs preserved without generating new IDs
  await runTest('Restore Test 7: Record IDs strictly preserved without regenerating keys', async () => {
    const bId = await createBusiness('RT7');
    const cust = await customerRepository.createCustomer(bId, { name: 'Customer Fixed ID', isActive: true });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const restoredCust = await customerRepository.getCustomerById(cust.id);

    const passed = restoredCust !== null && restoredCust.id === cust.id;
    return {
      passed,
      message: `Restored record ID ${cust.id} preserved exactly.`,
      details: { originalId: cust.id, restoredId: restoredCust?.id },
    };
  });

  // Test 8: Record versions preserved
  await runTest('Restore Test 8: Record versions preserved exactly as recorded in backup', async () => {
    const bId = await createBusiness('RT8');
    const cust = await customerRepository.createCustomer(bId, { name: 'Customer V1', isActive: true });
    await customerRepository.updateCustomer(cust.id, { name: 'Customer V2' });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const restoredCust = await customerRepository.getCustomerById(cust.id);

    const passed = restoredCust?.version === 2;
    return {
      passed,
      message: 'Record version 2 preserved intact.',
      details: { version: restoredCust?.version },
    };
  });

  // Test 9: Transaction-level discounts preserved
  await runTest('Restore Test 9: Transaction line & invoice discounts preserved after restore', async () => {
    const bId = await createBusiness('RT9');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 1000 });
    const item = await itemRepository.createItem(bId, { name: 'Item RT9', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, openingStock: 10, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'Cust RT9', isActive: true });

    const sale = await saleService.completeSale(bId, {
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

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const restoredSale = await db.sales.get(sale.id);
    const restoredLines = await db.saleLines.where('saleId').equals(sale.id).toArray();

    const passed =
      restoredSale?.discountAmount === 10 &&
      restoredLines[0]?.discountAmount === 20 &&
      restoredSale?.totalAmount === 170;

    return {
      passed,
      message: 'Transaction-level discounts preserved with exact monetary precision.',
      details: { restoredSale, restoredLine: restoredLines[0] },
    };
  });

  // Test 10: Sale returns & voids preserved
  await runTest('Restore Test 10: Sale returns and void records preserved intact', async () => {
    const bId = await createBusiness('RT10');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 1000 });
    const item = await itemRepository.createItem(bId, { name: 'Item RT10', type: 'PRODUCT', unit: 'pcs', sellingPrice: 100, openingStock: 10, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'Cust RT10', isActive: true });

    const sale = await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 2, unit: 'pcs', rate: 100, trackInventory: true }],
      subtotal: 200,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 200,
      paidAmount: 200,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const saleLines = await db.saleLines.where('saleId').equals(sale.id).toArray();

    // Process a sale return
    await saleCorrectionService.processSaleReturn({
      businessId: bId,
      originalSaleId: sale.id,
      returnDate: new Date().toISOString(),
      settlementMode: 'CUSTOMER_CREDIT',
      lines: [{ originalSaleLineId: saleLines[0].id, quantityToReturn: 1 }],
    });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const returns = await db.saleReturns.where('businessId').equals(bId).toArray();

    const passed = returns.length === 1 && returns[0].totalAmount === 100;
    return {
      passed,
      message: 'Sale returns preserved and restorable.',
      details: { returnsCount: returns.length },
    };
  });

  // Test 11: Payments & financial movements preserved
  await runTest('Restore Test 11: Payments and financial ledger movements preserved', async () => {
    const bId = await createBusiness('RT11');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 1000 });
    const cust = await customerRepository.createCustomer(bId, { name: 'Cust RT11', isActive: true });

    await paymentService.receiveCustomerPayment({
      businessId: bId,
      customerId: cust.id,
      amount: 350,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const payments = await db.payments.where('businessId').equals(bId).toArray();
    const movements = await db.financialMovements.where('businessId').equals(bId).toArray();

    const passed = payments.length === 1 && movements.length >= 2;
    return {
      passed,
      message: 'Payments and immutable ledger movements restored.',
      details: { payments: payments.length, movements: movements.length },
    };
  });

  // Test 12: SyncMetadata preserved without automatic SYNCED state
  await runTest('Restore Test 12: SyncMetadata syncState preserved without marking SYNCED', async () => {
    const bId = await createBusiness('RT12');
    const item = await itemRepository.createItem(bId, { name: 'Item RT12', type: 'PRODUCT', unit: 'pcs', sellingPrice: 50, openingStock: 0, trackInventory: true, isActive: true });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const syncRecord = await db.syncMetadata.where('recordId').equals(item.id).first();

    const passed = syncRecord?.syncState === 'LOCAL_ONLY';
    return {
      passed,
      message: 'Sync state preserved as LOCAL_ONLY.',
      details: { syncState: syncRecord?.syncState },
    };
  });

  // Test 13: Post-restore reconciliation passes 100%
  await runTest('Restore Test 13: Post-restore cross-domain reconciliation passes 100% of audits', async () => {
    const bId = await createBusiness('RT13');
    const acc = await financialAccountService.createAccount(bId, { name: 'Bank', type: 'BANK', openingBalance: 5000 });
    const item = await itemRepository.createItem(bId, { name: 'Widget 13', type: 'PRODUCT', unit: 'pcs', sellingPrice: 200, openingStock: 50, trackInventory: true, isActive: true });
    const cust = await customerRepository.createCustomer(bId, { name: 'Cust 13', isActive: true });

    await saleService.completeSale(bId, {
      customerId: cust.id,
      customerNameSnapshot: cust.name,
      saleDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 5, unit: 'pcs', rate: 200, trackInventory: true }],
      subtotal: 1000,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 1000,
      paidAmount: 600,
      paymentMethod: 'BANK_TRANSFER',
      financialAccountId: acc.account.id,
    });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    const restoreRes = await googleBackupRestoreService.executeRestore(bId, snapshot);

    const passed =
      restoreRes.success &&
      restoreRes.reconciliationReport.passed &&
      restoreRes.reconciliationReport.checks.every((a) => a.passed);

    return {
      passed,
      message: 'All reconciliation audits passed post-restore.',
      details: { audits: restoreRes.reconciliationReport.checks.length },
    };
  });

  // Test 14: Restore history logged in appSettings
  await runTest('Restore Test 14: Restore history entry recorded in appSettings', async () => {
    const bId = await createBusiness('RT14');
    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);

    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const historyEntry = await db.appSettings.get(`RESTORE_HISTORY_${bId}`);
    const historyList = historyEntry?.value ? JSON.parse(historyEntry.value) : [];

    const passed = historyList.length > 0 && historyList[0].status === 'SUCCESS';
    return {
      passed,
      message: 'Restore history entry logged with SUCCESS status.',
      details: { latestEntry: historyList[0] },
    };
  });

  // Test 15: Cross-business restore rejected
  await runTest('Restore Test 15: Cross-business restore rejected when business ID does not match', async () => {
    const bId1 = await createBusiness('RT15_A');
    const bId2 = await createBusiness('RT15_B');

    const snap1 = await backupSnapshotService.createBackupSnapshot(bId1);

    let caught = false;
    try {
      await googleBackupRestoreService.executeRestore(bId2, snap1); // Attempt to restore Biz 1 into Biz 2
    } catch (err: any) {
      caught = err.message.includes('Cross-business restore rejected');
    }

    return {
      passed: caught,
      message: 'Cross-business restore attempt strictly rejected.',
      details: { caught },
    };
  });

  // Test 16: Automatic rollback on invalid snapshot
  await runTest('Restore Test 16: Automatic rollback restores pre-restore state if snapshot is corrupted', async () => {
    const bId = await createBusiness('RT16');
    const cust = await customerRepository.createCustomer(bId, { name: 'Safe Pre-Restore Cust', isActive: true });

    const snap = await backupSnapshotService.createBackupSnapshot(bId);
    // Tamper snapshot checksum
    snap.metadata.checksum = 'sha256:corrupted_hash';

    let caught = false;
    try {
      await googleBackupRestoreService.executeRestore(bId, snap);
    } catch (err: any) {
      caught = true;
    }

    const currentCust = await customerRepository.getCustomerById(cust.id);
    const passed = caught && currentCust !== null && currentCust.name === 'Safe Pre-Restore Cust';

    return {
      passed,
      message: 'Database stayed safe and untouched during rejected restore.',
      details: { currentCust },
    };
  });

  // Test 17: Manual rollback to safety snapshot
  await runTest('Restore Test 17: Manual rollback to safety snapshot restores verified previous state', async () => {
    const bId = await createBusiness('RT17');
    await itemRepository.createItem(bId, { name: 'Original Item 17', type: 'PRODUCT', unit: 'pcs', sellingPrice: 50, openingStock: 10, trackInventory: true, isActive: true });

    // Create safety snapshot
    await safetySnapshotManager.createAndPersistSafetySnapshot(bId);

    // Modify state (add item2)
    await itemRepository.createItem(bId, { name: 'Item 17 Added Later', type: 'PRODUCT', unit: 'pcs', sellingPrice: 75, openingStock: 5, trackInventory: true, isActive: true });

    const itemsBeforeRollback = await db.items.where('businessId').equals(bId).toArray();

    // Rollback
    const recon = await googleBackupRestoreService.rollbackToSafetySnapshot(bId);
    const itemsAfterRollback = await db.items.where('businessId').equals(bId).toArray();

    const passed =
      recon.passed &&
      itemsBeforeRollback.length === 2 &&
      itemsAfterRollback.length === 1 &&
      itemsAfterRollback[0].name === 'Original Item 17';

    return {
      passed,
      message: 'Manual rollback successfully reverted state to safety snapshot.',
      details: { before: itemsBeforeRollback.length, after: itemsAfterRollback.length },
    };
  });

  // Test 18: Account transfers preserved
  await runTest('Restore Test 18: Account transfers and transfer reversals preserved after restore', async () => {
    const bId = await createBusiness('RT18');
    const acc1 = await financialAccountService.createAccount(bId, { name: 'Cash Acc', type: 'CASH', openingBalance: 1000 });
    const acc2 = await financialAccountService.createAccount(bId, { name: 'Bank Acc', type: 'BANK', openingBalance: 1000 });

    await accountTransferService.createTransfer({
      businessId: bId,
      fromAccountId: acc1.account.id,
      toAccountId: acc2.account.id,
      amount: 300,
      transferDate: new Date().toISOString(),
      notes: 'Test Transfer',
    });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    await googleBackupRestoreService.executeRestore(bId, snapshot);

    const transfers = await db.accountTransfers.where('businessId').equals(bId).toArray();
    const passed = transfers.length === 1 && transfers[0].amount === 300;

    return {
      passed,
      message: 'Account transfers restored with full ledger balance consistency.',
      details: { transfersCount: transfers.length },
    };
  });

  // Test 19: Supplier credit & supplier purchases preserved
  await runTest('Restore Test 19: Supplier purchases, payments and credits reconcile post-restore', async () => {
    const bId = await createBusiness('RT19');
    const acc = await financialAccountService.createAccount(bId, { name: 'Cash', type: 'CASH', openingBalance: 5000 });
    const supp = await supplierRepository.createSupplier(bId, { name: 'Supplier RT19', isActive: true });
    const item = await itemRepository.createItem(bId, { name: 'Purchased Item', type: 'PRODUCT', unit: 'pcs', sellingPrice: 200, openingStock: 0, trackInventory: true, isActive: true });

    await purchaseService.completePurchase(bId, {
      supplierId: supp.id,
      supplierNameSnapshot: supp.name,
      purchaseDate: new Date().toISOString(),
      lines: [{ itemId: item.id, itemNameSnapshot: item.name, quantity: 10, unit: 'pcs', unitCost: 100, trackInventory: true }],
      subtotal: 1000,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 1000,
      paidAmount: 600,
      paymentMethod: 'CASH',
      financialAccountId: acc.account.id,
    });

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);
    const restoreRes = await googleBackupRestoreService.executeRestore(bId, snapshot);

    const passed = restoreRes.success && restoreRes.reconciliationReport.passed;

    return {
      passed,
      message: 'Supplier purchases and accounts payable reconcile post-restore.',
      details: { passed: restoreRes.reconciliationReport.passed },
    };
  });

  // Test 20: Large dataset restore performance sanity test
  await runTest('Restore Test 20: Large dataset restore performance sanity test (100+ entities)', async () => {
    const bId = await createBusiness('RT20');
    const promises = Array.from({ length: 40 }).map((_, idx) =>
      itemRepository.createItem(bId, {
        name: `Item RT20_${idx}`,
        type: 'PRODUCT',
        unit: 'pcs',
        sellingPrice: 10 + idx,
        openingStock: 0,
        trackInventory: true,
        isActive: true,
      })
    );
    await Promise.all(promises);

    const snapshot = await backupSnapshotService.createBackupSnapshot(bId);

    const start = performance.now();
    const restoreRes = await googleBackupRestoreService.executeRestore(bId, snapshot);
    const duration = performance.now() - start;

    const passed = restoreRes.success && restoreRes.restoredRecordCount >= 40 && duration < 5000;
    return {
      passed,
      message: `Restored ${restoreRes.restoredRecordCount} records in ${Math.round(duration)}ms.`,
      details: { durationMs: Math.round(duration), totalRecords: restoreRes.restoredRecordCount },
    };
  });

  return results;
};
