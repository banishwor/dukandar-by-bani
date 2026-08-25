import { db } from '../db/database';
import type { Business, FinancialAccount, ExpenseCategory } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';
import { DEFAULT_EXPENSE_CATEGORIES } from './expenseCategoryRepository';

export const businessRepository = {
  async getActiveBusiness(): Promise<Business | undefined> {
    const businesses = await db.businesses
      .filter((b) => !b.isDeleted)
      .sortBy('createdAt');
    return businesses[0];
  },

  async createBusiness(data: Omit<Business, 'id' | 'createdAt' | 'updatedAt' | 'createdByDeviceId' | 'updatedByDeviceId' | 'version' | 'isDeleted'>): Promise<Business> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const id = generateUniqueId('BIZ');

    const business: Business = {
      ...data,
      id,
      businessId: id,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction(
      'rw',
      [db.businesses, db.financialAccounts, db.expenseCategories, db.syncMetadata],
      async () => {
        // 1. Add Business
        await db.businesses.add(business);
        await db.syncMetadata.add({
          id: generateUniqueId('SYNC'),
          recordId: business.id,
          recordType: 'business',
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        });

        // 2. Atomically seed default Cash in Hand account (Derived balance = ₹0, no movements)
        const cashAccId = generateUniqueId('ACC');
        const cashAccount: FinancialAccount = {
          id: cashAccId,
          businessId: id,
          name: 'Cash in Hand',
          type: 'CASH',
          isDefault: true,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
          createdByDeviceId: deviceId,
          updatedByDeviceId: deviceId,
          version: 1,
          isDeleted: false,
        };
        await db.financialAccounts.add(cashAccount);
        await db.syncMetadata.add({
          id: generateUniqueId('SYNC'),
          recordId: cashAccount.id,
          recordType: 'financialAccount',
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        });

        // 3. Atomically seed default expense categories
        for (const catDef of DEFAULT_EXPENSE_CATEGORIES) {
          const catId = generateUniqueId('CAT');
          const category: ExpenseCategory = {
            id: catId,
            businessId: id,
            name: catDef.name,
            icon: catDef.icon,
            color: catDef.color,
            isDefault: true,
            isArchived: false,
            createdAt: now,
            updatedAt: now,
            createdByDeviceId: deviceId,
            updatedByDeviceId: deviceId,
            version: 1,
            isDeleted: false,
          };
          await db.expenseCategories.add(category);
          await db.syncMetadata.add({
            id: generateUniqueId('SYNC'),
            recordId: category.id,
            recordType: 'expenseCategory',
            syncState: 'LOCAL_ONLY',
            lastSyncedVersion: 0,
            updatedAt: now,
            version: 1,
          });
        }
      }
    );

    return business;
  },

  async updateBusiness(id: string, updates: Partial<Business>): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.businesses.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Business');

    // Sanitize updates to prevent overwriting immutable/protected base fields
    const {
      id: _id,
      businessId: _bId,
      createdAt: _cAt,
      createdByDeviceId: _cDev,
      version: _v,
      ...safeUpdates
    } = updates;

    await db.transaction('rw', [db.businesses, db.syncMetadata], async () => {
      await db.businesses.update(id, {
        ...safeUpdates,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata
        .where('recordId')
        .equals(id)
        .modify({
          updatedAt: now,
          syncState: 'LOCAL_ONLY',
        });
    });
  },

  async softDeleteBusiness(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.businesses.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Business');

    await db.transaction('rw', [db.businesses, db.syncMetadata], async () => {
      await db.businesses.update(id, {
        isDeleted: true,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata
        .where('recordId')
        .equals(id)
        .modify({
          updatedAt: now,
          syncState: 'LOCAL_ONLY',
        });
    });
  },

  async restoreBusiness(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.businesses.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Business');

    await db.transaction('rw', [db.businesses, db.syncMetadata], async () => {
      await db.businesses.update(id, {
        isDeleted: false,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata
        .where('recordId')
        .equals(id)
        .modify({
          updatedAt: now,
          syncState: 'LOCAL_ONLY',
        });
    });
  },
};
