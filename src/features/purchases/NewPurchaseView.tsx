import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { itemRepository } from '../../repositories/itemRepository';
import { supplierRepository } from '../../repositories/supplierRepository';
import { supplierPaymentService } from '../../services/supplierPaymentService';
import { purchaseService } from '../../services/purchaseService';
import { financialAccountService } from '../../services/financialAccountService';
import type { ItemWithStock, Supplier, PaymentMethod, FinancialAccount, DiscountType } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { roundCurrency } from '../../utils/money';
import { discountUtils } from '../../utils/discount';
import { Button } from '../../components/ui/Button';
import { SupplierFormModal } from '../suppliers/SupplierFormModal';
import { useToast } from '../../components/ui/Toast';
import confetti from 'canvas-confetti';
import {
  Truck,
  Search,
  Plus,
  Minus,
  Trash2,
  UserPlus,
  CreditCard,
  Check,
  Receipt,
  Sparkles,
  Package,
  Coins,
  ArrowRight,
  Building2,
  Wallet,
} from 'lucide-react';

interface PurchaseCartLine {
  itemId: string;
  name: string;
  unit: string;
  unitCost: number;
  quantity: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  taxAmount: number;
  currentStock: number;
}

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
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Purchase form state
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [supplierCreditAvailable, setSupplierCreditAvailable] = useState<number>(0);
  const [applySupplierCredit, setApplySupplierCredit] = useState<boolean>(false);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  // Cart
  const [cart, setCart] = useState<PurchaseCartLine[]>([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  // Payment & Totals
  const [overallDiscountType, setOverallDiscountType] = useState<DiscountType>('NONE');
  const [overallDiscountValue, setOverallDiscountValue] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'UNPAID' | 'PARTIAL'>('FULL');
  const [customPaidAmount, setCustomPaidAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [financialAccountId, setFinancialAccountId] = useState<string>('');
  const [purchaseNotes, setPurchaseNotes] = useState('');

  // Processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedPurchaseId, setCompletedPurchaseId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!business) return;
    try {
      setLoadingData(true);
      const [itemsList, suppList, activeAccounts, defaultAcc] = await Promise.all([
        itemRepository.getItemsWithStock(business.id),
        supplierRepository.getSuppliers(business.id),
        financialAccountService.getActiveAccounts(business.id),
        financialAccountService.getDefaultAccount(business.id),
      ]);
      setItems(itemsList);
      setSuppliers(suppList);
      setAccounts(activeAccounts);

      if (defaultAcc) {
        setFinancialAccountId(defaultAcc.id);
      } else if (activeAccounts.length > 0) {
        setFinancialAccountId(activeAccounts[0].id);
      }
    } catch (err) {
      console.error('Failed to load data for purchase', err);
    } finally {
      setLoadingData(false);
    }
  }, [business]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When supplier changes, load advance credit
  useEffect(() => {
    if (selectedSupplierId) {
      supplierPaymentService
        .getSupplierFinancialSummary(selectedSupplierId)
        .then((sum) => {
          setSupplierCreditAvailable(sum.supplierCredit);
          if (sum.supplierCredit > 0) {
            setApplySupplierCredit(true);
          } else {
            setApplySupplierCredit(false);
          }
        })
        .catch(() => {
          setSupplierCreditAvailable(0);
          setApplySupplierCredit(false);
        });
    } else {
      setSupplierCreditAvailable(0);
      setApplySupplierCredit(false);
    }
  }, [selectedSupplierId]);

  // Selected supplier object or Cash Vendor
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const supplierDisplayName = selectedSupplier ? selectedSupplier.name : 'Direct Cash Vendor';

  // Pure Discount Engine Calculations
  const parsedOverallValue = Math.max(0, parseFloat(overallDiscountValue) || 0);
  const transactionCalc = discountUtils.calculateTransactionTotals(
    cart.map((line) => ({
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

  // Cart actions
  const handleAddToCart = (item: ItemWithStock) => {
    setCart((prev) => {
      const existing = prev.find((line) => line.itemId === item.id);
      if (existing) {
        return prev.map((line) =>
          line.itemId === item.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          unit: item.unit,
          unitCost: item.costPrice || item.sellingPrice * 0.7,
          quantity: 1,
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          currentStock: item.currentStock,
        },
      ];
    });
  };

  const handleUpdateQuantity = (itemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveLine(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((line) => {
        if (line.itemId !== itemId) return line;
        const lineNet = discountUtils.calculateLineNet(
          newQty,
          line.unitCost,
          line.discountType,
          line.discountValue,
          line.taxAmount
        );
        return {
          ...line,
          quantity: newQty,
          discountAmount: lineNet.discountAmount,
        };
      })
    );
  };

  const handleUpdateUnitCost = (itemId: string, newCost: number) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.itemId !== itemId) return line;
        const cost = Math.max(0, newCost);
        const lineNet = discountUtils.calculateLineNet(
          line.quantity,
          cost,
          line.discountType,
          line.discountValue,
          line.taxAmount
        );
        return {
          ...line,
          unitCost: cost,
          discountAmount: lineNet.discountAmount,
        };
      })
    );
  };

  const handleUpdateLineDiscount = (
    itemId: string,
    discountType: DiscountType,
    discountValue: number
  ) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.itemId !== itemId) return line;
        const lineNet = discountUtils.calculateLineNet(
          line.quantity,
          line.unitCost,
          discountType,
          discountValue,
          line.taxAmount
        );
        return {
          ...line,
          discountType,
          discountValue,
          discountAmount: lineNet.discountAmount,
        };
      })
    );
  };

  const handleRemoveLine = (itemId: string) => {
    setCart((prev) => prev.filter((line) => line.itemId !== itemId));
  };

  const handleSupplierCreated = (created?: Supplier) => {
    loadData();
    if (created) {
      setSelectedSupplierId(created.id);
    }
  };

  // Complete Purchase
  const handleCompletePurchase = async () => {
    if (!business) return;

    if (cart.length === 0) {
      showError('Please add at least one item to cart before completing purchase.');
      return;
    }

    try {
      setIsSubmitting(true);

      const createdPurchase = await purchaseService.completePurchase(business.id, {
        supplierId: selectedSupplierId || undefined,
        supplierNameSnapshot: supplierDisplayName,
        purchaseDate: new Date().toISOString(),
        lines: cart.map((line) => ({
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
        notes: purchaseNotes.trim() || undefined,
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

      showSuccess(`Purchase Bill #${createdPurchase.purchaseNumber} recorded! Inventory updated.`);
      setCompletedPurchaseId(createdPurchase.id);
    } catch (err: any) {
      console.error('Purchase error', err);
      showError(err.message || 'Unable to record purchase bill.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCatalog = items.filter(
    (item) =>
      item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(itemSearchQuery.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(itemSearchQuery.toLowerCase()))
  );

  // Success view
  if (completedPurchaseId) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto shadow-2xs">
          <Check className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Purchase Stocked!</h2>
          <p className="text-sm text-slate-500 mt-1">
            Transaction saved locally, inventory stock increased via StockMovement ledger, and supplier payables recorded.
          </p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Supplier:</span>
            <span className="font-bold text-slate-900">{supplierDisplayName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Bill Amount:</span>
            <span className="font-bold text-slate-900 font-mono">
              {formatCurrency(grandTotal, business?.currencySymbol)}
            </span>
          </div>
          {creditToApply > 0 && (
            <div className="flex justify-between text-blue-600 font-semibold">
              <span>Advance Credit Applied:</span>
              <span className="font-mono">{formatCurrency(creditToApply, business?.currencySymbol)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Payment Paid Now:</span>
            <span className="font-bold text-emerald-600 font-mono">
              {formatCurrency(directPaidAmount, business?.currencySymbol)}
            </span>
          </div>
          {dueAmount > 0 && (
            <div className="flex justify-between text-amber-800 font-bold">
              <span>Remaining Payable Due:</span>
              <span className="font-mono">{formatCurrency(dueAmount, business?.currencySymbol)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            icon={Receipt}
            onClick={() => onPurchaseCompleted?.(completedPurchaseId)}
            fullWidth
          >
            View Purchase Bill Details
          </Button>

          <Button
            variant="outline"
            size="lg"
            icon={Plus}
            onClick={() => {
              setCompletedPurchaseId(null);
              setCart([]);
              setSelectedSupplierId('');
              setOverallDiscountType('NONE');
              setOverallDiscountValue('');
              setPaymentMode('FULL');
              setCustomPaidAmount('');
              setPurchaseNotes('');
              loadData();
            }}
            fullWidth
          >
            Create Another Purchase Bill
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">New Purchase Bill</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Receive stock-in inventory, set purchase unit costs, and record supplier payables.
          </p>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Supplier & Item Catalog (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Step 1: Supplier Selection */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-amber-700" />
                Supplier / Vendor
              </label>

              <button
                type="button"
                onClick={() => setIsAddSupplierOpen(true)}
                className="text-xs font-semibold text-amber-800 hover:text-amber-900 flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                + Add Supplier
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedSupplierId('')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between ${
                  !selectedSupplierId
                    ? 'bg-amber-50 border-amber-400 text-amber-900 ring-1 ring-amber-400'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div>
                  <span className="font-bold block">Direct Cash Vendor</span>
                  <span className="text-[11px] text-slate-400">Immediate Spot Purchase</span>
                </div>
                {!selectedSupplierId && <Check className="w-4 h-4 text-amber-700" />}
              </button>

              <div className="relative">
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full h-full min-h-[50px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">Select registered supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.phone ? `(${s.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Supplier Credit Notice */}
            {supplierCreditAvailable > 0 && (
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold">Available Supplier Advance: </span>
                    <span className="font-mono font-bold">
                      {formatCurrency(supplierCreditAvailable, business?.currencySymbol)}
                    </span>
                  </div>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-800">
                  <input
                    type="checkbox"
                    checked={applySupplierCredit}
                    onChange={(e) => setApplySupplierCredit(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Apply Advance</span>
                </label>
              </div>
            )}
          </div>

          {/* Step 2: Item Catalog Search & Quick Selector */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-amber-700" />
                Select Items to Stock-In
              </label>
              <span className="text-xs text-slate-400">{items.length} items in catalog</span>
            </div>

            {/* Item Search Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search products to purchase..."
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              />
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {filteredCatalog.map((item) => {
                const inCart = cart.find((l) => l.itemId === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleAddToCart(item)}
                    className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      inCart
                        ? 'bg-amber-50/70 border-amber-300 hover:border-amber-400'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                          {item.name}
                        </span>
                        {inCart && (
                          <span className="bg-amber-700 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                            {inCart.quantity}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {item.category || item.unit}
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold font-mono text-slate-900">
                        Cost: {formatCurrency(item.costPrice || item.sellingPrice * 0.7, business?.currencySymbol)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 font-semibold">
                        {item.currentStock} in stock
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Inward Bill Cart & Totals (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            {/* Cart Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-700" />
                Purchase Items ({cart.length})
              </h3>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                No items added yet. Click on any product on the left to add to bill.
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto divide-y divide-slate-100 pr-1">
                {cart.map((line) => {
                  const lineGross = line.quantity * line.unitCost;
                  const lineNet = Math.max(0, lineGross - (line.discountAmount || 0));

                  return (
                    <div key={line.itemId} className="pt-3 first:pt-0 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{line.name}</span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] text-slate-400">Unit Cost:</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              value={line.unitCost}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                handleUpdateUnitCost(line.itemId, parseFloat(e.target.value) || 0)
                              }
                              className="w-20 h-7 px-1.5 text-xs font-mono font-semibold border border-slate-200 rounded-lg bg-slate-50 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                            />
                            <span className="text-[11px] text-slate-400">/ {line.unit}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold font-mono text-slate-900">
                            {formatCurrency(lineNet, business?.currencySymbol)}
                          </span>
                          {line.discountAmount > 0 && (
                            <span className="text-[10px] text-slate-400 line-through block font-mono">
                              {formatCurrency(lineGross, business?.currencySymbol)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quantity & Actions Bar */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(line.itemId, line.quantity - 1)}
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="1"
                            value={line.quantity}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              handleUpdateQuantity(line.itemId, Math.max(1, parseInt(e.target.value) || 1))
                            }
                            className="w-14 h-8 text-center font-mono font-bold text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                            aria-label="Quantity"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(line.itemId, line.quantity + 1)}
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <span className="text-xs text-slate-500 ml-1 font-medium">{line.unit}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.itemId)}
                          className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Remove item"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Line Discount Selector */}
                      <div className="flex items-center justify-between gap-1.5 pt-1 bg-slate-50/70 p-1.5 rounded-lg border border-slate-100">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 font-medium">Disc:</span>
                          <div className="inline-flex rounded-md border border-slate-200 bg-slate-200/60 p-0.5 text-[10px]">
                            <button
                              type="button"
                              onClick={() => handleUpdateLineDiscount(line.itemId, 'NONE', 0)}
                              className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                                line.discountType === 'NONE' || !line.discountType
                                  ? 'bg-white text-slate-900 shadow-2xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              None
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateLineDiscount(
                                  line.itemId,
                                  'PERCENTAGE',
                                  line.discountValue || 10
                                )
                              }
                              className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                                line.discountType === 'PERCENTAGE'
                                  ? 'bg-amber-700 text-white shadow-2xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              %
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateLineDiscount(
                                  line.itemId,
                                  'FLAT',
                                  line.discountValue || 10
                                )
                              }
                              className={`px-1.5 py-0.5 rounded font-medium cursor-pointer ${
                                line.discountType === 'FLAT'
                                  ? 'bg-amber-700 text-white shadow-2xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              ₹
                            </button>
                          </div>

                          {line.discountType && line.discountType !== 'NONE' && (
                            <input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max={line.discountType === 'PERCENTAGE' ? 100 : undefined}
                              value={line.discountValue || ''}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) =>
                                handleUpdateLineDiscount(
                                  line.itemId,
                                  line.discountType || 'NONE',
                                  Math.max(0, parseFloat(e.target.value) || 0)
                                )
                              }
                              placeholder={line.discountType === 'PERCENTAGE' ? '%' : '₹'}
                              className="w-16 h-6 px-1 text-right text-xs font-mono font-semibold border border-amber-300 rounded bg-white"
                            />
                          )}
                        </div>

                        {line.discountAmount > 0 && (
                          <span className="text-[11px] text-emerald-600 font-semibold font-mono">
                            -{formatCurrency(line.discountAmount, business?.currencySymbol)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Calculations & Discounts */}
            <div className="space-y-1.5 pt-3 border-t border-slate-200 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Gross Items Total</span>
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
              <div className="flex items-center justify-between gap-2 py-1 bg-slate-50/60 p-2 rounded-xl border border-slate-100">
                <span className="text-slate-600 font-medium">Vendor Discount</span>
                <div className="flex items-center gap-1.5">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-200/60 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setOverallDiscountType('NONE');
                        setOverallDiscountValue('');
                      }}
                      className={`px-2 py-0.5 rounded font-medium ${
                        overallDiscountType === 'NONE'
                          ? 'bg-white text-slate-900 shadow-2xs font-bold'
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
                      className={`px-2 py-0.5 rounded font-medium ${
                        overallDiscountType === 'PERCENTAGE'
                          ? 'bg-amber-700 text-white shadow-2xs font-bold'
                          : 'text-slate-600'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOverallDiscountType('FLAT');
                        if (!overallDiscountValue) setOverallDiscountValue('50');
                      }}
                      className={`px-2 py-0.5 rounded font-medium ${
                        overallDiscountType === 'FLAT'
                          ? 'bg-amber-700 text-white shadow-2xs font-bold'
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
                      onChange={(e) => setOverallDiscountValue(e.target.value)}
                      className="w-20 h-7 px-2 rounded-lg border border-amber-300 bg-white text-right text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  )}
                </div>
              </div>

              {transactionCalc.overallDiscountAmount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>
                    Vendor Discount (
                    {overallDiscountType === 'PERCENTAGE'
                      ? `${overallDiscountValue}%`
                      : 'Flat'}
                    )
                  </span>
                  <span className="font-mono">
                    -{formatCurrency(transactionCalc.overallDiscountAmount, business?.currencySymbol)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Bill Amount</span>
                <span className="font-mono text-lg text-amber-800">
                  {formatCurrency(grandTotal, business?.currencySymbol)}
                </span>
              </div>

              {creditToApply > 0 && (
                <div className="flex justify-between text-blue-700 font-semibold pt-1">
                  <span>Advance Credit Applied:</span>
                  <span className="font-mono">-{formatCurrency(creditToApply, business?.currencySymbol)}</span>
                </div>
              )}
            </div>

            {/* Payment Status Controls */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                {creditToApply > 0 ? 'Remaining Outbound Payment' : 'Outbound Payment Status'}
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('FULL')}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    paymentMode === 'FULL'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Pay in Full
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('UNPAID')}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    paymentMode === 'UNPAID'
                      ? 'bg-amber-700 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Credit / Due
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode('PARTIAL');
                    if (!customPaidAmount) setCustomPaidAmount(String(Math.floor(remainingAfterCredit / 2)));
                  }}
                  className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    paymentMode === 'PARTIAL'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Partial
                </button>
              </div>

              {paymentMode === 'PARTIAL' && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-900">Paid Now:</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      max={remainingAfterCredit}
                      placeholder="0.00"
                      value={customPaidAmount}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setCustomPaidAmount(e.target.value)}
                      className="w-28 h-8 px-2 rounded-lg border border-amber-300 bg-white text-right text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                  </div>
                  <div className="flex justify-between text-xs font-bold text-amber-900 pt-1 border-t border-amber-200">
                    <span>Payable Due:</span>
                    <span className="font-mono">{formatCurrency(dueAmount, business?.currencySymbol)}</span>
                  </div>
                </div>
              )}

              {paymentMode !== 'UNPAID' && directPaidAmount > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Payment Mode:</span>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium"
                    >
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI / QR Code</option>
                      <option value="CARD">Debit / Credit Card</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Paid From Account:</span>
                    <select
                      value={financialAccountId}
                      onChange={(e) => setFinancialAccountId(e.target.value)}
                      className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium max-w-[180px] truncate"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} {acc.isDefault ? '(Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Complete Purchase Button */}
            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              disabled={cart.length === 0 || isSubmitting}
              isLoading={isSubmitting}
              icon={Sparkles}
              onClick={handleCompletePurchase}
              className="py-3.5 text-base font-bold shadow-md"
            >
              Record Purchase ({formatCurrency(grandTotal, business?.currencySymbol)})
            </Button>
          </div>
        </div>
      </div>

      {/* Inline Supplier Modal */}
      <SupplierFormModal
        isOpen={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        onSuccess={handleSupplierCreated}
      />
    </div>
  );
};
