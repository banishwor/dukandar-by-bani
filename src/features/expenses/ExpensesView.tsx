import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/ui/EmptyState';
import { NewExpenseModal } from './NewExpenseModal';
import { ExpenseDetailModal } from './ExpenseDetailModal';
import { ReverseExpenseModal } from './ReverseExpenseModal';
import { ExpenseCategoriesModal } from './ExpenseCategoriesModal';
import { expenseService } from '../../services/expenseService';
import { financialAccountService } from '../../services/financialAccountService';
import type {
  ExpenseWithDetails,
  ExpenseCategory,
  FinancialAccountWithBalance,
} from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Receipt,
  Plus,
  Search,
  Tag,
  Filter,
  RotateCcw,
  Eye,
  TrendingDown,
  Calendar,
  Layers,
} from 'lucide-react';

export const ExpensesView: React.FC = () => {
  const { business } = useBusiness();
  const { showError } = useToast();

  const [expenses, setExpenses] = useState<ExpenseWithDetails[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('ALL');

  // Modals
  const [isNewExpenseOpen, setIsNewExpenseOpen] = useState(false);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithDetails | null>(null);
  const [expenseToReverse, setExpenseToReverse] = useState<ExpenseWithDetails | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    try {
      const [exps, cats, accs] = await Promise.all([
        expenseService.getExpenses(business.id),
        expenseService.getCategories(business.id),
        financialAccountService.getAccountsWithBalance(business.id),
      ]);
      setExpenses(exps);
      setCategories(cats);
      setAccounts(accs);
    } catch (err: any) {
      showError(err.message || 'Failed to load expense records');
    } finally {
      setLoading(false);
    }
  }, [business, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!business) return null;

  // Compute metrics
  const activeExpenses = expenses.filter((e) => !e.isReversed);
  const totalExpenseAmount = activeExpenses.reduce((sum, e) => sum + (Number(e.expense.amount) || 0), 0);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayExpenses = activeExpenses.filter((e) => e.expense.expenseDate.startsWith(todayStr));
  const todayAmount = todayExpenses.reduce((sum, e) => sum + (Number(e.expense.amount) || 0), 0);

  const thisMonthPrefix = new Date().toISOString().slice(0, 7);
  const thisMonthExpenses = activeExpenses.filter((e) => e.expense.expenseDate.startsWith(thisMonthPrefix));
  const thisMonthAmount = thisMonthExpenses.reduce((sum, e) => sum + (Number(e.expense.amount) || 0), 0);

  // Filtered list
  const filteredExpenses = expenses.filter((item) => {
    const exp = item.expense;
    const matchesSearch =
      exp.expenseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      exp.categoryNameSnapshot.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (exp.payee && exp.payee.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (exp.notes && exp.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory =
      selectedCategoryFilter === 'ALL' || exp.categoryId === selectedCategoryFilter;

    const matchesAccount =
      selectedAccountFilter === 'ALL' || exp.financialAccountId === selectedAccountFilter;

    return matchesSearch && matchesCategory && matchesAccount;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Receipt className="w-7 h-7 text-rose-600" />
            <span>Business Expenses</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track business operating costs, categorize spending, and maintain an immutable financial ledger.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button variant="secondary" onClick={() => setIsCategoriesModalOpen(true)}>
            <Tag className="w-4 h-4 mr-1.5" />
            Categories
          </Button>
          <Button variant="primary" onClick={() => setIsNewExpenseOpen(true)} className="shadow-xs">
            <Plus className="w-4 h-4 mr-1.5" />
            Record Expense
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Today's Expenses
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-rose-600">
            {formatCurrency(todayAmount)}
          </div>
          <span className="text-[11px] text-slate-400 block">
            {todayExpenses.length} transaction{todayExpenses.length === 1 ? '' : 's'} recorded today
          </span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              This Month's Spending
            </span>
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-900">
            {formatCurrency(thisMonthAmount)}
          </div>
          <span className="text-[11px] text-slate-400 block">
            {thisMonthExpenses.length} transaction{thisMonthExpenses.length === 1 ? '' : 's'} this month
          </span>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Total All-Time Expenses
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-800">
            {formatCurrency(totalExpenseAmount)}
          </div>
          <span className="text-[11px] text-slate-400 block">
            Across {activeExpenses.length} active records
          </span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by #, payee, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="h-11 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs cursor-pointer"
          >
            <option value="ALL">All Categories ({categories.length})</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Account Filter */}
          <select
            value={selectedAccountFilter}
            onChange={(e) => setSelectedAccountFilter(e.target.value)}
            className="h-11 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-xs cursor-pointer"
          >
            <option value="ALL">All Accounts ({accounts.length})</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading expense records...</div>
      ) : filteredExpenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={searchQuery ? 'No expense records found' : 'No expenses recorded yet'}
          description={
            searchQuery
              ? 'Try changing the search keywords, category, or account filter.'
              : 'Record utility bills, shop rent, transport, and other business operating expenses with double-entry ledger audits.'
          }
          actionLabel={searchQuery ? undefined : 'Record First Expense'}
          onAction={searchQuery ? undefined : () => setIsNewExpenseOpen(true)}
          actionIcon={Plus}
        />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Expense #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Payee</th>
                  <th className="py-3 px-4">Account</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredExpenses.map((item) => {
                  const exp = item.expense;
                  return (
                    <tr
                      key={exp.id}
                      onClick={() => setSelectedExpense(item)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-4 font-bold text-slate-900 font-mono whitespace-nowrap">
                        {exp.expenseNumber}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {formatDate(exp.expenseDate)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {exp.categoryNameSnapshot}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {exp.payee || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-4 text-emerald-700 font-medium whitespace-nowrap">
                        {exp.accountNameSnapshot}
                      </td>
                      <td className="py-3 px-4 text-right font-black font-mono text-rose-600 whitespace-nowrap">
                        {formatCurrency(exp.amount)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {item.isReversed ? (
                          <Badge variant="danger" size="sm">
                            Reversed
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            Active
                          </Badge>
                        )}
                      </td>
                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedExpense(item)}
                            className="text-slate-500 hover:text-slate-800"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>

                          {!item.isReversed && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setExpenseToReverse(item)}
                              className="text-rose-600 hover:text-rose-700"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              Reverse
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <NewExpenseModal
        isOpen={isNewExpenseOpen}
        onClose={() => setIsNewExpenseOpen(false)}
        businessId={business.id}
        categories={categories}
        accounts={accounts}
        onExpenseCreated={loadData}
        onManageCategories={() => {
          setIsNewExpenseOpen(false);
          setIsCategoriesModalOpen(true);
        }}
      />

      <ExpenseCategoriesModal
        isOpen={isCategoriesModalOpen}
        onClose={() => setIsCategoriesModalOpen(false)}
        businessId={business.id}
        categories={categories}
        onCategoriesChanged={loadData}
      />

      <ExpenseDetailModal
        isOpen={Boolean(selectedExpense)}
        onClose={() => setSelectedExpense(null)}
        expenseDetails={selectedExpense}
        onReverseClick={(exp) => {
          setExpenseToReverse(exp);
        }}
      />

      <ReverseExpenseModal
        isOpen={Boolean(expenseToReverse)}
        onClose={() => setExpenseToReverse(null)}
        businessId={business.id}
        expenseDetails={expenseToReverse}
        onReversed={loadData}
      />
    </div>
  );
};
