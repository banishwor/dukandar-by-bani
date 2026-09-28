import 'fake-indexeddb/auto';
import { db } from '../db/database';
import { businessRepository } from '../repositories/businessRepository';
import { financialAccountRepository } from '../repositories/financialAccountRepository';
import { cashDrawerService } from '../services/cashDrawerService';
import { saleService } from '../services/saleService';
import { itemRepository } from '../repositories/itemRepository';
import { customerRepository } from '../repositories/customerRepository';
import type { CurrencyDenominations } from '../types';

async function runCashDrawerTests() {
  console.log('================================================================');
  console.log('      DUKANDAR BY BANI — CASH DRAWER (GALLA) TEST SUITE         ');
  console.log('================================================================\n');

  // 1. Setup Business & Default Cash Account
  const business = await businessRepository.createBusiness({
    businessId: '',
    name: 'Galla Test Retailers',
    currencyCode: 'INR',
    currencySymbol: '₹',
  });

  const { account: cashAccount } = await financialAccountRepository.createAccount(business.id, {
    name: 'Cash in Hand',
    type: 'CASH',
    openingBalance: 1500, // Starting with 1,500 float
    isDefault: true,
  });

  console.log('[✓ PASS] Test 1: Created business and default Cash account with ₹1,500 opening balance');

  // 2. Check initial live drawer status
  const initialStatus = await cashDrawerService.getDrawerLiveStatus(business.id);
  if (!initialStatus) throw new Error('Failed to get initial drawer status');
  if (initialStatus.openingFloat !== 1500) {
    throw new Error(`Expected opening float 1500, got ${initialStatus.openingFloat}`);
  }
  if (initialStatus.expectedDrawerCash !== 1500) {
    throw new Error(`Expected expectedDrawerCash 1500, got ${initialStatus.expectedDrawerCash}`);
  }
  console.log('[✓ PASS] Test 2: Live status reports exact opening float ₹1,500 and expected cash ₹1,500');

  // 3. Create an item and perform a cash sale
  const item = await itemRepository.createItem(business.id, {
    name: 'Basmati Rice 5kg',
    type: 'PRODUCT',
    unit: 'BAG',
    sellingPrice: 450,
    costPrice: 380,
    openingStock: 50,
    trackInventory: true,
    isActive: true,
  });

  const customer = await customerRepository.createCustomer(business.id, {
    name: 'Rahul Sharma',
    phone: '9876543210',
    isActive: true,
  });

  const sale = await saleService.completeSale(business.id, {
    customerId: customer.id,
    customerNameSnapshot: customer.name,
    saleDate: new Date().toISOString().split('T')[0],
    subtotal: 900,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 900,
    lines: [
      {
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 2,
        unit: item.unit,
        rate: 450,
        discountAmount: 0,
        taxAmount: 0,
        trackInventory: true,
      },
    ],
    paidAmount: 900,
    paymentMethod: 'CASH',
    financialAccountId: cashAccount.id,
  });

  if (!sale) {
    throw new Error('Sale creation failed');
  }

  // 4. Check updated live drawer status after cash sale
  const statusAfterSale = await cashDrawerService.getDrawerLiveStatus(business.id);
  if (!statusAfterSale) throw new Error('Failed to fetch status after sale');
  if (statusAfterSale.cashSales !== 900) {
    throw new Error(`Expected cashSales 900, got ${statusAfterSale.cashSales}`);
  }
  if (statusAfterSale.expectedDrawerCash !== 2400) {
    throw new Error(`Expected expectedDrawerCash 2400, got ${statusAfterSale.expectedDrawerCash}`);
  }
  console.log('[✓ PASS] Test 3: Cash sale (+₹900) updated live expected drawer balance to ₹2,400');

  // 5. Test Denomination count and Close Galla with a small discrepancy
  // Actual physical count: ₹2,350 (Shortage of ₹50)
  // Denominations: 4x 500 = 2000, 1x 200 = 200, 1x 100 = 100, 1x 50 = 50 -> Total 2,350
  const denoms: CurrencyDenominations = {
    n500: 4,
    n200: 1,
    n100: 1,
    n50: 1,
    n20: 0,
    n10: 0,
    coins: 0,
  };

  const closeResult = await cashDrawerService.closeSession({
    businessId: business.id,
    financialAccountId: cashAccount.id,
    sessionDate: statusAfterSale.sessionDate,
    openedAt: statusAfterSale.openedAt,
    closedAt: new Date().toISOString(),
    openingFloat: statusAfterSale.openingFloat,
    cashSales: statusAfterSale.cashSales,
    cashCustomerPayments: statusAfterSale.cashCustomerPayments,
    cashExpenses: statusAfterSale.cashExpenses,
    cashSupplierPayments: statusAfterSale.cashSupplierPayments,
    cashRefunds: statusAfterSale.cashRefunds,
    cashTransfersIn: statusAfterSale.cashTransfersIn,
    cashTransfersOut: statusAfterSale.cashTransfersOut,
    totalCashIn: statusAfterSale.totalCashIn,
    totalCashOut: statusAfterSale.totalCashOut,
    expectedCash: statusAfterSale.expectedDrawerCash,
    countedCash: 2350,
    difference: -50,
    denominations: denoms,
    nextDayFloat: 1000,        // Retaining ₹1,000 as tomorrow's float
    takeHomeCash: 1350,        // Taking home ₹1,350
    reconcileWithMovement: true, // Post ledger adjustment for ₹50 shortage
    notes: 'End of day closing test with ₹50 shortage',
  });

  if (!closeResult.session) throw new Error('Session creation returned null');
  if (closeResult.session.difference !== -50) {
    throw new Error(`Expected difference -50, got ${closeResult.session.difference}`);
  }
  if (!closeResult.movement) {
    throw new Error('Expected compensating ledger adjustment movement');
  }
  if (closeResult.movement.amount !== 50 || closeResult.movement.direction !== 'OUT') {
    throw new Error(`Expected adjustment of 50 OUT, got ${closeResult.movement.amount} ${closeResult.movement.direction}`);
  }
  console.log('[✓ PASS] Test 4: Galla closed with ₹50 shortage and auto-posted compensating ledger adjustment');

  // 6. Check that todaySession saved nextDayFloat as ₹1,000 for tomorrow
  const nextDayStatus = await cashDrawerService.getDrawerLiveStatus(business.id);
  if (!nextDayStatus) throw new Error('Failed to get next day drawer status');
  if (nextDayStatus.todaySession?.nextDayFloat !== 1000) {
    throw new Error(`Expected todaySession.nextDayFloat 1000, got ${nextDayStatus.todaySession?.nextDayFloat}`);
  }
  console.log('[✓ PASS] Test 5: Next session float allocation preserved as ₹1,000 for tomorrow');

  // 7. Verify End-of-Day Z-Report Generation
  const eodReport = await cashDrawerService.getEODSummary(business.id, closeResult.session.id);
  if (!eodReport) throw new Error('EOD report is null');
  if (eodReport.grossSales !== 900 || eodReport.salesCount !== 1) {
    throw new Error(`Expected grossSales 900 and salesCount 1, got ${eodReport.grossSales} / ${eodReport.salesCount}`);
  }
  if (eodReport.cashSalesTotal !== 900) {
    throw new Error(`Expected cashSalesTotal 900, got ${eodReport.cashSalesTotal}`);
  }
  console.log('[✓ PASS] Test 6: EOD Z-Report accurately generated with sales count and payment totals');

  // 8. Verify Non-Blocking Guarantee: POS sale can proceed right now without needing any previous close
  const unblockedSale = await saleService.completeSale(business.id, {
    customerId: customer.id,
    customerNameSnapshot: customer.name,
    saleDate: new Date().toISOString().split('T')[0],
    subtotal: 450,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 450,
    lines: [
      {
        itemId: item.id,
        itemNameSnapshot: item.name,
        quantity: 1,
        unit: item.unit,
        rate: 450,
        discountAmount: 0,
        taxAmount: 0,
        trackInventory: true,
      },
    ],
    paidAmount: 450,
    paymentMethod: 'CASH',
    financialAccountId: cashAccount.id,
  });
  if (!unblockedSale) {
    throw new Error('Unblocked sale failed');
  }
  console.log('[✓ PASS] Test 7: Non-blocking invariant verified: new sales operate continuously without lockouts');

  // 9. Verify 1-per-day Rule & Same-Day Overwrite / Update
  const updatedStatus = await cashDrawerService.getDrawerLiveStatus(business.id);
  if (!updatedStatus.isClosedToday) {
    throw new Error('Expected isClosedToday to be true');
  }
  if (!updatedStatus.todaySession) {
    throw new Error('Expected todaySession to be defined');
  }

  // Re-close today's session with updated count (now physical count is ₹2,850 exact)
  const recloseResult = await cashDrawerService.closeSession({
    businessId: business.id,
    financialAccountId: cashAccount.id,
    sessionDate: updatedStatus.sessionDate,
    openedAt: updatedStatus.openedAt,
    closedAt: new Date().toISOString(),
    openingFloat: updatedStatus.openingFloat,
    cashSales: updatedStatus.cashSales,
    cashCustomerPayments: updatedStatus.cashCustomerPayments,
    cashExpenses: updatedStatus.cashExpenses,
    cashSupplierPayments: updatedStatus.cashSupplierPayments,
    cashRefunds: updatedStatus.cashRefunds,
    cashTransfersIn: updatedStatus.cashTransfersIn,
    cashTransfersOut: updatedStatus.cashTransfersOut,
    totalCashIn: updatedStatus.totalCashIn,
    totalCashOut: updatedStatus.totalCashOut,
    expectedCash: updatedStatus.expectedDrawerCash,
    countedCash: 2850,
    difference: 0,
    denominations: { ...denoms, n500: 5 },
    nextDayFloat: 1000,
    takeHomeCash: 1850,
    reconcileWithMovement: true,
    notes: 'Updated close after evening sale',
  });

  if (!recloseResult.isUpdate) {
    throw new Error('Expected isUpdate to be true on same-day re-close');
  }
  if (recloseResult.session.id !== closeResult.session.id) {
    throw new Error(`Expected session ID to remain identical (${closeResult.session.id}), got ${recloseResult.session.id}`);
  }

  // Verify only 1 session exists in DB (no duplicates)
  const totalSessions = await cashDrawerService.getPastSessions(business.id);
  if (totalSessions.length !== 1) {
    throw new Error(`Expected exactly 1 session for today, found ${totalSessions.length}`);
  }
  console.log('[✓ PASS] Test 8: Single-day overwrite verified: re-close updated existing session and prevented duplicate rows');

  console.log('\n================================================================');
  console.log('ALL 8 CASH DRAWER (GALLA) TESTS PASSED SUCCESSFULLY!            ');
  console.log('================================================================\n');
}

runCashDrawerTests().catch((err) => {
  console.error('FATAL CASH DRAWER TEST FAILURE:', err);
  process.exit(1);
});
