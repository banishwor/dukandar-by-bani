// Local File Restore + Privacy PIN test runner (Batch C)
// Covers the two Batch C paths the integrity suite does not:
//  1. Backup FILE round-trip: snapshot -> JSON text -> parse -> restore,
//     plus legacy-export refusal, garbage rejection, cross-business
//     rejection and tamper rollback.
//  2. Privacy PIN v2 hashing: SHA-256 storage, verification, and the
//     transparent migration of a legacy reversible-base64 PIN.
// Run with: npm run test:file-restore
import 'fake-indexeddb/auto';

// Minimal localStorage shim — must exist before privacyService is imported.
const lsStore = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (lsStore.has(k) ? lsStore.get(k)! : null),
  setItem: (k: string, v: string) => {
    lsStore.set(k, String(v));
  },
  removeItem: (k: string) => {
    lsStore.delete(k);
  },
};

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('  DUKANDAR — LOCAL FILE RESTORE & PRIVACY PIN TESTS (BATCH C)   ');
  console.log('================================================================\n');

  const { businessRepository } = await import('../repositories/businessRepository');
  const { db } = await import('../db/database');
  const { backupSnapshotService } = await import('../services/backup/backupSnapshotService');
  const { googleBackupRestoreService } = await import('../services/restore/googleBackupRestoreService');
  const { parseBackupFileText } = await import('../services/restore/localBackupFileService');
  const { privacyService } = await import('../services/privacyService');
  const { getBusinessPreset, presetDashboardPreferences } = await import(
    '../services/businessPresets'
  );

  console.log('--- FILE RESTORE ---');
  const business = await businessRepository.createBusiness({
    businessId: '',
    name: 'File Restore Test Store',
    currencyCode: 'INR',
    currencySymbol: '₹',
  } as any);

  await db.items.add({
    id: 'ITEM-FILE-1',
    businessId: business.id,
    name: 'Restore Widget',
    type: 'PRODUCT',
  } as any);
  await db.customers.add({
    id: 'CUST-FILE-1',
    businessId: business.id,
    name: 'File Customer',
  } as any);

  const snapshot = await backupSnapshotService.createBackupSnapshot(business.id);
  const fileText = JSON.stringify(snapshot, null, 2);

  // 1. Parse round-trip
  const parsed = parseBackupFileText(fileText);
  check('exported snapshot file parses as snapshot kind', parsed.kind === 'snapshot');
  if (parsed.kind !== 'snapshot') throw new Error('cannot continue');
  check(
    'parsed snapshot keeps its checksum',
    parsed.snapshot.metadata.checksum === snapshot.metadata.checksum
  );

  // 2. Mutate live data, then restore from the parsed file
  await db.items.add({
    id: 'ITEM-FILE-2',
    businessId: business.id,
    name: 'Post-Backup Widget',
    type: 'PRODUCT',
  } as any);
  check('live data diverged (2 items)', (await db.items.count()) === 2);
  const result = await googleBackupRestoreService.executeRestore(business.id, parsed.snapshot);
  check('restore from file succeeded', result.success === true);
  const itemsAfter = await db.items.where('businessId').equals(business.id).toArray();
  check(
    'restore rolled data back to the file (1 item, original only)',
    itemsAfter.length === 1 && itemsAfter[0].id === 'ITEM-FILE-1'
  );

  // 3. Cross-business restore is rejected
  const other = await businessRepository.createBusiness({
    businessId: '',
    name: 'Other Store',
    currencyCode: 'INR',
    currencySymbol: '₹',
  } as any);
  let crossRejected = false;
  try {
    await googleBackupRestoreService.executeRestore(other.id, parsed.snapshot);
  } catch {
    crossRejected = true;
  }
  check('cross-business restore rejected', crossRejected);

  // 4. Tampered file fails and leaves live data untouched
  const tampered = JSON.parse(fileText);
  tampered.items[0].name = 'Tampered Widget';
  let tamperRejected = false;
  try {
    await googleBackupRestoreService.executeRestore(business.id, tampered);
  } catch {
    tamperRejected = true;
  }
  const itemsPostTamper = await db.items.where('businessId').equals(business.id).toArray();
  check('tampered file rejected', tamperRejected);
  check(
    'live data untouched after tamper attempt',
    itemsPostTamper.length === 1 && itemsPostTamper[0].name === 'Restore Widget'
  );

  // 5. Legacy export is classified, not applied
  const legacy = parseBackupFileText(
    JSON.stringify({
      exportedAt: '2026-10-01T00:00:00.000Z',
      deviceId: 'dev-x',
      version: 5,
      data: { businesses: [], items: [] },
    })
  );
  check('legacy ad-hoc export classified as legacy', legacy.kind === 'legacy');

  // 6. Garbage and unknown shapes rejected
  let garbageRejected = false;
  try {
    parseBackupFileText('this is not json');
  } catch {
    garbageRejected = true;
  }
  check('non-JSON file rejected', garbageRejected);
  let unknownRejected = false;
  try {
    parseBackupFileText('{"hello":"world"}');
  } catch {
    unknownRejected = true;
  }
  check('unknown JSON shape rejected', unknownRejected);

  console.log('\n--- PRIVACY PIN ---');
  // 7. New PINs are stored as SHA-256 hashes, never reversible base64
  check('savePin accepts a 4-digit PIN', (await privacyService.savePin('1234')) === true);
  const stored = lsStore.get('dukandar_privacy_pin_hash') || '';
  check('stored PIN is a sha256 hash', stored.startsWith('sha256:'));
  check(
    'stored PIN is not the old reversible encoding',
    stored !== btoa('dukandar_offline_privacy_salt_v1::1234')
  );
  check('correct PIN verifies', (await privacyService.verifyPin('1234')) === true);
  check('wrong PIN rejected', (await privacyService.verifyPin('9999')) === false);

  // 8. Legacy PIN still unlocks and is migrated to a hash
  lsStore.set(
    'dukandar_privacy_pin_hash',
    btoa('dukandar_offline_privacy_salt_v1::4321')
  );
  check('legacy-encoded PIN still verifies', (await privacyService.verifyPin('4321')) === true);
  const migrated = lsStore.get('dukandar_privacy_pin_hash') || '';
  check('legacy PIN migrated to sha256 on unlock', migrated.startsWith('sha256:'));
  check('migrated PIN still verifies', (await privacyService.verifyPin('4321')) === true);
  check('wrong PIN rejected after migration', (await privacyService.verifyPin('0000')) === false);

  console.log('\n--- BUSINESS PRESETS ---');
  const grocery = getBusinessPreset('Grocery / Supermarket');
  check('grocery maps to Perishables with expiry ON', grocery.id === 'perishables' && grocery.enableExpiryTracking === true);
  check('perishables blocks negative stock', grocery.allowNegativeStock === false);
  const pharmacy = getBusinessPreset('Pharmacy / Medical');
  check('pharmacy also maps to Perishables', pharmacy.id === 'perishables');
  const services = getBusinessPreset('Services & Consulting');
  check(
    'services preset: expiry OFF, low-stock + near-expiry alerts OFF',
    services.enableExpiryTracking === false &&
      services.dashboard.showLowStock === false &&
      services.dashboard.showNearExpiry === false
  );
  const restaurant = getBusinessPreset('Restaurant & Cafe');
  check(
    'restaurant preset: expiry ON + thermal printing',
    restaurant.enableExpiryTracking === true && restaurant.defaultPrintFormat === 'THERMAL'
  );
  const workshop = getBusinessPreset('Manufacturing / Workshop');
  check('workshop preset blocks negative stock', workshop.allowNegativeStock === false);
  const fallback = getBusinessPreset('Something Unlisted');
  check('unknown category falls back to General Retail', fallback.id === 'general-retail');
  const servicesDash = presetDashboardPreferences(services);
  check(
    'preset dashboard prefs merge over defaults (other widgets stay ON)',
    servicesDash.showLowStock === false && servicesDash.showRecentSales === true
  );
  const everyCategory = [
    'Retail Store', 'Grocery / Supermarket', 'Wholesale Trader', 'Services & Consulting',
    'Electronics & Hardware', 'Restaurant & Cafe', 'Pharmacy / Medical', 'Garments & Apparel',
    'Manufacturing / Workshop', 'Other Business',
  ];
  check(
    'every wizard category resolves to a preset with a summary',
    everyCategory.every((c) => getBusinessPreset(c).summaryLines.length >= 3)
  );

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('FATAL: test runner crashed', err);
  process.exitCode = 1;
});
