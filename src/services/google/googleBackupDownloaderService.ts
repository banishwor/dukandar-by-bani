/**
 * Google Backup Downloader & Snapshot Reconstructor Service (Phase 7C-2)
 *
 * Downloads remote entity tabs, reconstructs the BusinessBackupSnapshot,
 * and validates deep structural integrity and SHA-256 cryptographic checksums.
 * - Operates purely in-memory (0 IndexedDB mutations)
 * - Verifies BackupIndex integrity
 * - Strictly rejects cross-business or tampered data
 */

import { googleAuthService } from './googleAuthService';
import { googleSheetsService } from './googleSheetsService';
import { googleBackupDiscoveryService } from './googleBackupDiscoveryService';
import { googleSheetsTabParser } from './googleSheetsTabParser';
import { backupSnapshotService } from '../backup/backupSnapshotService';
import type { BusinessBackupSnapshot, BackupMetadata } from '../../types/backup';
import type { DownloadProgress } from '../../types/restorePreview';

const ENTITY_TABS = [
  'Businesses',
  'Items',
  'Customers',
  'Suppliers',
  'Sales',
  'SaleLines',
  'SaleReturns',
  'SaleReturnLines',
  'SaleVoids',
  'Payments',
  'PaymentAllocations',
  'PaymentReversals',
  'Refunds',
  'Purchases',
  'PurchaseLines',
  'PurchaseReturns',
  'PurchaseReturnLines',
  'PurchaseVoids',
  'SupplierPayments',
  'SupplierPaymentAllocations',
  'SupplierPaymentReversals',
  'RefundsReceived',
  'StockMovements',
  'FinancialAccounts',
  'FinancialMovements',
  'ExpenseCategories',
  'Expenses',
  'ExpenseReversals',
  'AccountTransfers',
  'AccountTransferReversals',
  'SyncMetadata',
] as const;

