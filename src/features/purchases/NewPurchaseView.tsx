import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { itemRepository } from '../../repositories/itemRepository';
import { supplierRepository } from '../../repositories/supplierRepository';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import { purchaseService } from '../../services/purchaseService';
import { financialAccountService } from '../../services/financialAccountService';
import type {
  ItemWithStock,
  Supplier,
  PaymentMethod,
  FinancialAccountWithBalance,
  DiscountType,
  Purchase,
} from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { roundCurrency } from '../../utils/money';
import { discountUtils } from '../../utils/discount';
import { Button } from '../../components/ui/Button';
import { SupplierFormModal } from '../suppliers/SupplierFormModal';
import { QuickItemCreateModal } from './QuickItemCreateModal';
import { InlineSupplierSearch } from './InlineSupplierSearch';
import { SpreadsheetPurchaseGrid, type PurchaseCartLine } from './SpreadsheetPurchaseGrid';
import { usePurchaseDrafts } from './usePurchaseDrafts';
import { PurchaseDraftTabs } from './PurchaseDraftTabs';
import { useToast } from '../../components/ui/Toast';
import confetti from 'canvas-confetti';
import {
  Truck,
  Check,
  Receipt,
  Plus,
  Banknote,
  BookOpen,
  Split,
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
  Hash,
  AlertTriangle,
} from 'lucide-react';

interface NewPurchaseViewProps {
  onPurchaseCompleted?: (purchaseId: string) => void;
  onCancel?: () => void;
}

