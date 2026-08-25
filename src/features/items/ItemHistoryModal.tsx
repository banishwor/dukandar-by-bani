import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { inventoryRepository } from '../../repositories/inventoryRepository';
import type { ItemWithStock, StockMovement } from '../../types';
import { formatDateTime } from '../../utils/formatters';
import { History, ArrowDownRight, ArrowUpRight, PlusCircle } from 'lucide-react';

interface ItemHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: ItemWithStock | null;
}

export const ItemHistoryModal: React.FC<ItemHistoryModalProps> = ({
  isOpen,
  onClose,
  item,
}) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (item && isOpen) {
      setLoading(true);
      inventoryRepository
        .getStockMovements(item.id)
        .then((m) => {
          setMovements(m.reverse()); // most recent first
        })
        .finally(() => setLoading(false));
    }
  }, [item, isOpen]);

  if (!item) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${item.name} — Stock Ledger`}
      subtitle={`Current Stock: ${item.currentStock} ${item.unit}`}
      maxWidth="md"
    >
      <div className="space-y-4">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-500">Loading stock movements...</div>
        ) : movements.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No stock movements recorded yet for this item.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto -mx-2 px-2">
            {movements.map((m) => {
              const isPositive = m.quantityChange > 0;
              return (
                <div key={m.id} className="py-3 flex items-center justify-between text-sm">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        m.type === 'OPENING_STOCK'
                          ? 'bg-blue-50 text-blue-600'
                          : isPositive
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {m.type === 'OPENING_STOCK' ? (
                        <PlusCircle className="w-4 h-4" />
                      ) : isPositive ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownRight className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs">
                          {m.type.replace('_', ' ')}
                        </span>
                        {m.reason && (
                          <span className="text-[11px] text-slate-500">({m.reason})</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(m.createdAt)}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-sm font-bold font-mono ${
                        isPositive ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {isPositive ? `+${m.quantityChange}` : m.quantityChange} {item.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