export class GoogleBackupDownloaderService {
  /**
   * Downloads a remote verified backup and reconstructs a valid BusinessBackupSnapshot in-memory.
   */
  async downloadAndReconstructSnapshot(
    businessId: string,
    backupId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{
    snapshot: BusinessBackupSnapshot;
    rawIndexRows: any[][];
    rawMetaRow: any[];
  }> {
    const notify = (p: DownloadProgress) => {
      if (onProgress) onProgress(p);
    };

    notify({
      stage: 'VERIFYING_CANDIDATE',
      completedTabs: 0,
      totalTabs: ENTITY_TABS.length + 2,
      percentage: 5,
      message: 'Verifying remote backup candidate in BackupMeta...',
    });

    let accessToken = googleAuthService.getAccessToken();
    if (!accessToken) {
      accessToken = await googleAuthService.requestAccessToken();
    }

    const discovery = await googleBackupDiscoveryService.listRemoteBackups(businessId);
    const candidate = discovery.verifiedBackups.find((b) => b.backupId === backupId);

    if (!candidate) {
      throw new Error(
        `Remote backup "${backupId}" was not found or is not in VERIFIED status for this business.`
      );
    }

    const spreadsheetId = discovery.spreadsheetId;

    // Step 2: Read Control Metadata & Index
    notify({
      stage: 'DOWNLOADING_METADATA',
      completedTabs: 1,
      totalTabs: ENTITY_TABS.length + 2,
      percentage: 10,
      message: 'Reading BackupIndex and control metadata...',
    });

    const [metaRows, indexRows] = await Promise.all([
      googleSheetsService.readSheetValues(accessToken, spreadsheetId, 'BackupMeta!A1:N'),
      googleSheetsService.readSheetValues(accessToken, spreadsheetId, 'BackupIndex!A1:I'),
    ]);

    const matchingMetaRow = metaRows.find((r) => r && r[0] === backupId);
    if (!matchingMetaRow) {
      throw new Error(`Backup record for "${backupId}" not found in BackupMeta tab.`);
    }

    // Step 3: Download Entity Tabs
    const rawTabsData: Record<string, any[][]> = {};
    let completedTabs = 2;

    for (const tabTitle of ENTITY_TABS) {
      notify({
        stage: 'DOWNLOADING_ENTITIES',
        currentTab: tabTitle,
        completedTabs,
        totalTabs: ENTITY_TABS.length + 2,
        percentage: Math.min(70, Math.round((completedTabs / (ENTITY_TABS.length + 2)) * 70)),
        message: `Downloading ${tabTitle} tab...`,
      });

      try {
        const rows = await googleSheetsService.readSheetValues(
          accessToken,
          spreadsheetId,
          `${tabTitle}!A1:Z`
        );
        rawTabsData[tabTitle] = rows || [];
      } catch (err: any) {
        // Tab might be empty or missing
        rawTabsData[tabTitle] = [];
      }

      completedTabs++;
    }

    // Step 4: Reconstruct Snapshot
    notify({
      stage: 'RECONSTRUCTING',
      completedTabs,
      totalTabs: ENTITY_TABS.length + 2,
      percentage: 75,
      message: 'Reconstructing canonical snapshot structure in memory...',
    });

    const businesses = googleSheetsTabParser.parseBusinesses(rawTabsData['Businesses'] || []);
    const items = googleSheetsTabParser.parseItems(rawTabsData['Items'] || []);
    const customers = googleSheetsTabParser.parseCustomers(rawTabsData['Customers'] || []);
    const suppliers = googleSheetsTabParser.parseSuppliers(rawTabsData['Suppliers'] || []);
    const sales = googleSheetsTabParser.parseSales(rawTabsData['Sales'] || []);
    const saleLines = googleSheetsTabParser.parseSaleLines(rawTabsData['SaleLines'] || []);
    const saleReturns = googleSheetsTabParser.parseSaleReturns(rawTabsData['SaleReturns'] || []);
    const saleReturnLines = googleSheetsTabParser.parseSaleReturnLines(rawTabsData['SaleReturnLines'] || []);
    const saleVoids = googleSheetsTabParser.parseSaleVoids(rawTabsData['SaleVoids'] || []);
    const payments = googleSheetsTabParser.parsePayments(rawTabsData['Payments'] || []);
    const paymentAllocations = googleSheetsTabParser.parsePaymentAllocations(rawTabsData['PaymentAllocations'] || []);
    const paymentReversals = googleSheetsTabParser.parsePaymentReversals(rawTabsData['PaymentReversals'] || []);
    const refunds = googleSheetsTabParser.parseRefunds(rawTabsData['Refunds'] || []);
    const purchases = googleSheetsTabParser.parsePurchases(rawTabsData['Purchases'] || []);
    const purchaseLines = googleSheetsTabParser.parsePurchaseLines(rawTabsData['PurchaseLines'] || []);
    const purchaseReturns = googleSheetsTabParser.parsePurchaseReturns(rawTabsData['PurchaseReturns'] || []);
    const purchaseReturnLines = googleSheetsTabParser.parsePurchaseReturnLines(rawTabsData['PurchaseReturnLines'] || []);
    const purchaseVoids = googleSheetsTabParser.parsePurchaseVoids(rawTabsData['PurchaseVoids'] || []);
    const supplierPayments = googleSheetsTabParser.parseSupplierPayments(rawTabsData['SupplierPayments'] || []);
    const supplierPaymentAllocations = googleSheetsTabParser.parseSupplierPaymentAllocations(rawTabsData['SupplierPaymentAllocations'] || []);
    const supplierPaymentReversals = googleSheetsTabParser.parseSupplierPaymentReversals(rawTabsData['SupplierPaymentReversals'] || []);
    const refundsReceived = googleSheetsTabParser.parseRefundsReceived(rawTabsData['RefundsReceived'] || []);
    const stockMovements = googleSheetsTabParser.parseStockMovements(rawTabsData['StockMovements'] || []);
    const financialAccounts = googleSheetsTabParser.parseFinancialAccounts(rawTabsData['FinancialAccounts'] || []);
    const financialMovements = googleSheetsTabParser.parseFinancialMovements(rawTabsData['FinancialMovements'] || []);
    const expenseCategories = googleSheetsTabParser.parseExpenseCategories(rawTabsData['ExpenseCategories'] || []);
    const expenses = googleSheetsTabParser.parseExpenses(rawTabsData['Expenses'] || []);
    const expenseReversals = googleSheetsTabParser.parseExpenseReversals(rawTabsData['ExpenseReversals'] || []);
    const accountTransfers = googleSheetsTabParser.parseAccountTransfers(rawTabsData['AccountTransfers'] || []);
    const accountTransferReversals = googleSheetsTabParser.parseAccountTransferReversals(rawTabsData['AccountTransferReversals'] || []);
    const syncMetadata = googleSheetsTabParser.parseSyncMetadata(rawTabsData['SyncMetadata'] || []);

    const reconstructedCounts = {
      businesses: businesses.length,
      items: items.length,
      customers: customers.length,
      suppliers: suppliers.length,
      sales: sales.length,
      saleLines: saleLines.length,
      saleReturns: saleReturns.length,
      saleReturnLines: saleReturnLines.length,
      saleVoids: saleVoids.length,
      payments: payments.length,
      paymentAllocations: paymentAllocations.length,
      paymentReversals: paymentReversals.length,
      refunds: refunds.length,
      purchases: purchases.length,
      purchaseLines: purchaseLines.length,
      purchaseReturns: purchaseReturns.length,
      purchaseReturnLines: purchaseReturnLines.length,
      purchaseVoids: purchaseVoids.length,
      supplierPayments: supplierPayments.length,
      supplierPaymentAllocations: supplierPaymentAllocations.length,
      supplierPaymentReversals: supplierPaymentReversals.length,
      refundsReceived: refundsReceived.length,
      stockMovements: stockMovements.length,
      financialAccounts: financialAccounts.length,
      financialMovements: financialMovements.length,
      expenseCategories: expenseCategories.length,
      expenses: expenses.length,
      expenseReversals: expenseReversals.length,
      accountTransfers: accountTransfers.length,
      accountTransferReversals: accountTransferReversals.length,
      syncMetadata: syncMetadata.length,
    };

    const totalReconstructedRecords = Object.values(reconstructedCounts).reduce((a, b) => a + b, 0);

    const metadata: BackupMetadata = {
      backupId: candidate.backupId,
      backupFormatVersion: candidate.backupFormatVersion,
      schemaVersion: candidate.schemaVersion,
      appVersion: candidate.appVersion,
      businessId: candidate.businessId,
      businessName: candidate.businessName,
      deviceId: candidate.deviceId,
      createdAt: candidate.createdAt,
      recordCounts: reconstructedCounts,
      totalRecords: totalReconstructedRecords,
      sizeBytes: candidate.sizeBytes,
      checksum: candidate.checksum,
      status: 'VALID',
    };

    const snapshot: BusinessBackupSnapshot = {
      metadata,
      businesses,
      items,
      customers,
      suppliers,
      sales,
      saleLines,
      saleReturns,
      saleReturnLines,
      saleVoids,
      payments,
      paymentAllocations,
      paymentReversals,
      refunds,
      purchases,
      purchaseLines,
      purchaseReturns,
      purchaseReturnLines,
      purchaseVoids,
      supplierPayments,
      supplierPaymentAllocations,
      supplierPaymentReversals,
      refundsReceived,
      stockMovements,
      financialAccounts,
      financialMovements,
      expenseCategories,
      expenses,
      expenseReversals,
      accountTransfers,
      accountTransferReversals,
      syncMetadata,
    };

    // Step 5: Full Deep Validation
    notify({
      stage: 'VALIDATING',
      completedTabs,
      totalTabs: ENTITY_TABS.length + 2,
      percentage: 85,
      message: 'Verifying relational integrity, schema and SHA-256 checksum...',
    });

    const validation = await backupSnapshotService.validateBackupSnapshot(snapshot);
    if (!validation.isValid) {
      const errMsgs = validation.errors.map((e) => e.message).join('; ');
      throw new Error(`Downloaded backup failed structural validation: ${errMsgs}`);
    }

    // Step 6: SHA-256 Checksum Verification
    const computedChecksum = await backupSnapshotService.calculateBackupChecksum(snapshot);
    if (computedChecksum !== candidate.checksum) {
      throw new Error(
        `Cryptographic integrity failure: Reconstructed checksum (${computedChecksum}) does not match recorded checksum (${candidate.checksum}). The remote backup data may have been altered or corrupted.`
      );
    }

    // Step 7: BackupIndex Verification
    const candidateIndexRows = (indexRows || []).filter(
      (r) => r && r[0] === backupId && r[0] !== 'backupId'
    );

    if (candidateIndexRows.length > 0) {
      // Verify indexed count matches reconstructed records
      if (candidateIndexRows.length !== totalReconstructedRecords) {
        throw new Error(
          `BackupIndex count mismatch: Index contains ${candidateIndexRows.length} entries but entity tables contain ${totalReconstructedRecords} records.`
        );
      }
    }

    notify({
      stage: 'READY',
      completedTabs: ENTITY_TABS.length + 2,
      totalTabs: ENTITY_TABS.length + 2,
      percentage: 100,
      message: '✓ Remote backup snapshot reconstructed and verified with 100% integrity.',
    });

    return {
      snapshot,
      rawIndexRows: candidateIndexRows,
      rawMetaRow: matchingMetaRow,
    };
  }
}

export const googleBackupDownloaderService = new GoogleBackupDownloaderService();
