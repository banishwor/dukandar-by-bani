import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
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
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Receipt className="w-7 h-7 text-rose-400" />
            <span>Business Expenses</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Track business operating costs, categorize spending, and maintain an immutable financial ledger.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="secondary" onClick={() => setIsCategoriesModalOpen(true)}>
            <Tag className="w-4 h-4 mr-1.5" />
            Categories
          </Button>
          <Button variant="primary" onClick={() => setIsNewExpenseOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Record Expense
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Today's Expenses
          </span>
          <div className="text-2xl font-black text-rose-400">{formatCurrency(todayAmount)}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {todayExpenses.length} transaction{todayExpenses.length === 1 ? '' : 's'} recorded today
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            This Month's Spending
          </span>
          <div className="text-2xl font-black text-white">{formatCurrency(thisMonthAmount)}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {thisMonthExpenses.length} transaction{thisMonthExpenses.length === 1 ? '' : 's'} this month
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 shadow-md">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
            Total All-Time Expenses
          </span>
          <div className="text-2xl font-black text-slate-200">{formatCurrency(totalExpenseAmount)}</div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Across {activeExpenses.length} active records
          </span>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="ALL">All Categories</option>
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
            className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="ALL">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by #, payee, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
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
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {filteredExpenses.map((item) => {
                const exp = item.expense;
                return (
                  <tr
                    key={exp.id}
                    onClick={() => setSelectedExpense(item)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                      {exp.expenseNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {formatDate(exp.expenseDate)}
                    </td>
                    <td className="py-3 px-4 font-medium text-blue-300 whitespace-nowrap">
                      {exp.categoryNameSnapshot}
                    </td>
                    <td className="py-3 px-4 text-slate-200">
                      {exp.payee || <span className="text-slate-500">—</span>}
                    </td>
                    <td className="py-3 px-4 text-emerald-400 font-medium whitespace-nowrap">
                      {exp.accountNameSnapshot}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-rose-400 whitespace-nowrap">
                      {formatCurrency(exp.amount)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {item.isReversed ? (
                        <Badge variant="danger" className="text-[10px]">
                          Reversed
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">
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
                          className="text-slate-400 hover:text-white"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>

                        {!item.isReversed && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setExpenseToReverse(item)}
                            className="text-rose-400 hover:text-rose-300"
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

              {filteredExpenses.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No business expenses match your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
