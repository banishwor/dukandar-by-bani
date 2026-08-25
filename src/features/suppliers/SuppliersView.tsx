import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { supplierRepository } from '../../repositories/supplierRepository';
import type { SupplierWithBalance } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { SupplierFormModal } from './SupplierFormModal';
import { SupplierDetailModal } from './SupplierDetailModal';
import { PaySupplierModal } from './PaySupplierModal';
import { SupplierStatementModal } from './SupplierStatementModal';
import {
  Truck,
  Plus,
  Search,
  Phone,
  Mail,
  Edit2,
  Trash2,
  Receipt,
  ArrowUpRight,
  CreditCard,
  FileText,
  Sparkles,
  Archive,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';

interface SuppliersViewProps {
  onSelectPurchase?: (purchaseId: string) => void;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({ onSelectPurchase }) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [suppliers, setSuppliers] = useState<SupplierWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDueOnly, setFilterDueOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierWithBalance | null>(null);
  const [detailSupplier, setDetailSupplier] = useState<SupplierWithBalance | null>(null);
  const [paymentSupplier, setPaymentSupplier] = useState<SupplierWithBalance | null>(null);
  const [statementSupplier, setStatementSupplier] = useState<SupplierWithBalance | null>(null);

  const loadSuppliers = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const data = await supplierRepository.getSuppliersWithBalance(business.id, showArchived);
      setSuppliers(data);
    } catch (err) {
      console.error('Failed to load suppliers', err);
    } finally {
      setLoading(false);
    }
  }, [business, showArchived]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const handleAddNew = () => {
    setEditingSupplier(null);
    setIsFormOpen(true);
  };

  const handleEdit = (s: SupplierWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSupplier(s);
    setIsFormOpen(true);
  };

  const handlePaySupplier = (s: SupplierWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPaymentSupplier(s);
  };

  const handleViewStatement = (s: SupplierWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStatementSupplier(s);
  };

  const handleArchive = async (s: SupplierWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (window.confirm(`Are you sure you want to archive supplier "${s.name}"?`)) {
      try {
        await supplierRepository.softDeleteSupplier(s.id);
        showSuccess(`Archived supplier ${s.name}`);
        loadSuppliers();
      } catch (err) {
        showError('Failed to archive supplier');
      }
    }
  };

  const handleRestore = async (s: SupplierWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await supplierRepository.restoreSupplier(s.id);
      showSuccess(`Restored supplier ${s.name}`);
      loadSuppliers();
    } catch (err) {
      showError('Failed to restore supplier');
    }
  };

  const filteredSuppliers = suppliers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.phone && s.phone.includes(searchQuery)) ||
      (s.email && s.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.taxId && s.taxId.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterDueOnly && (s.outstandingPayable || 0) <= 0) return false;
    return true;
  });

  const totalOutstandingPayable = suppliers
    .filter((s) => !s.isDeleted)
    .reduce((sum, s) => sum + (s.outstandingPayable || 0), 0);

  const totalSupplierCredit = suppliers
    .filter((s) => !s.isDeleted)
    .reduce((sum, s) => sum + (s.supplierCredit || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Suppliers & Vendors</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage vendor master data, purchase bills, payables, advance credit, and ledger statements.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={handleAddNew} className="shadow-sm">
          Add Supplier
        </Button>
      </div>

      {/* Summary Widgets */}
      {suppliers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Suppliers
              </span>
              <span className="text-2xl font-bold text-slate-900 block mt-1">
                {suppliers.filter((s) => !s.isDeleted).length}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Payables Due
              </span>
              <span
                className={`text-2xl font-bold font-mono block mt-1 ${
                  totalOutstandingPayable > 0 ? 'text-amber-800' : 'text-slate-900'
                }`}
              >
                {formatCurrency(totalOutstandingPayable, business?.currencySymbol)}
              </span>
            </div>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                totalOutstandingPayable > 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <Receipt className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Supplier Advance Credit
              </span>
              <span className="text-2xl font-bold font-mono text-blue-600 block mt-1">
                {formatCurrency(totalSupplierCredit, business?.currencySymbol)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search suppliers by name, phone, tax ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterDueOnly(!filterDueOnly)}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
              filterDueOnly
                ? 'bg-amber-700 text-white shadow-2xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <span>With Payables Due</span>
            {filterDueOnly && (
              <span className="bg-amber-800 text-white rounded-full px-1.5 py-0.2 text-[10px]">
                {suppliers.filter((s) => (s.outstandingPayable || 0) > 0).length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              showArchived
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
            title="Toggle Archived Suppliers"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archived</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading suppliers...</div>
      ) : filteredSuppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={searchQuery ? 'No matching suppliers found' : 'No suppliers yet'}
          description={
            searchQuery
              ? 'Try checking spelling or clearing filters.'
              : 'Add suppliers to track purchase bills, inventory stock-in, and payables.'
          }
          actionLabel={searchQuery ? undefined : 'Add First Supplier'}
          onAction={searchQuery ? undefined : handleAddNew}
          actionIcon={Plus}
        />
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredSuppliers.map((s) => (
              <div
                key={s.id}
                onClick={() => setDetailSupplier(s)}
                className={`p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs active:bg-slate-50 transition-colors cursor-pointer space-y-3 ${
                  s.isDeleted ? 'opacity-60 bg-slate-50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center font-bold text-sm">
                      {s.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">{s.name}</h3>
                        {s.isDeleted && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold">
                            ARCHIVED
                          </span>
                        )}
                      </div>
                      {s.phone && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {s.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                      Payable Due
                    </span>
                    <span
                      className={`text-sm font-bold font-mono block ${
                        s.outstandingPayable > 0 ? 'text-amber-800' : 'text-slate-800'
                      }`}
                    >
                      {formatCurrency(s.outstandingPayable, business?.currencySymbol)}
                    </span>
                    {(s.supplierCredit || 0) > 0 && (
                      <span className="text-[10px] font-mono text-blue-600 font-semibold block">
                        Credit: {formatCurrency(s.supplierCredit, business?.currencySymbol)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    {!s.isDeleted && (
                      <button
                        type="button"
                        onClick={(e) => handlePaySupplier(s, e)}
                        className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[11px] flex items-center gap-1 transition-colors"
                      >
                        <CreditCard className="w-3 h-3" /> Pay
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleViewStatement(s, e)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] flex items-center gap-1 transition-colors"
                    >
                      <FileText className="w-3 h-3" /> Statement
                    </button>
                  </div>

                  <span className="text-blue-600 font-semibold flex items-center gap-1">
                    Details <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <th className="py-3.5 px-5">Supplier / Vendor</th>
                    <th className="py-3.5 px-4">Contact & Tax ID</th>
                    <th className="py-3.5 px-4 text-right">Total Purchases</th>
                    <th className="py-3.5 px-4 text-right">Payable Due</th>
                    <th className="py-3.5 px-4 text-right">Advance Credit</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredSuppliers.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setDetailSupplier(s)}
                      className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                        s.isDeleted ? 'opacity-60 bg-slate-50/50' : ''
                      }`}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-800 font-bold text-xs flex items-center justify-center shrink-0">
                            {s.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                {s.name}
                              </span>
                              {s.isDeleted && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 font-bold">
                                  ARCHIVED
                                </span>
                              )}
                            </div>
                            {s.paymentTerms && (
                              <span className="text-xs text-slate-400 block font-sans">
                                Terms: {s.paymentTerms}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {s.phone ? (
                          <span className="font-medium text-slate-800 block">{s.phone}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {s.taxId && <span className="text-slate-500 font-mono block">GST: {s.taxId}</span>}
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-slate-700 font-mono">
                        {formatCurrency(s.totalPurchases, business?.currencySymbol)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`font-bold font-mono text-sm ${
                            s.outstandingPayable > 0 ? 'text-amber-800' : 'text-slate-800'
                          }`}
                        >
                          {formatCurrency(s.outstandingPayable, business?.currencySymbol)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        {(s.supplierCredit || 0) > 0 ? (
                          <span className="font-bold text-blue-600">
                            {formatCurrency(s.supplierCredit, business?.currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!s.isDeleted && (
                            <button
                              type="button"
                              onClick={(e) => handlePaySupplier(s, e)}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1 transition-colors"
                              title="Pay Supplier"
                            >
                              <CreditCard className="w-3.5 h-3.5" /> Pay
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleViewStatement(s, e)}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1 transition-colors"
                            title="Account Statement"
                          >
                            <FileText className="w-3.5 h-3.5" /> Statement
                          </button>
                          {!s.isDeleted ? (
                            <>
                              <button
                                onClick={(e) => handleEdit(s, e)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                                title="Edit Supplier"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => handleArchive(s, e)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Archive Supplier"
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={(e) => handleRestore(s, e)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Restore Supplier"
                            >
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Supplier Add/Edit Modal */}
      <SupplierFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => loadSuppliers()}
        initialSupplier={editingSupplier}
      />

      {/* Supplier Details & History Modal */}
      <SupplierDetailModal
        isOpen={!!detailSupplier}
        onClose={() => setDetailSupplier(null)}
        supplier={detailSupplier}
        onSelectPurchase={(id) => {
          setDetailSupplier(null);
          onSelectPurchase?.(id);
        }}
        onSupplierUpdated={() => loadSuppliers()}
      />

      {/* Pay Supplier Modal */}
      {paymentSupplier && (
        <PaySupplierModal
          isOpen={!!paymentSupplier}
          onClose={() => setPaymentSupplier(null)}
          supplier={paymentSupplier}
          onSuccess={() => loadSuppliers()}
        />
      )}

      {/* Supplier Statement Modal */}
      {statementSupplier && (
        <SupplierStatementModal
          isOpen={!!statementSupplier}
          onClose={() => setStatementSupplier(null)}
          supplier={statementSupplier}
        />
      )}
    </div>
  );
};
