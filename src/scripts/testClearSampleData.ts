import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { businessRepository } from '../repositories/businessRepository';
import { sampleDataService } from '../services/sampleDataService';
import { itemRepository } from '../repositories/itemRepository';
import { customerRepository } from '../repositories/customerRepository';
import { supplierRepository } from '../repositories/supplierRepository';

async function verifyClear() {
  console.log('Testing sample data loading & clearing...');
  
  // 1. Create a test store
  const b = await businessRepository.createBusiness({
    businessId: '',
    name: 'Fresh Start Store',
    currencyCode: 'INR',
    currencySymbol: '₹',
  });

  // 2. Load sample data
  console.log('1. Loading sample data...');
  const summary = await sampleDataService.loadSampleData(b.id);
  console.log(`Loaded: ${summary.itemsCount} items, ${summary.customersCount} customers, ${summary.salesCount} sales, ${summary.purchasesCount} purchases.`);

  let itemsBefore = await itemRepository.getItems(b.id);
  let customersBefore = await customerRepository.getCustomers(b.id);
  let salesBefore = await db.sales.where('businessId').equals(b.id).toArray();
  console.log(`Before clear: items=${itemsBefore.length}, customers=${customersBefore.length}, sales=${salesBefore.length}`);

  if (itemsBefore.length === 0) {
    throw new Error('Failed: No items loaded before clear test');
  }

  // 3. Execute Clear Business Data
  console.log('2. Executing sampleDataService.clearBusinessData...');
  await sampleDataService.clearBusinessData(b.id);

  // 4. Verify everything is wiped clean
  let itemsAfter = await itemRepository.getItems(b.id);
  let customersAfter = await customerRepository.getCustomers(b.id);
  let suppliersAfter = await supplierRepository.getSuppliers(b.id);
  let salesAfter = await db.sales.where('businessId').equals(b.id).toArray();
  let purchasesAfter = await db.purchases.where('businessId').equals(b.id).toArray();
  let stockAfter = await db.stockMovements.where('businessId').equals(b.id).toArray();
  let paymentsAfter = await db.payments.where('businessId').equals(b.id).toArray();

  console.log(`After clear: items=${itemsAfter.length}, customers=${customersAfter.length}, suppliers=${suppliersAfter.length}, sales=${salesAfter.length}, purchases=${purchasesAfter.length}, stockMovements=${stockAfter.length}, payments=${paymentsAfter.length}`);

  const isAllZero = 
    itemsAfter.length === 0 && 
    customersAfter.length === 0 && 
    suppliersAfter.length === 0 && 
    salesAfter.length === 0 && 
    purchasesAfter.length === 0 && 
    stockAfter.length === 0 && 
    paymentsAfter.length === 0;

  if (isAllZero) {
    console.log('SUCCESS: All sample and transactional data wiped completely! Clean slate verified.');
  } else {
    console.error('FAILURE: Some data remained after clear.');
    process.exit(1);
  }

  // 5. Test clean reload: load again to verify clean single set without duplicates
  console.log('3. Loading sample data again onto fresh slate...');
  const reloadSummary = await sampleDataService.loadSampleData(b.id);
  let itemsReloaded = await itemRepository.getItems(b.id);
  console.log(`Reloaded items: ${itemsReloaded.length} (expected: 10 items)`);
  if (itemsReloaded.length === 10) {
    console.log('SUCCESS: Exactly 10 clean products loaded with no duplicates!');
  } else {
    console.error(`FAILURE: Expected 10 items, got ${itemsReloaded.length}`);
    process.exit(1);
  }
}

verifyClear().catch((err) => {
  console.error(err);
  process.exit(1);
});
