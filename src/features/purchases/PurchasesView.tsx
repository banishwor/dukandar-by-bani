import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { purchaseRepository } from '../../repositories/purchaseRepository';
import type { Purchase } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import {
  Truck,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface PurchasesViewProps {
  onNewPurchaseClick: () => void;
  initialSelectedPurchaseId?: string | null;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  onNewPurchaseClick,
  initialSelectedPurchaseId,
}) => {
  const { business } = useBusiness();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PAID' | 'UNPAID' | 'PARTIAL' | 'RETURNED' | 'VOIDED'>('ALL');

  // Detail Modal
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(initialSelectedPurchaseId || null);

  const loadPurchases = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const data = await purchaseRepository.getPurchases(business.id);
      setPurchases(data);
    } catch (err) {
      console.error('Failed to load purchases', err);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    if (initialSelectedPurchaseId) {
      setSelectedPurchaseId(initialSelectedPurchaseId);
    }
  }, [initialSelectedPurchaseId]);

  const filteredPurchases = purchases.filter((purchase) => {
    const matchesSearch =
      purchase.purchaseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      purchase.supplierNameSnapshot.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'ALL' && purchase.status !== statusFilter) return false;
    return true;
  });

  // Group purchases for mobile (Today, Yesterday, Earlier)
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const todayGroup = filteredPurchases.filter((p) => (p.purchaseDate || p.createdAt).slice(0, 10) === todayStr);
  const yesterdayGroup = filteredPurchases.filter((p) => (p.purchaseDate || p.createdAt).slice(0, 10) === yesterdayStr);
  const earlierGroup = filteredPurchases.filter(
    (p) => (p.purchaseDate || p.createdAt).slice(0, 10) !== todayStr && (p.purchaseDate || p.createdAt).slice(0, 10) !== yesterdayStr
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Purchases & Inward Bills</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Full history of stock-in purchases and vendor payables saved locally.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={onNewPurchaseClick} className="shadow-sm">
          + New Purchase
        </Button>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by bill number or supplier name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {(['ALL', 'PAID', 'PARTIAL', 'UNPAID', 'RETURNED', 'VOIDED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                statusFilter === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All' : st} (
              {st === 'ALL' ? purchases.length : purchases.filter((p) => p.status === st).length})
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading purchases history...</div>
      ) : filteredPurchases.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={searchQuery ? 'No purchase bills found' : 'No purchases recorded yet'}
          description={
            searchQuery
              ? 'Try changing the search keywords or status filter.'
              : 'Record incoming vendor bills to stock up inventory and track payables.'
          }
          actionLabel={searchQuery ? undefined : 'Record First Purchase'}
          onAction={searchQuery ? undefined : onNewPurchaseClick}
          actionIcon={Plus}
        />
      ) : (
        <>
          {/* Mobile Grouped View */}
          <div className="space-y-4 md:hidden">
            {todayGroup.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
                  Today
                </span>
                <div className="space-y-2.5">
                  {todayGroup.map((purchase) => (
                    <PurchaseMobileCard
                      key={purchase.id}
                      purchase={purchase}
                      currencySymbol={business?.currencySymbol}
                      onClick={() => setSelectedPurchaseId(purchase.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {yesterdayGroup.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
                  Yesterday
                </span>
                <div className="space-y-2.5">
                  {yesterdayGroup.map((purchase) => (
                    <PurchaseMobileCard
                      key={purchase.id}
                      purchase={purchase}
                      currencySymbol={business?.currencySymbol}
                      onClick={() => setSelectedPurchaseId(purchase.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {earlierGroup.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2 px-1">
                  Earlier
                </span>
                <div className="space-y-2.5">
                  {earlierGroup.map((purchase) => (
                    <PurchaseMobileCard
                      key={purchase.id}
                      purchase={purchase}
                      currencySymbol={business?.currencySymbol}
                      onClick={() => setSelectedPurchaseId(purchase.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-5">Bill #</th>
                    <th className="py-3.5 px-4">Supplier</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 px-4 text-right">Total Bill</th>
                    <th className="py-3.5 px-4 text-right">Paid</th>
                    <th className="py-3.5 px-4 text-right">Payable Due</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredPurchases.map((purchase) => (
                    <tr
                      key={purchase.id}
                      onClick={() => setSelectedPurchaseId(purchase.id)}
                      className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                        purchase.status === 'VOIDED' ? 'opacity-60 bg-slate-50/40' : ''
                      }`}
                    >
                      <td className="py-3.5 px-5 font-bold font-mono text-slate-900 group-hover:text-amber-800">
                        {purchase.purchaseNumber}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {purchase.supplierNameSnapshot}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {formatDate(purchase.purchaseDate || purchase.createdAt)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-mono">
                        {formatCurrency(purchase.totalAmount, business?.currencySymbol)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-emerald-700 font-mono">
                        {formatCurrency(purchase.paidAmount, business?.currencySymbol)}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono">
                        {purchase.status === 'VOIDED' ? (
                          <span className="text-slate-400 text-xs">Voided</span>
                        ) : purchase.status === 'RETURNED' ? (
                          <span className="text-purple-700 text-xs font-semibold">Returned</span>
                        ) : purchase.dueAmount > 0 ? (
                          <span className="font-bold text-amber-800">
                            {formatCurrency(purchase.dueAmount, business?.currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">0</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <Badge
                          variant={
                            purchase.status === 'VOIDED'
                              ? 'danger'
                              : purchase.status === 'RETURNED'
                              ? 'neutral'
                              : purchase.status === 'PAID'
                              ? 'success'
                              : purchase.status === 'PARTIAL'
                              ? 'warning'
                              : 'danger'
                          }
                          size="sm"
                        >
                          {purchase.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <span className="text-xs font-semibold text-amber-800 group-hover:underline inline-flex items-center gap-1">
                          View <ExternalLink className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Purchase Detail Modal */}
      <PurchaseDetailModal
        isOpen={!!selectedPurchaseId}
        onClose={() => setSelectedPurchaseId(null)}
        purchaseId={selectedPurchaseId}
        onPurchaseUpdated={loadPurchases}
      />
    </div>
  );
};

const PurchaseMobileCard: React.FC<{
  purchase: Purchase;
  currencySymbol?: string;
  onClick: () => void;
}> = ({ purchase, currencySymbol, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`p-4 bg-white rounded-2xl border border-slate-200 shadow-xs active:bg-slate-50 transition-all cursor-pointer space-y-2.5 ${
        purchase.status === 'VOIDED' ? 'opacity-60 bg-slate-50/50' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-mono font-bold text-amber-800 block">
            {purchase.purchaseNumber}
          </span>
          <h4 className="text-sm font-bold text-slate-900 mt-0.5">{purchase.supplierNameSnapshot}</h4>
        </div>
        <div className="text-right">
          <span className="text-base font-bold text-slate-900 font-mono block">
            {formatCurrency(purchase.totalAmount, currencySymbol)}
          </span>
          <Badge
            variant={
              purchase.status === 'VOIDED'
                ? 'danger'
                : purchase.status === 'RETURNED'
                ? 'neutral'
                : purchase.status === 'PAID'
                ? 'success'
                : purchase.status === 'PARTIAL'
                ? 'warning'
                : 'danger'
            }
            size="sm"
            className="mt-1"
          >
            {purchase.status}
          </Badge>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
        <span>{formatDate(purchase.purchaseDate || purchase.createdAt)}</span>
        {purchase.status === 'VOIDED' ? (
          <span className="text-rose-600 font-semibold">Cancelled</span>
        ) : purchase.status === 'RETURNED' ? (
          <span className="text-purple-700 font-semibold">Returned</span>
        ) : purchase.dueAmount > 0 ? (
          <span className="text-amber-800 font-semibold">
            Due: {formatCurrency(purchase.dueAmount, currencySymbol)}
          </span>
        ) : (
          <span className="text-emerald-600 font-medium">Fully Paid</span>
        )}
      </div>
    </div>
  );
};
