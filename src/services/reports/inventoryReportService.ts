import { db } from '../../db/database';
import { roundCurrency, addCurrency } from '../../utils/money';
import { itemRepository } from '../../repositories/itemRepository';
import { isDateInRange, type DateRangeBounds } from '../../utils/reportDateRange';
import type { ItemWithStock, StockMovement, StockMovementType } from '../../types';

export interface InventoryReportFilter {
  dateRange?: DateRangeBounds;
  itemId?: string;
  category?: string;
  stockStatus?: 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  searchQuery?: string;
}

export interface InventoryItemSummary {
  itemId: string;
  name: string;
  sku?: string;
  category?: string;
  unit: string;
  currentStock: number;
  lowStockThreshold: number;
  sellingPrice: number;
  costPrice: number;
  valuationAtRetail: number; // currentStock * sellingPrice
  valuationAtCost: number;   // currentStock * costPrice
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

  // Period movement aggregations (if date range applied)
  periodStockAdded: number;
  periodStockSold: number;
  periodStockReturned: number;
  periodStockAdjusted: number;
}

export interface InventoryMovementRow {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  type: StockMovementType;
  quantityChange: number;
  runningStock: number;
  reason?: string;
  referenceId?: string;
  createdAt: string;
}

export interface InventoryReportMetrics {
  totalSkusCount: number;
  inStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;

  totalUnitsInStock: number;
  totalValuationAtCost: number;
  totalValuationAtRetail: number;
  estimatedPotentialGrossMargin: number; // valuationAtRetail - valuationAtCost
  estimatedMarginPercentage: number;

  periodUnitsAdded: number;
  periodUnitsSold: number;
  periodUnitsReturned: number;
  periodUnitsAdjusted: number;
}

export interface InventoryReportResult {
  metrics: InventoryReportMetrics;
  items: InventoryItemSummary[];
  movementLedger: InventoryMovementRow[];
  costingMethodologyNote: string;
}

