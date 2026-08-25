import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { customerRepository } from '../../repositories/customerRepository';
import { paymentService } from '../../services/paymentService';
import type { CustomerWithBalance } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerDetailModal } from './CustomerDetailModal';
import { ReceivePaymentModal } from './ReceivePaymentModal';
import { CustomerStatementModal } from './CustomerStatementModal';
import {
  Users,
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
} from 'lucide-react';
import { useToast } from '../../components/ui/Toast';

interface CustomersViewProps {
  onSelectSale?: (saleId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({ onSelectSale }) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  const [customers, setCustomers] = useState<CustomerWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDueOnly, setFilterDueOnly] = useState(false);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerWithBalance | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<CustomerWithBalance | null>(null);
  const [paymentCustomer, setPaymentCustomer] = useState<CustomerWithBalance | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<CustomerWithBalance | null>(null);

  const loadCustomers = useCallback(async () => {
    if (!business) return;
    try {
      setLoading(true);
      const data = await customerRepository.getCustomersWithBalance(business.id);
      setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers', err);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleAddNew = () => {
    setEditingCustomer(null);
    setIsFormOpen(true);
  };

  const handleEdit = (c: CustomerWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingCustomer(c);
    setIsFormOpen(true);
  };

  const handleReceivePayment = (c: CustomerWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setPaymentCustomer(c);
  };

  const handleViewStatement = (c: CustomerWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStatementCustomer(c);
  };

  const handleDelete = async (c: CustomerWithBalance, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (window.confirm(`Are you sure you want to remove customer "${c.name}"?`)) {
      try {
        await customerRepository.softDeleteCustomer(c.id);
        showSuccess(`Removed customer ${c.name}`);
        loadCustomers();
      } catch (err) {
        showError('Failed to remove customer');
      }
    }
  };

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone && c.phone.includes(searchQuery)) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterDueOnly && (c.outstandingBalance || 0) <= 0) return false;
    return true;
  });

  const totalOutstanding = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
  const totalCustomerCredit = customers.reduce((sum, c) => sum + (c.customerCredit || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Customers & Parties</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage customer balances, record payments, allocate to invoices, and generate statements.
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={handleAddNew} className="shadow-sm">
          Add Customer
        </Button>
      </div>

      {/* Summary Widgets */}
      {customers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Customers
              </span>
              <span className="text-2xl font-bold text-slate-900 block mt-1">
                {customers.length}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Outstanding Due
              </span>
              <span
                className={`text-2xl font-bold font-mono block mt-1 ${
                  totalOutstanding > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {formatCurrency(totalOutstanding, business?.currencySymbol)}
              </span>
            </div>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                totalOutstanding > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              <Receipt className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Customer Credit
              </span>
              <span className="text-2xl font-bold font-mono text-blue-600 block mt-1">
                {formatCurrency(totalCustomerCredit, business?.currencySymbol)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search customers by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-2xs"
          />
        </div>

        <button
          onClick={() => setFilterDueOnly(!filterDueOnly)}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${
            filterDueOnly
              ? 'bg-rose-600 text-white shadow-2xs'
              : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <span>With Balance Due Only</span>
          {filterDueOnly && (
            <span className="bg-rose-700 text-white rounded-full px-1.5 py-0.2 text-[10px]">
              {customers.filter((c) => (c.outstandingBalance || 0) > 0).length}
            </span>
          )}
        </button>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading customers...</div>
      ) : filteredCustomers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={searchQuery ? 'No matching customers found' : 'No customers yet'}
          description={
            searchQuery
              ? 'Try checking spelling or clearing filters.'
              : 'Add customers to record sales against their accounts and track balances.'
          }
          actionLabel={searchQuery ? undefined : 'Add First Customer'}
          onAction={searchQuery ? undefined : handleAddNew}
          actionIcon={Plus}
        />
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredCustomers.map((c) => (
              <div
                key={c.id}
                onClick={() => setDetailCustomer(c)}
                className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs active:bg-slate-50 transition-colors cursor-pointer space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
                      {c.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{c.name}</h3>
                      {c.phone && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />
                          {c.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                      Due Balance
                    </span>
                    <span
                      className={`text-sm font-bold font-mono block ${
                        c.outstandingBalance > 0 ? 'text-rose-600' : 'text-slate-800'
                      }`}
                    >
                      {formatCurrency(c.outstandingBalance, business?.currencySymbol)}
                    </span>
                    {(c.customerCredit || 0) > 0 && (
                      <span className="text-[10px] font-mono text-blue-600 font-semibold block">
                        Credit: {formatCurrency(c.customerCredit, business?.currencySymbol)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleReceivePayment(c, e)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] flex items-center gap-1 transition-colors"
                    >
                      <CreditCard className="w-3 h-3" /> Pay
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleViewStatement(c, e)}
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
                    <th className="py-3.5 px-5">Customer Name</th>
                    <th className="py-3.5 px-4">Contact</th>
                    <th className="py-3.5 px-4 text-right">Total Purchases</th>
                    <th className="py-3.5 px-4 text-right">Outstanding Due</th>
                    <th className="py-3.5 px-4 text-right">Customer Credit</th>
                    <th className="py-3.5 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setDetailCustomer(c)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center shrink-0">
                            {c.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block group-hover:text-blue-600 transition-colors">
                              {c.name}
                            </span>
                            {c.notes && <span className="text-xs text-slate-400 block">{c.notes}</span>}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {c.phone ? (
                          <span className="font-medium text-slate-800 block">{c.phone}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {c.email && <span className="text-slate-400 block">{c.email}</span>}
                      </td>

                      <td className="py-3.5 px-4 text-right font-medium text-slate-700 font-mono">
                        {formatCurrency(c.totalSales, business?.currencySymbol)}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`font-bold font-mono text-sm ${
                            c.outstandingBalance > 0 ? 'text-rose-600' : 'text-slate-800'
                          }`}
                        >
                          {formatCurrency(c.outstandingBalance, business?.currencySymbol)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs">
                        {(c.customerCredit || 0) > 0 ? (
                          <span className="font-bold text-blue-600">
                            {formatCurrency(c.customerCredit, business?.currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleReceivePayment(c, e)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center gap-1 transition-colors"
                            title="Receive Payment"
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Pay
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleViewStatement(c, e)}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1 transition-colors"
                            title="Account Statement"
                          >
                            <FileText className="w-3.5 h-3.5" /> Statement
                          </button>
                          <button
                            onClick={(e) => handleEdit(c, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="Edit Customer"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDelete(c, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Remove Customer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Customer Add/Edit Modal */}
      <CustomerFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSuccess={() => loadCustomers()}
        initialCustomer={editingCustomer}
      />

      {/* Customer Details & History Modal */}
      <CustomerDetailModal
        isOpen={!!detailCustomer}
        onClose={() => setDetailCustomer(null)}
        customer={detailCustomer}
        onSelectSale={(id) => {
          setDetailCustomer(null);
          onSelectSale?.(id);
        }}
        onCustomerUpdated={() => loadCustomers()}
      />

      {/* Receive Payment Modal */}
      <ReceivePaymentModal
        isOpen={!!paymentCustomer}
        onClose={() => setPaymentCustomer(null)}
        customer={paymentCustomer}
        currencySymbol={business?.currencySymbol}
        onPaymentReceived={() => loadCustomers()}
      />

      {/* Customer Statement Modal */}
      <CustomerStatementModal
        isOpen={!!statementCustomer}
        onClose={() => setStatementCustomer(null)}
        customer={statementCustomer}
      />
    </div>
  );
};
