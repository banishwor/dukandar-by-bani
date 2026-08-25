import { db } from '../db/database';
import type { StockMovement, StockMovementType } from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';

/**
 * Stock Movements Repository
 *
 * IMMUTABILITY RULE:
 * Stock movements are append-only ledger entries. They must NEVER be updated or deleted in-place.
 * Any inventory correction or adjustment must be recorded as a new discrete StockMovement
 * (e.g. 'ADJUSTMENT', 'DAMAGE', 'SALE_RETURN', 'PURCHASE_RETURN').
 */
export const inventoryRepository = {
  async getStockMovements(itemId: string): Promise<StockMovement[]> {
    return await db.stockMovements
      .where('itemId')
      .equals(itemId)
      .sortBy('createdAt');
  },

  async getItemCurrentStock(itemId: string): Promise<number> {
    const movements = await db.stockMovements
      .where('itemId')
      .equals(itemId)
      .toArray();

    return movements.reduce((sum, m) => sum + (Number(m.quantityChange) || 0), 0);
  },

  async getStock(itemId: string): Promise<number> {
    return this.getItemCurrentStock(itemId);
  },

  /**
   * Returns a map of itemId -> currentStock across all active stock movements for the business
   */
  async getAllStockMap(businessId: string): Promise<Record<string, number>> {
    const movements = await db.stockMovements
      .where('businessId')
      .equals(businessId)
      .toArray();

    const map: Record<string, number> = {};
    for (const m of movements) {
      map[m.itemId] = (map[m.itemId] || 0) + (Number(m.quantityChange) || 0);
    }
    return map;
  },

  async createMovement(
    businessId: string,
    itemId: string,
    type: StockMovementType,
    quantityChange: number,
    reason?: string,
    referenceId?: string
  ): Promise<StockMovement> {
    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();
    const movement: StockMovement = {
      id: generateUniqueId('STK'),
      businessId,
      itemId,
      type,
      quantityChange,
      reason,
      referenceId,
      createdAt: now,
      createdByDeviceId: deviceId,
      version: 1,
    };

    await db.transaction('rw', [db.stockMovements, db.syncMetadata], async () => {
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
    });

    return movement;
  },
};
