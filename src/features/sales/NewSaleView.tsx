import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { itemRepository } from '../../repositories/itemRepository';
import { customerRepository } from '../../repositories/customerRepository';
import { paymentService } from '../../services/paymentService';
import { saleService, InsufficientStockError } from '../../services/saleService';
import { financialAccountService } from '../../services/financialAccountService';
import type { ItemWithStock, Customer, PaymentMethod, FinancialAccount, DiscountType, Sale } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { roundCurrency } from '../../utils/money';
import { discountUtils } from '../../utils/discount';
import { Button } from '../../components/ui/Button';
import { CustomerFormModal } from '../customers/CustomerFormModal';
import { useToast } from '../../components/ui/Toast';
import { useSaleDrafts, type SaleCartLine } from './useSaleDrafts';
import { SaleDraftTabs } from './SaleDraftTabs';
import { InlineCustomerSearch } from './InlineCustomerSearch';
import { SpreadsheetInvoiceGrid } from './SpreadsheetInvoiceGrid';
import { sampleDataService } from '../../services/sampleDataService';
import confetti from 'canvas-confetti';
import {
  Check,
  Receipt,
  Sparkles,
  Plus,
  Banknote,
  BookOpen,
  Split,
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface NewSaleViewProps {
  onSaleCompleted?: (saleId: string) => void;
  onCancel?: () => void;
}

export const NewSaleView: React.FC<NewSaleViewProps> = ({
  onSaleCompleted,
  onCancel,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  // Data sources
  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [defaultAccountId, setDefaultAccountId] = useState<string>('');
  const [loadingData, setLoadingData] = useState(true);
  const [isLoadingSampleData, setIsLoadingSampleData] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);

  // Modals
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  // Multi-Draft Hook
  const {
    drafts,
    activeDraft,
    activeDraftId,
    setActiveDraftId,
    updateActiveDraft,
    addNewDraft,
    closeDraft,
    resetCurrentDraft,
  } = useSaleDrafts(defaultAccountId);

  // Processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    try {
      setLoadingData(true);
      const [itemsList, custList, activeAccounts, defaultAcc] = await Promise.all([
        itemRepository.getItemsWithStock(business.id),
        customerRepository.getCustomers(business.id),
        financialAccountService.getActiveAccounts(business.id),
        financialAccountService.getDefaultAccount(business.id),
      ]);
      setItems(itemsList);
      setCustomers(custList);
      setAccounts(activeAccounts);

      if (defaultAcc) {
        setDefaultAccountId(defaultAcc.id);
        if (!activeDraft?.financialAccountId) {
          updateActiveDraft({ financialAccountId: defaultAcc.id });
        }
      } else if (activeAccounts.length > 0 && !activeDraft?.financialAccountId) {
        updateActiveDraft({ financialAccountId: activeAccounts[0].id });
      }
    } catch (err) {
      console.error('Failed to load data for sale', err);
    } finally {
      setLoadingData(false);
    }
  }, [business, activeDraft?.financialAccountId, updateActiveDraft]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Extract active draft values with fallbacks
  const cart = activeDraft?.cart || [];
  const selectedCustomerId = activeDraft?.selectedCustomerId || '';
  const customerCreditAvailable = activeDraft?.customerCreditAvailable || 0;
  const applyCustomerCredit = activeDraft?.applyCustomerCredit || false;
  const overallDiscountType = activeDraft?.overallDiscountType || 'NONE';
  const overallDiscountValue = activeDraft?.overallDiscountValue || '';
  const paymentMode = activeDraft?.paymentMode || 'FULL';
  const customPaidAmount = activeDraft?.customPaidAmount || '';
  const cashTenderAmount = activeDraft?.cashTenderAmount || '';
  const paymentMethod = activeDraft?.paymentMethod || 'CASH';
  const financialAccountId = activeDraft?.financialAccountId || defaultAccountId;
  const saleNotes = activeDraft?.notes || '';

  // Filter valid line items that have an item selected or a quick-added product
  const validCartLines = cart.filter((line) => Boolean(line.itemId || line.isNewItem || line.name?.trim()));

  // When customer changes, load their credit into active draft
  const handleSelectCustomer = useCallback(
    (customerId: string) => {
      if (!customerId) {
        updateActiveDraft({
          selectedCustomerId: '',
          customerCreditAvailable: 0,
          applyCustomerCredit: false,
          paymentMode: 'FULL',
        });
        return;
      }

      paymentService
        .getCustomerFinancialSummary(customerId)
        .then((sum) => {
          updateActiveDraft({
            selectedCustomerId: customerId,
            customerCreditAvailable: sum.customerCredit,
            applyCustomerCredit: sum.customerCredit > 0,
          });
        })
        .catch(() => {
          updateActiveDraft({
            selectedCustomerId: customerId,
            customerCreditAvailable: 0,
            applyCustomerCredit: false,
          });
        });
    },
    [updateActiveDraft]
  );

  // Selected customer object or Walk-in
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const customerDisplayName = selectedCustomer ? selectedCustomer.name : 'Walk-in Customer';

  // Pure Discount Engine Calculations
  const parsedOverallValue = Math.max(0, parseFloat(overallDiscountValue) || 0);
  const transactionCalc = discountUtils.calculateTransactionTotals(
    validCartLines.map((line) => ({
      quantity: line.quantity,
      rateOrCost: line.rate,
      discountType: line.discountType || 'NONE',
      discountValue: line.discountValue || 0,
      discountAmount: line.discountAmount || 0,
      taxAmount: line.taxAmount || 0,
    })),
    overallDiscountType,
    parsedOverallValue,
    0
  );

  const grossItemsSubtotal = transactionCalc.grossSubtotal;
  const totalLineDiscounts = transactionCalc.totalLineDiscounts;
  const subtotal = transactionCalc.subtotal;
  const grandTotal = transactionCalc.finalTotal;

  // Effective credit applied
  const creditToApply =
    applyCustomerCredit && customerCreditAvailable > 0
      ? roundCurrency(Math.min(grandTotal, customerCreditAvailable))
      : 0;

  const remainingAfterCredit = roundCurrency(Math.max(0, grandTotal - creditToApply));

  // Calculated direct paid amount
  let directPaidAmount = remainingAfterCredit;
  if (paymentMode === 'UNPAID') {
    directPaidAmount = 0;
  } else if (paymentMode === 'PARTIAL') {
    const entered = parseFloat(customPaidAmount);
    directPaidAmount = isNaN(entered) ? 0 : Math.min(remainingAfterCredit, Math.max(0, entered));
  }
  directPaidAmount = roundCurrency(directPaidAmount);

  const totalEffectivePaid = roundCurrency(creditToApply + directPaidAmount);
  const dueAmount = roundCurrency(Math.max(0, grandTotal - totalEffectivePaid));

  const handleCustomerCreated = (created?: Customer) => {
    loadData();
    if (created) {
      handleSelectCustomer(created.id);
    }
  };

  const handleLoadSampleData = async () => {
    if (!business) return;
    try {
      setIsLoadingSampleData(true);
      const summary = await sampleDataService.loadSampleData(business.id);
      showSuccess(
        `Loaded ${summary.itemsCount} products, ${summary.customersCount} customers, and sample sales!`
      );
      await loadData();
    } catch (err: any) {
      console.error('Failed to load sample data', err);
      showError(err.message || 'Failed to load sample data');
    } finally {
      setIsLoadingSampleData(false);
    }
  };

  // Complete Sale
  const handleCompleteSale = async () => {
    if (!business) return;

    if (validCartLines.length === 0) {
      showError('Please select at least one item before completing sale.');
      return;
    }

    if (paymentMode !== 'FULL' && !selectedCustomerId) {
      showError('Credit / Khata and Partial sales require selecting a registered customer.');
      customerInputRef.current?.focus();
      return;
    }

    try {
      setIsSubmitting(true);

      // Auto-create any unlisted/new items in inventory database on the fly
      let newItemsCreatedCount = 0;
      const resolvedLines = [];

      for (const line of validCartLines) {
        if (!line.itemId || line.isNewItem) {
          const created = await itemRepository.createItem(business.id, {
            name: line.name.trim(),
            type: 'PRODUCT',
            unit: line.unit || 'pcs',
            sellingPrice: line.rate,
            purchasePrice: 0,
            costPrice: 0,
            openingStock: 0,
            trackInventory: true,
            isActive: true,
          });
          newItemsCreatedCount++;
          resolvedLines.push({
            itemId: created.id,
            itemNameSnapshot: created.name,
            quantity: line.quantity,
            unit: created.unit,
            rate: line.rate,
            discountType: line.discountType || 'NONE',
            discountValue: line.discountValue || 0,
            discountAmount: line.discountAmount || 0,
            taxAmount: line.taxAmount || 0,
            trackInventory: true,
          });
        } else {
          resolvedLines.push({
            itemId: line.itemId,
            itemNameSnapshot: line.name,
            quantity: line.quantity,
            unit: line.unit,
            rate: line.rate,
            discountType: line.discountType || 'NONE',
            discountValue: line.discountValue || 0,
            discountAmount: line.discountAmount || 0,
            taxAmount: line.taxAmount || 0,
            trackInventory: line.trackInventory,
          });
        }
      }

      const createdSale = await saleService.completeSale(business.id, {
        customerId: selectedCustomerId || undefined,
        customerNameSnapshot: customerDisplayName,
        saleDate: new Date().toISOString(),
        lines: resolvedLines,
        subtotal: transactionCalc.subtotal,
        discountType: transactionCalc.overallDiscountType,
        discountValue: transactionCalc.overallDiscountValue,
        discountAmount: transactionCalc.overallDiscountAmount,
        taxAmount: 0,
        totalAmount: grandTotal,
        paidAmount: directPaidAmount,
        applyCustomerCredit: creditToApply,
        paymentMethod,
        financialAccountId: financialAccountId || undefined,
        notes: saleNotes.trim() || undefined,
        allowNegativeStock: business.allowNegativeStock ?? true,
      });

      // Confetti celebration
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // ignore
      }

      const extraMsg =
        newItemsCreatedCount > 0
          ? ` (${newItemsCreatedCount} new product${newItemsCreatedCount > 1 ? 's' : ''} added to inventory)`
          : '';
      showSuccess(`Sale #${createdSale.invoiceNumber} recorded successfully!${extraMsg}`);
      setCompletedSale(createdSale);
      resetCurrentDraft();

      if (newItemsCreatedCount > 0) {
        await loadData();
      }
    } catch (err: any) {
      console.error('Sale error', err);
      if (err instanceof InsufficientStockError) {
        showError(err.message, 'Insufficient Stock');
      } else {
        showError(err.message || 'Unable to complete sale. Your data is safe.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const customerInputRef = useRef<HTMLInputElement | null>(null);

  // Global Keyboard Shortcuts (100% Mouse-Free Invoicing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F4 or Ctrl+Enter: Complete & Save Invoice
      if (e.key === 'F4' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        if (validCartLines.length > 0 && !isSubmitting) {
          handleCompleteSale();
        }
      }
      // F2: Jump to Customer Search
      else if (e.key === 'F2') {
        e.preventDefault();
        customerInputRef.current?.focus();
        customerInputRef.current?.select();
      }
      // F3: Cycle Payment Terms (Cash -> Khata -> Partial)
      else if (e.key === 'F3') {
        e.preventDefault();
        if (!selectedCustomerId) {
          showError('Credit / Khata requires selecting a registered customer (Press F2).');
          customerInputRef.current?.focus();
          return;
        }
        updateActiveDraft({
          paymentMode:
            paymentMode === 'FULL'
              ? 'UNPAID'
              : paymentMode === 'UNPAID'
              ? 'PARTIAL'
              : 'FULL',
        });
      }
      // F8: Add New Draft / Sale Tab
      else if (e.key === 'F8') {
        e.preventDefault();
        addNewDraft();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [validCartLines, isSubmitting, paymentMode, selectedCustomerId, updateActiveDraft, addNewDraft, showError]);

  // Cash Tender & Change Calculations
  const tenderNumber = parseFloat(cashTenderAmount) || 0;
  const changeDue =
    paymentMethod === 'CASH' && paymentMode !== 'UNPAID' && tenderNumber > directPaidAmount
      ? roundCurrency(tenderNumber - directPaidAmount)
      : 0;

  // Generate smart quick-cash tender suggestions
  const getCashTenderPresets = (amount: number) => {
    if (amount <= 0) return [];
    const presets = new Set<number>();
    presets.add(roundCurrency(amount)); // Exact cash

    if (amount < 100) {
      if (amount < 50) presets.add(50);
      presets.add(100);
      presets.add(200);
      presets.add(500);
    } else if (amount < 500) {
      presets.add(Math.ceil(amount / 50) * 50);
      presets.add(Math.ceil(amount / 100) * 100);
      presets.add(500);
      presets.add(1000);
    } else if (amount < 1000) {
      presets.add(Math.ceil(amount / 100) * 100);
      presets.add(1000);
      presets.add(2000);
    } else {
      presets.add(Math.ceil(amount / 500) * 500);
      presets.add(Math.ceil(amount / 1000) * 1000);
      presets.add(Math.ceil(amount / 2000) * 2000);
    }

    return Array.from(presets).filter((v) => v >= amount).slice(0, 4);
  };

  // Success view
  if (completedSale) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
          <Check className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sale Complete!</h2>
          <p className="text-sm text-slate-500 mt-1">
            Invoice #{completedSale.invoiceNumber} created successfully. Stock balances and payment records have been updated.
          </p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Invoice:</span>
            <span className="font-bold text-slate-900 font-mono">#{completedSale.invoiceNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Customer:</span>
            <span className="font-bold text-slate-900">{completedSale.customerNameSnapshot}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Amount:</span>
            <span className="font-bold text-slate-900 font-mono">
              {formatCurrency(completedSale.totalAmount, business?.currencySymbol)}
            </span>
          </div>
          {completedSale.paidAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Direct Payment Received:</span>
              <span className="font-bold text-emerald-600 font-mono">
                {formatCurrency(completedSale.paidAmount, business?.currencySymbol)}
              </span>
            </div>
          )}
          {completedSale.dueAmount > 0 && (
            <div className="flex justify-between text-rose-600 font-bold">
              <span>Remaining Balance Due:</span>
              <span className="font-mono">{formatCurrency(completedSale.dueAmount, business?.currencySymbol)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            icon={Receipt}
            onClick={() => onSaleCompleted?.(completedSale.id)}
            fullWidth
          >
            View Invoice Details
          </Button>

          <Button
            variant="outline"
            size="lg"
            icon={Plus}
            onClick={() => {
              setCompletedSale(null);
              resetCurrentDraft();
              loadData();
            }}
            fullWidth
          >
            Create Another Sale
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 max-w-7xl mx-auto">
      {/* 1. Multi-Draft Tabs Top Bar + Mouse-Free Shortcuts Pill */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex-1">
          <SaleDraftTabs
            drafts={drafts}
            activeDraftId={activeDraftId}
            currencySymbol={business?.currencySymbol}
            onSelectDraft={setActiveDraftId}
            onNewDraft={addNewDraft}
            onCloseDraft={closeDraft}
          />
        </div>

        {/* Mouse-Free Keyboard Shortcuts Indicator Bar */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
          <span className="font-bold text-slate-700 flex items-center gap-1 mr-1">
            ⚡ Keys:
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold text-slate-800 shadow-3xs">F2</kbd> Customer
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold text-slate-800 shadow-3xs">F3</kbd> Cash/Khata
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-emerald-600 text-white px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shadow-3xs">F4</kbd> Checkout
          </span>
        </div>

        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="self-end md:self-center shrink-0">
            Cancel
          </Button>
        )}
      </div>


      {/* 2. Invoice Header Canvas (Customer Search + 1-Click Cash/Credit Switch + Invoice Info) */}
      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Customer Selection with Live Khata Status */}
          <div className="flex-1 min-w-[280px]">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Customer Details <span className="text-[10px] font-normal text-slate-400 font-mono">(Press F2)</span>
            </label>
            <InlineCustomerSearch
              customers={customers}
              customerInputRef={customerInputRef}
              selectedCustomerId={selectedCustomerId}
              customerCreditAvailable={customerCreditAvailable}
              applyCustomerCredit={applyCustomerCredit}
              currencySymbol={business?.currencySymbol}
              onSelectCustomer={handleSelectCustomer}
              onToggleApplyCredit={(apply) => updateActiveDraft({ applyCustomerCredit: apply })}
              onOpenAddCustomerModal={() => setIsAddCustomerOpen(true)}
            />
          </div>

          {/* 1-Click Cash / Credit Segmented Pill */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Payment Terms {!selectedCustomerId && (
                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 ml-1">
                  Walk-in: Cash Only
                </span>
              )}
            </label>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => updateActiveDraft({ paymentMode: 'FULL' })}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  paymentMode === 'FULL'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>Cash / Paid</span>
              </button>
              <button
                type="button"
                disabled={!selectedCustomerId}
                onClick={() => {
                  if (!selectedCustomerId) {
                    showError('Please select a customer first to enable Credit / Khata (Press F2)');
                    customerInputRef.current?.focus();
                    return;
                  }
                  updateActiveDraft({ paymentMode: 'UNPAID' });
                }}
                title={!selectedCustomerId ? 'Select a registered customer first to enable Credit / Khata' : undefined}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
                  !selectedCustomerId
                    ? 'opacity-40 cursor-not-allowed text-slate-400'
                    : paymentMode === 'UNPAID'
                    ? 'bg-amber-600 text-white shadow-2xs cursor-pointer'
                    : 'text-slate-600 hover:text-slate-900 cursor-pointer'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Credit / Khata</span>
              </button>
              <button
                type="button"
                disabled={!selectedCustomerId}
                onClick={() => {
                  if (!selectedCustomerId) {
                    showError('Please select a registered customer first to enable Partial payment (Press F2)');
                    customerInputRef.current?.focus();
                    return;
                  }
                  updateActiveDraft({
                    paymentMode: 'PARTIAL',
                    customPaidAmount: customPaidAmount || String(Math.floor(remainingAfterCredit / 2)),
                  });
                }}
                title={!selectedCustomerId ? 'Select a registered customer first to enable Partial payment' : undefined}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all ${
                  !selectedCustomerId
                    ? 'opacity-40 cursor-not-allowed text-slate-400'
                    : paymentMode === 'PARTIAL'
                    ? 'bg-slate-900 text-white shadow-2xs cursor-pointer'
                    : 'text-slate-600 hover:text-slate-900 cursor-pointer'
                }`}
              >
                <Split className="w-4 h-4" />
                <span>Partial</span>
              </button>
            </div>
          </div>

          {/* Invoice Date */}
          <div className="text-right hidden sm:block">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Invoice Date
            </label>
            <div className="flex items-center justify-end gap-1.5 text-xs font-mono font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{new Date().toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Full-Width Spreadsheet Grid Canvas */}
      <SpreadsheetInvoiceGrid
        cart={cart}
        items={items}
        currencySymbol={business?.currencySymbol}
        enableExpiryTracking={business?.enableExpiryTracking}
        businessId={business?.id}
        onUpdateCart={(newCart) => updateActiveDraft({ cart: newCart })}
        onItemRestocked={(updatedItem) => {
          setItems((prev) =>
            prev.map((it) => (it.id === updatedItem.id ? updatedItem : it))
          );
        }}
      />

      {/* 4. Bottom Settlement & Notes Compact Canvas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Side: Payment Details & Tender (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            {/* Payment Method & Deposit Account (When direct paid amount > 0) */}
            {paymentMode !== 'UNPAID' && directPaidAmount > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Payment Mode
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => updateActiveDraft({ paymentMethod: e.target.value as PaymentMethod })}
                      className="w-full h-8 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-medium cursor-pointer"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI / QR Code</option>
                      <option value="CARD">Debit / Credit Card</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Deposit Account
                    </label>
                    <select
                      value={financialAccountId}
                      onChange={(e) => updateActiveDraft({ financialAccountId: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-medium cursor-pointer"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} {acc.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cash Tender & Live Change Return */}
                {paymentMethod === 'CASH' && (
                  <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700">Cash Received / Tendered:</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-slate-500">{business?.currencySymbol || '₹'}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0"
                          placeholder={String(directPaidAmount)}
                          value={cashTenderAmount}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateActiveDraft({ cashTenderAmount: e.target.value })}
                          className="w-24 h-7 px-2 rounded-lg border border-slate-300 bg-white text-right text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                        />
                      </div>
                    </div>

                    {/* Quick Tender Preset Chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Quick:</span>
                      {getCashTenderPresets(directPaidAmount).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => updateActiveDraft({ cashTenderAmount: String(preset) })}
                          className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold border transition-all cursor-pointer ${
                            tenderNumber === preset
                              ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {preset === directPaidAmount ? 'Exact' : `${business?.currencySymbol || '₹'}${preset}`}
                        </button>
                      ))}
                    </div>

                    {/* Live Change Returned Banner */}
                    {changeDue > 0 && (
                      <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs font-bold text-emerald-800 animate-in fade-in">
                        <span className="flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          Change to Return:
                        </span>
                        <span className="text-sm font-mono text-emerald-900">
                          {formatCurrency(changeDue, business?.currencySymbol)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : paymentMode === 'UNPAID' ? (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Full invoice amount of <strong>{formatCurrency(grandTotal, business?.currencySymbol)}</strong> will be credited to customer&apos;s Khata balance.</span>
              </div>
            ) : null}

            {/* Collapsible / Sleek Notes Section */}
            <div className="pt-1">
              {!isNotesExpanded && !saleNotes ? (
                <button
                  type="button"
                  onClick={() => setIsNotesExpanded(true)}
                  className="text-xs text-slate-500 hover:text-blue-600 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>+ Add Notes / Terms / Delivery instructions</span>
                </button>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-slate-400" />
                      Invoice Notes
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsNotesExpanded(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Hide
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Add terms, remarks, delivery notes, or customer instructions..."
                    value={saleNotes}
                    onChange={(e) => updateActiveDraft({ notes: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 text-xs focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-hidden"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Financial Breakdown & Complete Sale Action (5 cols) */}
          <div className="lg:col-span-5 space-y-3 bg-slate-50/80 p-3.5 sm:p-4 rounded-xl border border-slate-200/80">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Gross Items Subtotal</span>
                <span className="font-mono font-semibold">
                  {formatCurrency(grossItemsSubtotal, business?.currencySymbol)}
                </span>
              </div>

              {totalLineDiscounts > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Item Discounts</span>
                  <span className="font-mono font-semibold">
                    -{formatCurrency(totalLineDiscounts, business?.currencySymbol)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-slate-700 font-medium">
                <span>Subtotal</span>
                <span className="font-mono font-semibold">
                  {formatCurrency(subtotal, business?.currencySymbol)}
                </span>
              </div>

              {/* Overall Discount Controls */}
              <div className="flex items-center justify-between gap-2 py-0.5">
                <span className="text-slate-600 font-medium">Bill Discount</span>
                <div className="flex items-center gap-1">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        updateActiveDraft({
                          overallDiscountType: 'NONE',
                          overallDiscountValue: '',
                        });
                      }}
                      className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                        overallDiscountType === 'NONE'
                          ? 'bg-slate-900 text-white shadow-2xs font-bold'
                          : 'text-slate-600'
                      }`}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateActiveDraft({
                          overallDiscountType: 'PERCENTAGE',
                          overallDiscountValue: overallDiscountValue || '5',
                        });
                      }}
                      className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                        overallDiscountType === 'PERCENTAGE'
                          ? 'bg-blue-600 text-white shadow-2xs font-bold'
                          : 'text-slate-600'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateActiveDraft({
                          overallDiscountType: 'FLAT',
                          overallDiscountValue: overallDiscountValue || '50',
                        });
                      }}
                      className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                        overallDiscountType === 'FLAT'
                          ? 'bg-blue-600 text-white shadow-2xs font-bold'
                          : 'text-slate-600'
                      }`}
                    >
                      ₹
                    </button>
                  </div>

                  {overallDiscountType !== 'NONE' && (
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={overallDiscountType === 'PERCENTAGE' ? 100 : undefined}
                      placeholder="0"
                      value={overallDiscountValue}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateActiveDraft({ overallDiscountValue: e.target.value })}
                      className="w-16 h-6 px-1.5 rounded-md border border-blue-300 bg-white text-right text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  )}
                </div>
              </div>

              {transactionCalc.overallDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>
                    Overall Discount ({overallDiscountType === 'PERCENTAGE' ? `${overallDiscountValue}%` : 'Flat'})
                  </span>
                  <span className="font-mono">
                    -{formatCurrency(transactionCalc.overallDiscountAmount, business?.currencySymbol)}
                  </span>
                </div>
              )}

              {creditToApply > 0 && (
                <div className="flex justify-between text-blue-700 font-semibold">
                  <span>Customer Credit Applied:</span>
                  <span className="font-mono">-{formatCurrency(creditToApply, business?.currencySymbol)}</span>
                </div>
              )}

              {/* Partial Payment Amount breakdown */}
              {paymentMode === 'PARTIAL' && (
                <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 space-y-1 mt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-900">Direct Paid Now:</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      max={remainingAfterCredit}
                      placeholder="0.00"
                      value={customPaidAmount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => updateActiveDraft({ customPaidAmount: e.target.value })}
                      className="w-24 h-6 px-1.5 rounded border border-amber-300 bg-white text-right text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div className="flex justify-between text-xs font-bold text-amber-900 pt-1 border-t border-amber-200">
                    <span>Balance to Khata (Due):</span>
                    <span className="font-mono">{formatCurrency(dueAmount, business?.currencySymbol)}</span>
                  </div>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Bill Amount</span>
                <span className="font-mono text-lg text-blue-600 font-extrabold">
                  {formatCurrency(grandTotal, business?.currencySymbol)}
                </span>
              </div>
            </div>

            {/* Complete Sale Button */}
            <Button
              type="button"
              variant="success"
              size="lg"
              fullWidth
              disabled={validCartLines.length === 0 || isSubmitting}
              isLoading={isSubmitting}
              icon={Sparkles}
              onClick={handleCompleteSale}
              className="py-3 text-sm sm:text-base font-bold shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Complete & Save ({formatCurrency(grandTotal, business?.currencySymbol)})</span>
              <kbd className="hidden sm:inline bg-emerald-700/60 text-white text-[11px] px-1.5 py-0.5 rounded font-mono font-semibold">
                F4
              </kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* Inline Customer Modal */}
      <CustomerFormModal
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onSuccess={handleCustomerCreated}
      />
    </div>
  );
};
