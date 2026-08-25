import { db } from '../db/database';
import type { ExpenseCategory, SyncMetadata } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Rent', icon: 'Building', color: '#6366F1' },
  { name: 'Utilities', icon: 'Zap', color: '#F59E0B' },
  { name: 'Salary/Payroll', icon: 'Users', color: '#10B981' },
  { name: 'Transportation', icon: 'Truck', color: '#3B82F6' },
  { name: 'Internet', icon: 'Wifi', color: '#06B6D4' },
  { name: 'Packaging', icon: 'Package', color: '#8B5CF6' },
  { name: 'Marketing', icon: 'Megaphone', color: '#EC4899' },
  { name: 'Repairs', icon: 'Wrench', color: '#F97316' },
  { name: 'Supplies', icon: 'ShoppingBag', color: '#14B8A6' },
  { name: 'Other', icon: 'MoreHorizontal', color: '#6B7280' },
];

export const expenseCategoryRepository = {
  async getCategories(businessId: string): Promise<ExpenseCategory[]> {
    return await db.expenseCategories
      .where('businessId')
      .equals(businessId)
      .filter((c) => !c.isDeleted)
      .sortBy('name');
  },

  async getCategoryById(id: string): Promise<ExpenseCategory | undefined> {
    const cat = await db.expenseCategories.get(id);
    if (!cat || cat.isDeleted) return undefined;
    return cat;
  },

  async createCategory(
    businessId: string,
    data: { name: string; icon?: string; color?: string; isDefault?: boolean }
  ): Promise<ExpenseCategory> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const categoryId = generateUniqueId('CAT');

    const category: ExpenseCategory = {
      id: categoryId,
      businessId,
      name: data.name.trim(),
      icon: data.icon,
      color: data.color,
      isDefault: Boolean(data.isDefault),
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    await db.transaction('rw', [db.expenseCategories, db.syncMetadata], async () => {
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
    });

    return category;
  },

  async updateCategory(
    id: string,
    updates: Partial<Pick<ExpenseCategory, 'name' | 'icon' | 'color'>>
  ): Promise<ExpenseCategory> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.expenseCategories.get(id);

    if (!existing) {
      throw new Error(`Expense category with ID ${id} not found.`);
    }

    const nextVersion = getNextRecordVersion(existing, 'ExpenseCategory');

    await db.transaction('rw', [db.expenseCategories, db.syncMetadata], async () => {
      await db.expenseCategories.update(id, {
        ...updates,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata.where('recordId').equals(id).modify({
        updatedAt: now,
        syncState: 'LOCAL_ONLY',
      });
    });

    return (await db.expenseCategories.get(id))!;
  },

  async archiveCategory(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.expenseCategories.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'ExpenseCategory');

    await db.transaction('rw', [db.expenseCategories, db.syncMetadata], async () => {
      await db.expenseCategories.update(id, {
        isArchived: true,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata.where('recordId').equals(id).modify({
        updatedAt: now,
        syncState: 'LOCAL_ONLY',
      });
    });
  },

  async restoreCategory(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.expenseCategories.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'ExpenseCategory');

    await db.transaction('rw', [db.expenseCategories, db.syncMetadata], async () => {
      await db.expenseCategories.update(id, {
        isArchived: false,
        updatedAt: now,
        updatedByDeviceId: deviceId,
        version: nextVersion,
      });

      await db.syncMetadata.where('recordId').equals(id).modify({
        updatedAt: now,
        syncState: 'LOCAL_ONLY',
      });
    });
  },

  async seedDefaultCategories(businessId: string): Promise<ExpenseCategory[]> {
    const existing = await this.getCategories(businessId);
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));

    const seeded: ExpenseCategory[] = [];
    for (const def of DEFAULT_EXPENSE_CATEGORIES) {
      if (!existingNames.has(def.name.toLowerCase())) {
        const cat = await this.createCategory(businessId, {
          name: def.name,
          icon: def.icon,
          color: def.color,
          isDefault: true,
        });
        seeded.push(cat);
      }
    }
    return seeded;
  },
};
