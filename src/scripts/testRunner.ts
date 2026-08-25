// Node test runner with IndexedDB polyfill for Dexie
import 'fake-indexeddb/auto';
import { runDataIntegrityTestSuite } from '../services/dataIntegrityTestService';
import { runCrossDomainReconciliationTestSuite } from '../services/crossDomainReconciliationTestService';
import { runDiscountTestSuite } from '../services/discountTestService';
import { runReportTestSuite } from '../services/reportTestService';
import { runGoogleBackupTestSuite } from '../services/googleBackupTestService';
import { runBackupTestSuite } from '../services/backupTestService';
import { runGoogleBackupUploadTestSuite } from '../services/googleBackupUploadTestService';
import { runGoogleBackupDiscoveryTestSuite } from '../services/googleBackupDiscoveryTestService';
import { runGoogleBackupRestorePreviewTestSuite } from '../services/googleBackupRestorePreviewTestService';
import { businessRepository } from '../repositories/businessRepository';

async function main() {
  console.log('================================================================');
  console.log('  DUKANDAR BY BANI — DATA INTEGRITY & FINANCIAL RECONCILIATION  ');
  console.log('================================================================\n');

  const business = await businessRepository.createBusiness({
    businessId: '',
    name: 'Integrity Test Enterprise',
    currencyCode: 'INR',
    currencySymbol: '₹',
  });

  console.log('--- SECTION 1: CORE DATA INTEGRITY SCENARIOS (1 - 43) ---');
  const integrityResults = await runDataIntegrityTestSuite(business.id);

  let passedCount = 0;
  let failedCount = 0;

  for (const r of integrityResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] [Scenario ${r.id}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    if (r.details && r.details.length > 0) {
      r.details.forEach((d) => console.log(`    - ${d}`));
    }
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('\n--- SECTION 2: CROSS-DOMAIN FINANCIAL RECONCILIATION AUDITS (101 - 108) ---');
  const reconResults = await runCrossDomainReconciliationTestSuite(business.id);

  for (const r of reconResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] [Audit ${r.id}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    if (r.details && r.details.length > 0) {
      r.details.forEach((d) => console.log(`    - ${d}`));
    }
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('\n--- SECTION 3: PHASE 6A DISCOUNT ENGINE TESTS (1 - 24) ---');
  const discountResults = await runDiscountTestSuite();

  for (const r of discountResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('\n--- SECTION 4: PHASE 6B REPORTS & BI TESTS (1 - 25) ---');
  const reportResults = await runReportTestSuite();

  for (const r of reportResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('\n--- SECTION 5: PHASE 7A GOOGLE CLOUD BACKUP TESTS (1 - 14) ---');
  const googleResults = await runGoogleBackupTestSuite();

  for (const r of googleResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('\n--- SECTION 6: PHASE 7B-1 LOCAL BACKUP SNAPSHOT TESTS (1 - 25) ---');
  const backupResults = await runBackupTestSuite();

  for (const r of backupResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('\n--- SECTION 7: PHASE 7B-2 GOOGLE BACKUP UPLOAD TESTS (1 - 20) ---');
  const uploadResults = await runGoogleBackupUploadTestSuite();

  for (const r of uploadResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('\n--- SECTION 8: PHASE 7C-1 GOOGLE BACKUP DISCOVERY TESTS (1 - 26) ---');
  const discoveryResults = await runGoogleBackupDiscoveryTestSuite();

  for (const r of discoveryResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  console.log('\n--- SECTION 9: PHASE 7C-2 GOOGLE BACKUP RESTORE PREVIEW TESTS (1 - 20) ---');
  const previewResults = await runGoogleBackupRestorePreviewTestSuite();

  for (const r of previewResults) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`[${status}] ${r.name} (${r.durationMs}ms)`);
    console.log(`  Message: ${r.message}`);
    console.log('');
    if (r.passed) passedCount++;
    else failedCount++;
  }

  const totalScenarios =
    integrityResults.length +
    reconResults.length +
    discountResults.length +
    reportResults.length +
    googleResults.length +
    backupResults.length +
    uploadResults.length +
    discoveryResults.length +
    previewResults.length;

  console.log('================================================================');
  console.log(`GRAND SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${totalScenarios} TESTS)`);
  console.log(`  - Section 1 (Core Integrity):     ${integrityResults.filter((r) => r.passed).length}/${integrityResults.length} Passed`);
  console.log(`  - Section 2 (Reconciliation):     ${reconResults.filter((r) => r.passed).length}/${reconResults.length} Passed`);
  console.log(`  - Section 3 (Discount Engine):    ${discountResults.filter((r) => r.passed).length}/${discountResults.length} Passed`);
  console.log(`  - Section 4 (Reports & BI):       ${reportResults.filter((r) => r.passed).length}/${reportResults.length} Passed`);
  console.log(`  - Section 5 (Google Backup):      ${googleResults.filter((r) => r.passed).length}/${googleResults.length} Passed`);
  console.log(`  - Section 6 (Backup Snapshot):    ${backupResults.filter((r) => r.passed).length}/${backupResults.length} Passed`);
  console.log(`  - Section 7 (Backup Upload):      ${uploadResults.filter((r) => r.passed).length}/${uploadResults.length} Passed`);
  console.log(`  - Section 8 (Backup Discovery):   ${discoveryResults.filter((r) => r.passed).length}/${discoveryResults.length} Passed`);
  console.log(`  - Section 9 (Restore Preview):    ${previewResults.filter((r) => r.passed).length}/${previewResults.length} Passed`);
  console.log('================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});


