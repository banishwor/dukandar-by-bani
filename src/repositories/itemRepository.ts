import { db } from '../db/database';
import type { Item, ItemWithStock, StockMovement } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { getNextRecordVersion } from '../utils/version';
import { inventoryRepository } from './inventoryRepository';

export const itemRepository = {
  async getItems(businessId: string): Promise<Item[]> {
    return await db.items
      .where('businessId')
      .equals(businessId)
      .filter((i) => !i.isDeleted)
      .sortBy('name');
  },

  async getItemsWithStock(businessId: string): Promise<ItemWithStock[]> {
    const items = await this.getItems(businessId);
    const stockMap = await inventoryRepository.getAllStockMap(businessId);

    return items.map((item) => {
      const currentStock = item.trackInventory ? (stockMap[item.id] ?? 0) : 0;
      const lowThreshold = item.lowStockThreshold ?? 5;
      const isLowStock = item.trackInventory && currentStock <= lowThreshold;
      return {
        ...item,
        currentStock,
        isLowStock,
      };
    });
  },

  async getItemById(id: string): Promise<Item | undefined> {
    const item = await db.items.get(id);
    if (!item || item.isDeleted) return undefined;
    return item;
  },

  async getItemWithStock(itemId: string): Promise<ItemWithStock | undefined> {
    const item = await db.items.get(itemId);
    if (!item || item.isDeleted) return undefined;
    const currentStock = item.trackInventory ? await inventoryRepository.getStock(itemId) : 0;
    const lowThreshold = item.lowStockThreshold ?? 5;
    return {
      ...item,
      currentStock,
      isLowStock: item.trackInventory && currentStock <= lowThreshold,
    };
  },

  async createItem(
    businessId: string,
    data: Omit<Item, 'id' | 'businessId' | 'createdAt' | 'updatedAt' | 'createdByDeviceId' | 'updatedByDeviceId' | 'version' | 'isDeleted'>
  ): Promise<Item> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const itemId = generateUniqueId('ITM');

    const item: Item = {
      ...data,
      id: itemId,
      businessId,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // Atomic transaction creating Item and Opening Stock Movement if applicable
    await db.transaction('rw', [db.items, db.stockMovements, db.syncMetadata], async () => {
      await db.items.add(item);

      await db.syncMetadata.add({
        id: generateUniqueId('SYNC'),
        recordId: item.id,
        recordType: 'item',
        syncState: 'LOCAL_ONLY',
        lastSyncedVersion: 0,
        updatedAt: now,
        version: 1,
      });

      if (item.trackInventory && item.openingStock > 0) {
        const movement: StockMovement = {
          id: generateUniqueId('STK'),
          businessId,
          itemId: item.id,
          type: 'OPENING_STOCK',
          quantityChange: item.openingStock,
          reason: 'Initial Opening Stock',
          createdAt: now,
          createdByDeviceId: deviceId,
          version: 1,
        };
        await db.stockMovements.add(movement);

        await db.syncMetadata.add({
          id: generateUniqueId('SYNC'),
          recordId: movement.id,
          recordType: 'stockMovement',
          syncState: 'LOCAL_ONLY',
          lastSyncedVersion: 0,
          updatedAt: now,
          version: 1,
        });
      }
    });

    return item;
  },

  async updateItem(id: string, updates: Partial<Item>): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.items.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Item');

    // Sanitize updates to prevent tampering with base immutable fields
    const {
      id: _id,
      businessId: _bId,
      createdAt: _cAt,
      createdByDeviceId: _cDev,
      version: _v,
      ...safeUpdates
    } = updates;

    await db.transaction('rw', [db.items, db.syncMetadata], async () => {
      await db.items.update(id, {
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

  async softDeleteItem(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.items.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Item');

    await db.transaction('rw', [db.items, db.syncMetadata], async () => {
      await db.items.update(id, {
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

  async restoreItem(id: string): Promise<void> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const existing = await db.items.get(id);
    if (!existing) return;

    const nextVersion = getNextRecordVersion(existing, 'Item');

    await db.transaction('rw', [db.items, db.syncMetadata], async () => {
      await db.items.update(id, {
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