export const NewPurchaseView: React.FC<NewPurchaseViewProps> = ({
  onPurchaseCompleted,
  onCancel,
}) => {
  const { business } = useBusiness();
  const { showSuccess, showError } = useToast();

  // Data sources
  const [items, setItems] = useState<ItemWithStock[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccountWithBalance[]>([]);
  const [defaultAccountId, setDefaultAccountId] = useState<string>('');
  const [loadingData, setLoadingData] = useState(true);

  // Multi-Drafts state manager
  const {
    drafts,
    activeDraft,
    activeDraftId,
    setActiveDraftId,
    updateActiveDraft,
    addNewDraft,
    closeDraft,
    resetCurrentDraft,
  } = usePurchaseDrafts(defaultAccountId);

  // Active Draft Projections
  const rawCart = activeDraft?.lines || [];
  const cart: PurchaseCartLine[] = rawCart.length > 0 ? rawCart : [
    {
      itemId: '',
      name: '',
      unit: 'pcs',
      unitCost: 0,
      quantity: 1,
      discountType: 'NONE',
      discountValue: 0,
      discountAmount: 0,
      taxAmount: 0,
      currentStock: 0,
    },
  ];
  const selectedSupplierId = activeDraft?.supplierId || '';
  const billRefNumber = activeDraft?.vendorInvoiceNumber || '';
  const purchaseDate = activeDraft?.vendorInvoiceDate || new Date().toISOString().slice(0, 10);
  const paymentMode = activeDraft?.paymentMode || 'FULL';
  const customPaidAmount = activeDraft?.customPaidAmount || '';
  const paymentMethod = activeDraft?.paymentMethod || 'CASH';
  const financialAccountId = activeDraft?.financialAccountId || defaultAccountId;
  const purchaseNotes = activeDraft?.notes || '';
  const overallDiscountType = activeDraft?.overallDiscountType || 'NONE';
  const overallDiscountValue = activeDraft?.overallDiscountValue || '';

  // Synchronizers
  const setCart = useCallback(
    (setterOrValue: PurchaseCartLine[] | ((prev: PurchaseCartLine[]) => PurchaseCartLine[])) => {
      if (typeof setterOrValue === 'function') {
        const nextLines = setterOrValue(cart);
        updateActiveDraft({ lines: nextLines });
      } else {
        updateActiveDraft({ lines: setterOrValue });
      }
    },
    [cart, updateActiveDraft]
  );

  const setSelectedSupplierId = useCallback(
    (id: string) => updateActiveDraft({ supplierId: id }),
    [updateActiveDraft]
  );
  const setBillRefNumber = useCallback(
    (num: string) => updateActiveDraft({ vendorInvoiceNumber: num }),
    [updateActiveDraft]
  );
  const setPurchaseDate = useCallback(
    (date: string) => updateActiveDraft({ vendorInvoiceDate: date }),
    [updateActiveDraft]
  );
  const setPaymentMode = useCallback(
    (modeOrFn: 'FULL' | 'UNPAID' | 'PARTIAL' | ((prev: 'FULL' | 'UNPAID' | 'PARTIAL') => 'FULL' | 'UNPAID' | 'PARTIAL')) => {
      if (typeof modeOrFn === 'function') {
        const nextMode = modeOrFn(paymentMode);
        updateActiveDraft({ paymentMode: nextMode });
      } else {
        updateActiveDraft({ paymentMode: modeOrFn });
      }
    },
    [paymentMode, updateActiveDraft]
  );
  const setCustomPaidAmount = useCallback(
    (amt: string) => updateActiveDraft({ customPaidAmount: amt }),
    [updateActiveDraft]
  );
  const setPaymentMethod = useCallback(
    (method: PaymentMethod) => updateActiveDraft({ paymentMethod: method }),
    [updateActiveDraft]
  );
  const setFinancialAccountId = useCallback(
    (accId: string) => updateActiveDraft({ financialAccountId: accId }),
    [updateActiveDraft]
  );
  const setPurchaseNotes = useCallback(
    (notes: string) => updateActiveDraft({ notes }),
    [updateActiveDraft]
  );
  const setOverallDiscountType = useCallback(
    (dt: DiscountType) => updateActiveDraft({ overallDiscountType: dt }),
    [updateActiveDraft]
  );
  const setOverallDiscountValue = useCallback(
    (val: string) => updateActiveDraft({ overallDiscountValue: val }),
    [updateActiveDraft]
  );

  // Supplier live balances & remarks state
  const [supplierCreditAvailable, setSupplierCreditAvailable] = useState<number>(0);
  const [supplierOutstandingBalance, setSupplierOutstandingBalance] = useState<number>(0);
  const [applySupplierCredit, setApplySupplierCredit] = useState<boolean>(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState<boolean>(false);

  // Modals
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [isQuickItemModalOpen, setIsQuickItemModalOpen] = useState(false);
  const [quickItemInitialName, setQuickItemInitialName] = useState('');
  const [quickItemRowIndex, setQuickItemRowIndex] = useState<number | null>(null);
  const [quickItemInitialCost, setQuickItemInitialCost] = useState<number>(0);

  // Processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedPurchase, setCompletedPurchase] = useState<Purchase | null>(null);

  const handleOpenCreateItemModal = (queryName: string, rowIndex?: number, initialCost?: number) => {
    setQuickItemInitialName(queryName);
    setQuickItemRowIndex(rowIndex !== undefined ? rowIndex : null);
    setQuickItemInitialCost(initialCost || 0);
    setIsQuickItemModalOpen(true);
  };

  const handleItemCreated = (createdItem: ItemWithStock) => {
    setItems((prev) => [createdItem, ...prev.filter((i) => i.id !== createdItem.id)]);
    if (quickItemRowIndex !== null && cart[quickItemRowIndex]) {
      setCart((prev) => {
        const next = [...prev];
        const line = next[quickItemRowIndex];
        const cost = createdItem.costPrice || createdItem.purchasePrice || (createdItem.sellingPrice * 0.7);
        next[quickItemRowIndex] = {
          ...line,
          itemId: createdItem.id,
          name: createdItem.name,
          unit: createdItem.unit || 'pcs',
          unitCost: cost,
          sellingPrice: createdItem.sellingPrice > 0 ? createdItem.sellingPrice : undefined,
          currentStock: createdItem.currentStock || 0,
        };
        return next;
      });
    }
  };

  const supplierInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    try {
      setLoadingData(true);
      const [itemsList, suppList, activeAccounts, defaultAcc] = await Promise.all([
        itemRepository.getItemsWithStock(business.id),
        supplierRepository.getSuppliers(business.id),
        financialAccountService.getAccountsWithBalance(business.id),
        financialAccountService.getDefaultAccount(business.id),
      ]);
      setItems(itemsList);
      setSuppliers(suppList);
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
      console.error('Failed to load data for purchase', err);
    } finally {
      setLoadingData(false);
    }
  }, [business, activeDraft?.financialAccountId, updateActiveDraft]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When selectedSupplierId changes, update live balance & credit
  useEffect(() => {
    if (!selectedSupplierId) {
      setSupplierCreditAvailable(0);
      setSupplierOutstandingBalance(0);
      setApplySupplierCredit(false);
      return;
    }

    supplierPaymentService
      .getSupplierFinancialSummary(selectedSupplierId)
      .then((sum) => {
        setSupplierCreditAvailable(sum.supplierCredit);
        setSupplierOutstandingBalance(sum.outstandingPayable);
        setApplySupplierCredit(sum.supplierCredit > 0);
      })
      .catch(() => {
        setSupplierCreditAvailable(0);
        setSupplierOutstandingBalance(0);
        setApplySupplierCredit(false);
      });
  }, [selectedSupplierId]);

  const handleSelectSupplier = useCallback(
    (supplierId: string) => {
      setSelectedSupplierId(supplierId);
    },
    [setSelectedSupplierId]
  );

  // Selected supplier object or Cash Vendor
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const supplierDisplayName = selectedSupplier ? selectedSupplier.name : 'Direct Cash Vendor';

  // Valid lines that have an item chosen
  const validCartLines = cart.filter((line) => Boolean(line.itemId && line.itemId.trim()));

  // Pure Discount Engine Calculations
  const parsedOverallValue = Math.max(0, parseFloat(overallDiscountValue) || 0);
  const transactionCalc = discountUtils.calculateTransactionTotals(
    validCartLines.map((line) => ({
      quantity: line.quantity,
      rateOrCost: line.unitCost,
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
    applySupplierCredit && supplierCreditAvailable > 0
      ? roundCurrency(Math.min(grandTotal, supplierCreditAvailable))
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

  // Selected account and Cash Drawer warning computation
  const selectedAccount = accounts.find(
    (a) => a.id === financialAccountId
  ) || accounts.find((a) => a.isDefault) || accounts[0];

  const isCashOverdraw =
    paymentMethod === 'CASH' &&
    selectedAccount?.type === 'CASH' &&
    directPaidAmount > (selectedAccount.currentBalance || 0);

  // Global Keyboard Shortcuts (100% Mouse-Free Invoicing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F4 or Ctrl+Enter: Complete & Save Bill
      if (e.key === 'F4' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        if (validCartLines.length > 0 && !isSubmitting) {
          handleCompletePurchase();
        }
      }
      // F2: Jump to Supplier Search
      else if (e.key === 'F2') {
        e.preventDefault();
        supplierInputRef.current?.focus();
        supplierInputRef.current?.select();
      }
      // F3: Cycle Payment Terms (Cash -> Udhaar -> Partial)
      else if (e.key === 'F3') {
        e.preventDefault();
        setPaymentMode((prev) =>
          prev === 'FULL' ? 'UNPAID' : prev === 'UNPAID' ? 'PARTIAL' : 'FULL'
        );
      }
      // F8: Open New Inward Bill Tab
      else if (e.key === 'F8') {
        e.preventDefault();
        addNewDraft();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [validCartLines, isSubmitting, paymentMode, addNewDraft]);

  // Complete Purchase Bill
  const handleCompletePurchase = async () => {
    if (!business) return;

    if (validCartLines.length === 0) {
      showError('Please add at least one product with valid details before saving.');
      return;
    }

    try {
      setIsSubmitting(true);

      const notesCombined = [
        billRefNumber.trim() ? `Vendor Bill/Challan #${billRefNumber.trim()}` : '',
        purchaseNotes.trim(),
      ]
        .filter(Boolean)
        .join(' — ');

      const createdPurchase = await purchaseService.completePurchase(business.id, {
        supplierId: selectedSupplierId || undefined,
        supplierNameSnapshot: supplierDisplayName,
        purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : new Date().toISOString(),
        lines: validCartLines.map((line) => ({
          itemId: line.itemId,
          itemNameSnapshot: line.name,
          quantity: line.quantity,
          unit: line.unit,
          unitCost: line.unitCost,
          discountType: line.discountType || 'NONE',
          discountValue: line.discountValue || 0,
          discountAmount: line.discountAmount || 0,
          taxAmount: line.taxAmount || 0,
          trackInventory: true,
          batchNumber: line.batchNumber?.trim() || undefined,
          expiryDate: line.expiryDate?.trim() || undefined,
          sellingPrice: line.sellingPrice && line.sellingPrice > 0 ? line.sellingPrice : undefined,
        })),
        subtotal: transactionCalc.subtotal,
        discountType: transactionCalc.overallDiscountType,
        discountValue: transactionCalc.overallDiscountValue,
        discountAmount: transactionCalc.overallDiscountAmount,
        taxAmount: 0,
        totalAmount: grandTotal,
        paidAmount: directPaidAmount,
        applySupplierCredit: creditToApply,
        paymentMethod,
        financialAccountId: financialAccountId || undefined,
        notes: notesCombined || undefined,
      });

      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // ignore
      }

      closeDraft(activeDraftId);
      showSuccess(`Purchase Bill #${createdPurchase.purchaseNumber} recorded! Inventory stock updated.`);
      setCompletedPurchase(createdPurchase);
    } catch (err: any) {
      console.error('Purchase error', err);
      showError(err.message || 'Unable to record purchase bill. Your data is safe.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form to record another bill
  const handleResetForm = () => {
    setCompletedPurchase(null);
    resetCurrentDraft();
    loadData();
  };

  // Success view
  if (completedPurchase) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto shadow-2xs">
          <Check className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Purchase Stocked!</h2>
          <p className="text-sm text-slate-500 mt-1">
            Bill #{completedPurchase.purchaseNumber} recorded successfully. Inventory levels and supplier payables have been updated locally.
          </p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Bill Number:</span>
            <span className="font-bold text-slate-900 font-mono">#{completedPurchase.purchaseNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Supplier / Vendor:</span>
            <span className="font-bold text-slate-900">{completedPurchase.supplierNameSnapshot}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Bill Amount:</span>
            <span className="font-bold text-slate-900 font-mono">
              {formatCurrency(completedPurchase.totalAmount, business?.currencySymbol)}
            </span>
          </div>
          {completedPurchase.paidAmount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Direct Payment Paid:</span>
              <span className="font-bold text-emerald-600 font-mono">
                {formatCurrency(completedPurchase.paidAmount, business?.currencySymbol)}
              </span>
            </div>
          )}
          {completedPurchase.dueAmount > 0 && (
            <div className="flex justify-between text-amber-800 font-bold">
              <span>Added to Supplier Khata:</span>
              <span className="font-mono">{formatCurrency(completedPurchase.dueAmount, business?.currencySymbol)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            icon={Receipt}
            onClick={() => onPurchaseCompleted?.(completedPurchase.id)}
            fullWidth
          >
            View Purchase Bill Details
          </Button>

          <Button
            variant="outline"
            size="lg"
            icon={Plus}
            onClick={handleResetForm}
            fullWidth
          >
            Record Another Purchase Bill
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 max-w-7xl mx-auto">
      {/* 0. Multi-Draft Inward Tabs */}
      <PurchaseDraftTabs
        drafts={drafts}
        activeDraftId={activeDraftId}
        suppliers={suppliers}
        currencySymbol={business?.currencySymbol}
        onSelectDraft={setActiveDraftId}
        onNewDraft={addNewDraft}
        onCloseDraft={closeDraft}
      />

      {/* 1. Header Top Bar + Mouse-Free Shortcuts Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6 text-amber-700" />
            New Purchase Inward Bill
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Receive incoming vendor stock, update purchase costs, and settle payables.
          </p>
        </div>

        {/* Keyboard Shortcuts Indicator Bar */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
          <span className="font-bold text-slate-700 flex items-center gap-1 mr-1">
            ⚡ Keys:
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold text-slate-800 shadow-3xs">F8</kbd> New Tab
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold text-slate-800 shadow-3xs">F2</kbd> Supplier
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-white px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold text-slate-800 shadow-3xs">F3</kbd> Cash/Udhaar
          </span>
          <span className="text-slate-300">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="bg-amber-700 text-white px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shadow-3xs">F4</kbd> Save Bill
          </span>
        </div>

        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} className="self-end md:self-center shrink-0">
            Cancel
          </Button>
        )}
      </div>

      {/* 2. Invoice Header Canvas (Supplier Search + 1-Click Payment Terms + Challan / Date) */}
      <div className="p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Supplier Selection with Live Balance */}
          <div className="md:col-span-6 lg:col-span-5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Supplier / Vendor <span className="text-[10px] font-normal text-slate-400 font-mono">(Press F2)</span>
            </label>
            <InlineSupplierSearch
              suppliers={suppliers}
              supplierInputRef={supplierInputRef}
              selectedSupplierId={selectedSupplierId}
              supplierCreditAvailable={supplierCreditAvailable}
              supplierOutstandingBalance={supplierOutstandingBalance}
              applySupplierCredit={applySupplierCredit}
              currencySymbol={business?.currencySymbol}
              onSelectSupplier={handleSelectSupplier}
              onToggleApplyCredit={(apply) => setApplySupplierCredit(apply)}
              onOpenAddSupplierModal={() => setIsAddSupplierOpen(true)}
            />
          </div>

          {/* 1-Click Cash / Credit Segmented Pill */}
          <div className="md:col-span-6 lg:col-span-4">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
              Payment Terms <span className="text-[10px] font-normal text-slate-400 font-mono">(Press F3)</span>
            </label>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-bold w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setPaymentMode('FULL')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  paymentMode === 'FULL'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Banknote className="w-4 h-4" />
                <span>Paid Now</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMode('UNPAID')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  paymentMode === 'UNPAID'
                    ? 'bg-amber-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Credit (Udhaar)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('PARTIAL');
                  if (!customPaidAmount && remainingAfterCredit > 0) {
                    setCustomPaidAmount(String(Math.floor(remainingAfterCredit / 2)));
                  }
                }}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg transition-all cursor-pointer ${
                  paymentMode === 'PARTIAL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Split className="w-4 h-4" />
                <span>Partial</span>
              </button>
            </div>
          </div>

          {/* Vendor Invoice / Challan Ref # & Date */}
          <div className="md:col-span-12 lg:col-span-3 flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Vendor Bill #
              </label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. INV-981"
                  value={billRefNumber}
                  onChange={(e) => setBillRefNumber(e.target.value)}
                  className="w-full h-10 pl-8 pr-2.5 text-xs font-mono font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="w-32">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Bill Date
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full h-10 px-2 text-xs font-mono font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Full-Width Spreadsheet Grid Canvas */}
      <SpreadsheetPurchaseGrid
        cart={cart}
        items={items}
        currencySymbol={business?.currencySymbol}
        enableExpiryTracking={business?.enableExpiryTracking}
        onUpdateCart={setCart}
        onOpenCreateItemModal={handleOpenCreateItemModal}
      />

      {/* 4. Bottom Settlement & Notes Canvas */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Side: Payment Accounts, Partial Input & Notes (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Outbound Payment Method & Paid From Account (when direct payment > 0) */}
            {paymentMode !== 'UNPAID' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Payment Mode
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    >
                      <option value="CASH">Cash (Cash Drawer)</option>
                      <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                      <option value="UPI">UPI / QR Code</option>
                      <option value="CARD">Debit / Credit Card</option>
                      <option value="CHEQUE">Bank Cheque</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Paid From Account
                    </label>
                    <select
                      value={financialAccountId}
                      onChange={(e) => setFinancialAccountId(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type.replace('_', ' ')})
                          {typeof acc.currentBalance === 'number'
                            ? ` — Bal: ${formatCurrency(acc.currentBalance, business?.currencySymbol)}`
                            : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Cash Drawer Balance Warning */}
                {isCashOverdraw && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 animate-in fade-in">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold">Cash Drawer Balance Notice: </span>
                      Drawer has{' '}
                      <span className="font-mono font-bold">
                        {formatCurrency(selectedAccount?.currentBalance || 0, business?.currencySymbol)}
                      </span>
                      . Paying{' '}
                      <span className="font-mono font-bold">
                        {formatCurrency(directPaidAmount, business?.currencySymbol)}
                      </span>{' '}
                      will leave cash drawer at{' '}
                      <span className="font-mono font-bold text-amber-900">
                        {formatCurrency(
                          (selectedAccount?.currentBalance || 0) - directPaidAmount,
                          business?.currencySymbol
                        )}
                      </span>
                      .
                    </div>
                  </div>
                )}

                {/* Partial Amount Input */}
                {paymentMode === 'PARTIAL' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
                      Immediate Paid Amount ({business?.currencySymbol})
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-slate-400">
                          {business?.currencySymbol}
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max={remainingAfterCredit}
                          value={customPaidAmount}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setCustomPaidAmount(e.target.value)}
                          placeholder="Amount paid now..."
                          className="w-full h-10 pl-8 pr-3 rounded-xl border border-amber-300 bg-white text-slate-900 font-mono font-bold text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                        />
                      </div>
                      <span className="text-xs text-amber-800 font-semibold">
                        Remaining {formatCurrency(dueAmount, business?.currencySymbol)} added to Khata
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  Bill is marked as <strong>Full Credit (Udhaar)</strong>. The entire net total of{' '}
                  <strong className="font-mono">{formatCurrency(grandTotal, business?.currencySymbol)}</strong> will be credited to {supplierDisplayName}'s payable ledger.
                </span>
              </div>
            )}

            {/* Collapsible Notes / Remarks */}
            <div>
              <button
                type="button"
                onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer py-1"
              >
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>{isNotesExpanded ? 'Hide Bill Remarks & Notes' : '+ Add Bill Remarks / Transporter Info'}</span>
                {isNotesExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {isNotesExpanded && (
                <div className="mt-2">
                  <textarea
                    rows={2}
                    value={purchaseNotes}
                    onChange={(e) => setPurchaseNotes(e.target.value)}
                    placeholder="e.g. Received via Delivery Van #14, driver contact 98xxxxxx, 1 item damaged..."
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Side: Totals Breakdown & Save Button (5 cols) */}
          <div className="lg:col-span-5 bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Gross Items Subtotal</span>
                <span className="font-mono font-semibold">
                  {formatCurrency(grossItemsSubtotal, business?.currencySymbol)}
                </span>
              </div>

              {totalLineDiscounts > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Line Item Discounts</span>
                  <span className="font-mono">
                    -{formatCurrency(totalLineDiscounts, business?.currencySymbol)}
                  </span>
                </div>
              )}

              {/* Vendor Overall Discount Controls */}
              <div className="flex items-center justify-between gap-2 py-1 border-t border-slate-200">
                <span className="text-slate-600 font-medium">Overall Trade Discount</span>
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        setOverallDiscountType('NONE');
                        setOverallDiscountValue('');
                      }}
                      className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                        overallDiscountType === 'NONE'
                          ? 'bg-slate-900 text-white font-bold'
                          : 'text-slate-600'
                      }`}
                    >
                      None
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOverallDiscountType('PERCENTAGE');
                        if (!overallDiscountValue) setOverallDiscountValue('5');
                      }}
                      className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                        overallDiscountType === 'PERCENTAGE'
                          ? 'bg-amber-700 text-white font-bold'
                          : 'text-slate-600'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOverallDiscountType('FLAT');
                        if (!overallDiscountValue) setOverallDiscountValue('100');
                      }}
                      className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                        overallDiscountType === 'FLAT'
                          ? 'bg-amber-700 text-white font-bold'
                          : 'text-slate-600'
                      }`}
                    >
                      {business?.currencySymbol || '₹'}
                    </button>
                  </div>

                  {overallDiscountType !== 'NONE' && (
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={overallDiscountType === 'PERCENTAGE' ? 100 : undefined}
                      value={overallDiscountValue}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setOverallDiscountValue(e.target.value)}
                      placeholder="0"
                      className="w-16 h-7 px-1.5 text-right font-mono font-bold text-xs border border-amber-300 rounded-md bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  )}
                </div>
              </div>

              {transactionCalc.overallDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>
                    Vendor Discount ({overallDiscountType === 'PERCENTAGE' ? `${overallDiscountValue}%` : 'Flat'})
                  </span>
                  <span className="font-mono">
                    -{formatCurrency(transactionCalc.overallDiscountAmount, business?.currencySymbol)}
                  </span>
                </div>
              )}

              {/* Grand Total */}
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Grand Bill Total</span>
                <span className="font-mono text-lg text-amber-800">
                  {formatCurrency(grandTotal, business?.currencySymbol)}
                </span>
              </div>

              {/* Advance Credit Applied */}
              {creditToApply > 0 && (
                <div className="flex justify-between text-blue-700 font-semibold pt-1">
                  <span>Advance Credit Applied:</span>
                  <span className="font-mono">
                    -{formatCurrency(creditToApply, business?.currencySymbol)}
                  </span>
                </div>
              )}

              {/* Paid vs Due Split */}
              <div className="pt-2 border-t border-slate-200 space-y-1">
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>Paid Now:</span>
                  <span className="font-mono">
                    {formatCurrency(directPaidAmount, business?.currencySymbol)}
                  </span>
                </div>
                {dueAmount > 0 && (
                  <div className="flex justify-between font-bold text-amber-800">
                    <span>Payable Due (Khata):</span>
                    <span className="font-mono">
                      {formatCurrency(dueAmount, business?.currencySymbol)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Complete Purchase Button */}
            <Button
              variant="primary"
              size="lg"
              icon={Truck}
              onClick={handleCompletePurchase}
              isLoading={isSubmitting}
              disabled={isSubmitting || validCartLines.length === 0}
              fullWidth
              className="bg-amber-700 hover:bg-amber-800 focus:ring-amber-500 shadow-sm cursor-pointer mt-2"
            >
              <span>Save Inward Bill [F4]</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Supplier Creation Modal */}
      {isAddSupplierOpen && (
        <SupplierFormModal
          isOpen={isAddSupplierOpen}
          onClose={() => setIsAddSupplierOpen(false)}
          onSuccess={(newSupplier) => {
            setIsAddSupplierOpen(false);
            loadData();
            if (newSupplier) {
              handleSelectSupplier(newSupplier.id);
            }
          }}
        />
      )}

      {/* Quick Item Creation Modal */}
      {isQuickItemModalOpen && (
        <QuickItemCreateModal
          isOpen={isQuickItemModalOpen}
          initialName={quickItemInitialName}
          initialUnitCost={quickItemInitialCost}
          currencySymbol={business?.currencySymbol}
          onClose={() => setIsQuickItemModalOpen(false)}
          onItemCreated={handleItemCreated}
        />
      )}
    </div>
  );
};
