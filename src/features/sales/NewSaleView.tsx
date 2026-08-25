import React, { useState, useEffect, useCallback } from 'react';
import { useBusiness } from '../../contexts/BusinessContext';
import { itemRepository } from '../../repositories/itemRepository';
import { customerRepository } from '../../repositories/customerRepository';
import { paymentService } from '../../services/paymentService';
import { saleService, InsufficientStockError } from '../../services/saleService';
import { financialAccountService } from '../../services/financialAccountService';
import type { ItemWithStock, Customer, SaleCartLine, PaymentMethod, FinancialAccount, DiscountType } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { roundCurrency } from '../../utils/money';
import { discountUtils } from '../../utils/discount';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { CustomerFormModal } from '../customers/CustomerFormModal';
import { useToast } from '../../components/ui/Toast';
import confetti from 'canvas-confetti';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  UserPlus,
  CreditCard,
  Check,
  AlertCircle,
  Receipt,
  ArrowRight,
  Sparkles,
  Package,
  X,
  Coins,
  Building2,
  Wallet,
  Percent,
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
  const [loadingData, setLoadingData] = useState(true);

  // Sale form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerCreditAvailable, setCustomerCreditAvailable] = useState<number>(0);
  const [applyCustomerCredit, setApplyCustomerCredit] = useState<boolean>(false);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  // Cart
  const [cart, setCart] = useState<SaleCartLine[]>([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  // Payment & Totals
  const [overallDiscountType, setOverallDiscountType] = useState<DiscountType>('NONE');
  const [overallDiscountValue, setOverallDiscountValue] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'UNPAID' | 'PARTIAL'>('FULL');
  const [customPaidAmount, setCustomPaidAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [financialAccountId, setFinancialAccountId] = useState<string>('');
  const [saleNotes, setSaleNotes] = useState('');

  // Processing state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);

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
        setFinancialAccountId(defaultAcc.id);
      } else if (activeAccounts.length > 0) {
        setFinancialAccountId(activeAccounts[0].id);
      }
    } catch (err) {
      console.error('Failed to load data for sale', err);
    } finally {
      setLoadingData(false);
    }
  }, [business]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When customer changes, load their credit
  useEffect(() => {
    if (selectedCustomerId) {
      paymentService
        .getCustomerFinancialSummary(selectedCustomerId)
        .then((sum) => {
          setCustomerCreditAvailable(sum.customerCredit);
          if (sum.customerCredit > 0) {
            setApplyCustomerCredit(true);
          } else {
            setApplyCustomerCredit(false);
          }
        })
        .catch(() => {
          setCustomerCreditAvailable(0);
          setApplyCustomerCredit(false);
        });
    } else {
      setCustomerCreditAvailable(0);
      setApplyCustomerCredit(false);
    }
  }, [selectedCustomerId]);

  // Selected customer object or Walk-in
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const customerDisplayName = selectedCustomer ? selectedCustomer.name : 'Walk-in Customer';

  // Pure Discount Engine Calculations
  const parsedOverallValue = Math.max(0, parseFloat(overallDiscountValue) || 0);
  const transactionCalc = discountUtils.calculateTransactionTotals(
    cart.map((line) => ({
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
          rate: item.sellingPrice,
          quantity: 1,
          discountType: 'NONE',
          discountValue: 0,
          discountAmount: 0,
          taxAmount: 0,
          trackInventory: item.trackInventory,
          availableStock: item.currentStock,
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
          line.rate,
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
          line.rate,
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

  const handleCustomerCreated = (created?: Customer) => {
    loadData();
    if (created) {
      setSelectedCustomerId(created.id);
    }
  };

  // Complete Sale
  const handleCompleteSale = async () => {
    if (!business) return;

    if (cart.length === 0) {
      showError('Please add at least one item to cart before completing sale.');
      return;
    }

    try {
      setIsSubmitting(true);

      const createdSale = await saleService.completeSale(business.id, {
        customerId: selectedCustomerId || undefined,
        customerNameSnapshot: customerDisplayName,
        saleDate: new Date().toISOString(),
        lines: cart.map((line) => ({
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
        })),
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

      showSuccess(`Sale #${createdSale.invoiceNumber} recorded successfully!`);
      setCompletedSaleId(createdSale.id);
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

  // Filter items for quick item catalog
  const filteredCatalog = items.filter(
    (item) =>
      item.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(itemSearchQuery.toLowerCase())) ||
      (item.category && item.category.toLowerCase().includes(itemSearchQuery.toLowerCase()))
  );

  // Success view
  if (completedSaleId) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
          <Check className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sale Complete!</h2>
          <p className="text-sm text-slate-500 mt-1">
            Transaction saved locally to IndexedDB, stock balances adjusted, and payment allocations recorded.
          </p>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Customer:</span>
            <span className="font-bold text-slate-900">{customerDisplayName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Amount:</span>
            <span className="font-bold text-slate-900 font-mono">
              {formatCurrency(grandTotal, business?.currencySymbol)}
            </span>
          </div>
          {creditToApply > 0 && (
            <div className="flex justify-between text-blue-600 font-semibold">
              <span>Credit Applied:</span>
              <span className="font-mono">{formatCurrency(creditToApply, business?.currencySymbol)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Direct Payment Received:</span>
            <span className="font-bold text-emerald-600 font-mono">
              {formatCurrency(directPaidAmount, business?.currencySymbol)}
            </span>
          </div>
          {dueAmount > 0 && (
            <div className="flex justify-between text-rose-600 font-bold">
              <span>Remaining Balance Due:</span>
              <span className="font-mono">{formatCurrency(dueAmount, business?.currencySymbol)}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            icon={Receipt}
            onClick={() => onSaleCompleted?.(completedSaleId)}
            fullWidth
          >
            View Invoice Details
          </Button>

          <Button
            variant="outline"
            size="lg"
            icon={Plus}
            onClick={() => {
              setCompletedSaleId(null);
              setCart([]);
              setSelectedCustomerId('');
              setOverallDiscountType('NONE');
              setOverallDiscountValue('');
              setPaymentMode('FULL');
              setCustomPaidAmount('');
              setSaleNotes('');
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
    <div className="space-y-6 pb-24 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">New Sale Invoice</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Select items, adjust payment, apply credit, and record sale atomically.
          </p>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Customer & Item Selection (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Step 1: Customer Selection */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                Customer
              </label>

              <button
                type="button"
                onClick={() => setIsAddCustomerOpen(true)}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                + Add Customer
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedCustomerId('')}
                className={`p-3 rounded-xl border text-left text-xs font-medium transition-all flex items-center justify-between ${
                  !selectedCustomerId
                    ? 'bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-400'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div>
                  <span className="font-bold block">Walk-in Customer</span>
                  <span className="text-[11px] text-slate-400">Cash / Direct Sale</span>
                </div>
                {!selectedCustomerId && <Check className="w-4 h-4 text-blue-600" />}
              </button>

              <div className="relative">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full h-full min-h-[50px] px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="">Select registered customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Customer Credit Notice */}
            {customerCreditAvailable > 0 && (
              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <span className="font-bold">Available Credit: </span>
                    <span className="font-mono font-bold">
                      {formatCurrency(customerCreditAvailable, business?.currencySymbol)}
                    </span>
                  </div>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-blue-800">
                  <input
                    type="checkbox"
                    checked={applyCustomerCredit}
                    onChange={(e) => setApplyCustomerCredit(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span>Apply Credit</span>
                </label>
              </div>
            )}
          </div>

          {/* Step 2: Item Catalog Search & Quick Selector */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-blue-600" />
                Select Items to Sell
              </label>
              <span className="text-xs text-slate-400">{items.length} items in catalog</span>
            </div>

            {/* Item Search Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search products or services..."
                value={itemSearchQuery}
                onChange={(e) => setItemSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              />
            </div>

            {/* Items Grid for Fast Tapping */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {filteredCatalog.map((item) => {
                const inCart = cart.find((l) => l.itemId === item.id);
                const isOutOfStock = item.trackInventory && item.currentStock <= 0;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => handleAddToCart(item)}
                    className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isOutOfStock
                        ? 'opacity-40 bg-slate-50 border-slate-200 cursor-not-allowed'
                        : inCart
                        ? 'bg-blue-50/70 border-blue-300 hover:border-blue-400'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight">
                          {item.name}
                        </span>
                        {inCart && (
                          <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
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
                        {formatCurrency(item.sellingPrice, business?.currencySymbol)}
                      </span>
                      {item.trackInventory ? (
                        <span
                          className={`text-[10px] font-mono font-semibold ${
                            item.currentStock <= 0
                              ? 'text-rose-600'
                              : item.isLowStock
                              ? 'text-amber-600'
                              : 'text-slate-500'
                          }`}
                        >
                          {item.currentStock} left
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Service</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Invoice Cart, Totals & Payment (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            {/* Cart Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-600" />
                Cart Items ({cart.length})
              </h3>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                >
                  Clear Cart
                </button>
              )}
            </div>

            {/* Cart Items List */}
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                No items added yet. Click on any item on the left to add to bill.
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto divide-y divide-slate-100 pr-1">
                {cart.map((line) => {
                  const hasStockWarning = line.trackInventory && line.quantity > line.availableStock;
                  const lineGross = line.quantity * line.rate;
                  const lineNet = Math.max(0, lineGross - (line.discountAmount || 0));

                  return (
                    <div key={line.itemId} className="pt-3 first:pt-0 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{line.name}</span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {formatCurrency(line.rate, business?.currencySymbol)} / {line.unit}
                          </span>
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
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={line.quantity}
                            onChange={(e) =>
                              handleUpdateQuantity(line.itemId, Math.max(1, parseInt(e.target.value) || 1))
                            }
                            className="w-12 h-7 text-center font-bold text-xs border border-slate-200 rounded-lg bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(line.itemId, line.quantity + 1)}
                            className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center active:scale-95 transition-all"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs text-slate-500 ml-1">{line.unit}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.itemId)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
                              className={`px-1.5 py-0.5 rounded font-medium ${
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
                              className={`px-1.5 py-0.5 rounded font-medium ${
                                line.discountType === 'PERCENTAGE'
                                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
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
                              className={`px-1.5 py-0.5 rounded font-medium ${
                                line.discountType === 'FLAT'
                                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              ₹
                            </button>
                          </div>

                          {line.discountType && line.discountType !== 'NONE' && (
                            <input
                              type="number"
                              min="0"
                              max={line.discountType === 'PERCENTAGE' ? 100 : undefined}
                              value={line.discountValue || ''}
                              onChange={(e) =>
                                handleUpdateLineDiscount(
                                  line.itemId,
                                  line.discountType || 'NONE',
                                  Math.max(0, parseFloat(e.target.value) || 0)
                                )
                              }
                              placeholder={line.discountType === 'PERCENTAGE' ? '%' : '₹'}
                              className="w-16 h-6 px-1 text-right text-xs font-mono font-semibold border border-blue-300 rounded bg-white"
                            />
                          )}
                        </div>

                        {line.discountAmount > 0 && (
                          <span className="text-[11px] text-emerald-600 font-semibold font-mono">
                            -{formatCurrency(line.discountAmount, business?.currencySymbol)}
                          </span>
                        )}
                      </div>

                      {hasStockWarning && (
                        <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Only {line.availableStock} {line.unit} available in stock!
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 3: Payment Status Controls */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                {creditToApply > 0 ? 'Remaining Payment' : 'Payment Status'}
              </label>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('FULL')}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
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
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    paymentMode === 'UNPAID'
                      ? 'bg-rose-600 text-white shadow-2xs'
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
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    paymentMode === 'PARTIAL'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Partial
                </button>
              </div>

              {paymentMode === 'PARTIAL' && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-amber-900">Direct Paid Now:</span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      max={remainingAfterCredit}
                      placeholder="0.00"
                      value={customPaidAmount}
                      onChange={(e) => setCustomPaidAmount(e.target.value)}
                      className="w-28 h-8 px-2 rounded-lg border border-amber-300 bg-white text-right text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div className="flex justify-between text-xs font-bold text-amber-900 pt-1 border-t border-amber-200">
                    <span>Remaining Due:</span>
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
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI / QR Code</option>
                      <option value="CARD">Debit / Credit Card</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Deposit Account:</span>
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

            {/* Complete Sale Button */}
            <Button
              type="button"
              variant="success"
              size="lg"
              fullWidth
              disabled={cart.length === 0 || isSubmitting}
              isLoading={isSubmitting}
              icon={Sparkles}
              onClick={handleCompleteSale}
              className="py-3.5 text-base font-bold shadow-md"
            >
              Complete Sale ({formatCurrency(grandTotal, business?.currencySymbol)})
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