export const inventoryReportService = {
  async generateInventoryReport(
    businessId: string,
    filter: InventoryReportFilter = {}
  ): Promise<InventoryReportResult> {
    const { dateRange, itemId, category, stockStatus = 'ALL', searchQuery = '' } = filter;

    const [itemsWithStock, allMovements] = await Promise.all([
      itemRepository.getItemsWithStock(businessId),
      db.stockMovements
        .where('businessId')
        .equals(businessId)
        .toArray(),
    ]);

    const itemMap = new Map<string, ItemWithStock>();
    for (const item of itemsWithStock) {
      itemMap.set(item.id, item);
    }

    // Sort movements chronologically (earliest first) to compute running stock
    allMovements.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Compute running stock per item across time
    const runningStockMap = new Map<string, number>();
    const movementRows: InventoryMovementRow[] = [];

    // Aggregations for period
    let periodUnitsAdded = 0;
    let periodUnitsSold = 0;
    let periodUnitsReturned = 0;
    let periodUnitsAdjusted = 0;

    const itemPeriodMovements = new Map<string, { added: number; sold: number; returned: number; adjusted: number }>();

    for (const m of allMovements) {
      const current = runningStockMap.get(m.itemId) || 0;
      const updated = current + (Number(m.quantityChange) || 0);
      runningStockMap.set(m.itemId, updated);

      const itemObj = itemMap.get(m.itemId);
      const inRange = dateRange ? isDateInRange(m.createdAt, dateRange.startDateIso, dateRange.endDateIso) : true;
      const matchItem = itemId ? m.itemId === itemId : true;

      if (inRange) {
        const qty = Number(m.quantityChange) || 0;
        const itemAgg = itemPeriodMovements.get(m.itemId) || { added: 0, sold: 0, returned: 0, adjusted: 0 };

        if (m.type === 'PURCHASE' || m.type === 'OPENING_STOCK') {
          periodUnitsAdded += qty;
          itemAgg.added += qty;
        } else if (m.type === 'SALE') {
          periodUnitsSold += Math.abs(qty);
          itemAgg.sold += Math.abs(qty);
        } else if (m.type === 'SALE_RETURN' || m.type === 'PURCHASE_RETURN') {
          periodUnitsReturned += Math.abs(qty);
          itemAgg.returned += Math.abs(qty);
        } else if (m.type === 'ADJUSTMENT') {
          periodUnitsAdjusted += qty;
          itemAgg.adjusted += qty;
        }

        itemPeriodMovements.set(m.itemId, itemAgg);

        if (matchItem) {
          movementRows.push({
            id: m.id,
            itemId: m.itemId,
            itemName: itemObj?.name || 'Unknown Product',
            unit: itemObj?.unit || 'pcs',
            type: m.type,
            quantityChange: qty,
            runningStock: updated,
            reason: m.reason,
            referenceId: m.referenceId,
            createdAt: m.createdAt,
          });
        }
      }
    }

    // Sort movement ledger in reverse chronological for UI display
    movementRows.reverse();

    // Process Item Summaries
    const query = searchQuery.trim().toLowerCase();
    const itemSummaries: InventoryItemSummary[] = [];

    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalUnitsInStock = 0;
    let totalValuationAtCost = 0;
    let totalValuationAtRetail = 0;

    for (const item of itemsWithStock) {
      if (itemId && item.id !== itemId) continue;
      if (category && item.category !== category) continue;
      if (query) {
        const nameMatch = item.name.toLowerCase().includes(query);
        const skuMatch = (item.sku || '').toLowerCase().includes(query);
        const catMatch = (item.category || '').toLowerCase().includes(query);
        if (!nameMatch && !skuMatch && !catMatch) continue;
      }

      const stock = item.currentStock;
      const threshold = item.lowStockThreshold || 5;

      let status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'IN_STOCK';
      if (stock <= 0) {
        status = 'OUT_OF_STOCK';
        outOfStockCount++;
      } else if (stock <= threshold) {
        status = 'LOW_STOCK';
        lowStockCount++;
      } else {
        inStockCount++;
      }

      if (stockStatus !== 'ALL' && status !== stockStatus) continue;

      const unitCost = Number(item.costPrice || item.purchasePrice) || 0;
      const sellingPrice = Number(item.sellingPrice) || 0;
      const posStock = Math.max(0, stock);

      const valCost = roundCurrency(posStock * unitCost);
      const valRetail = roundCurrency(posStock * sellingPrice);

      totalUnitsInStock += stock;
      totalValuationAtCost = addCurrency(totalValuationAtCost, valCost);
      totalValuationAtRetail = addCurrency(totalValuationAtRetail, valRetail);

      const periodAgg = itemPeriodMovements.get(item.id) || { added: 0, sold: 0, returned: 0, adjusted: 0 };

      itemSummaries.push({
        itemId: item.id,
        name: item.name,
        sku: item.sku,
        category: item.category,
        unit: item.unit,
        currentStock: stock,
        lowStockThreshold: threshold,
        sellingPrice,
        costPrice: unitCost,
        valuationAtRetail: valRetail,
        valuationAtCost: valCost,
        status,
        periodStockAdded: periodAgg.added,
        periodStockSold: periodAgg.sold,
        periodStockReturned: periodAgg.returned,
        periodStockAdjusted: periodAgg.adjusted,
      });
    }

    const estimatedPotentialGrossMargin = roundCurrency(Math.max(0, totalValuationAtRetail - totalValuationAtCost));
    const estimatedMarginPercentage = totalValuationAtRetail > 0
      ? roundCurrency((estimatedPotentialGrossMargin / totalValuationAtRetail) * 100)
      : 0;

    return {
      metrics: {
        totalSkusCount: itemsWithStock.length,
        inStockCount,
        lowStockCount,
        outOfStockCount,
        totalUnitsInStock,
        totalValuationAtCost: roundCurrency(totalValuationAtCost),
        totalValuationAtRetail: roundCurrency(totalValuationAtRetail),
        estimatedPotentialGrossMargin,
        estimatedMarginPercentage,
        periodUnitsAdded,
        periodUnitsSold,
        periodUnitsReturned,
        periodUnitsAdjusted,
      },
      items: itemSummaries,
      movementLedger: movementRows,
      costingMethodologyNote:
        'Inventory valuation and gross margin estimates are computed using standard catalog item costs. True FIFO/Lot-based COGS tracking will be available upon batch management configuration.',
    };
  },
};
