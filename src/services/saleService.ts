import { inventoryRepository } from '../repositories/inventoryRepository';
import { itemRepository } from '../repositories/itemRepository';
import { saleRepository } from '../repositories/saleRepository';
import { paymentService } from './paymentService';
import { financialAccountService } from './financialAccountService';
import type {
  CompleteSalePayload,
  Sale,
  SaleLine,
  StockMovement,
  Payment,
  PaymentAllocation,
  FinancialMovement,
  SaleStatus,
} from '../types';
import { generateUniqueId } from '../utils/id';
import { getPersistentDeviceId } from '../utils/deviceId';
import { roundCurrency, subtractCurrency, addCurrency } from '../utils/money';
import { discountUtils } from '../utils/discount';

export class InsufficientStockError extends Error {
  itemName: string;
  available: number;
  requested: number;

  constructor(itemName: string, available: number, requested: number) {
    super(`Not enough stock for ${itemName}. Available: ${available}, Requested: ${requested}`);
    this.name = 'InsufficientStockError';
    this.itemName = itemName;
    this.available = available;
    this.requested = requested;
  }
}

export const saleService = {
  /**
   * Validates and executes a complete sale transaction atomically.
   */
  async completeSale(businessId: string, payload: CompleteSalePayload): Promise<Sale> {
    if (!payload.lines || payload.lines.length === 0) {
      throw new Error('Please add at least one item to complete the sale.');
    }

    for (const line of payload.lines) {
      if (line.quantity <= 0) {
        throw new Error(`Invalid quantity for ${line.itemNameSnapshot || 'item'}. Must be greater than 0.`);
      }
    }

    // Pure discount engine calculation & validation
    const calculated = discountUtils.calculateTransactionTotals(
      payload.lines.map((l) => ({
        quantity: l.quantity,
        rateOrCost: l.rate,
        discountType: l.discountType,
        discountValue: l.discountValue,
        discountAmount: l.discountAmount,
        taxAmount: l.taxAmount,
      })),
      payload.discountType || 'NONE',
      payload.discountValue ?? (payload.discountAmount || 0),
      payload.taxAmount || 0
    );

    const grandTotal = calculated.finalTotal;
    const directPaidAmount = roundCurrency(Math.max(0, Number(payload.paidAmount) || 0));
    const requestedCredit = roundCurrency(Math.max(0, Number(payload.applyCustomerCredit) || 0));

    if (directPaidAmount + requestedCredit > grandTotal + 0.005) {
      throw new Error('Total paid amount (payment + credit) cannot exceed the total bill amount.');
    }

    const deviceId = getPersistentDeviceId();
    const now = new Date().toISOString();

    // 1. Check stock availability for inventory-tracked items
    const stockMap = await inventoryRepository.getAllStockMap(businessId);

    // Accumulate total quantity needed per item in case of duplicate lines
    const requiredQuantities: Record<string, { name: string; qty: number; track: boolean }> = {};
    for (const line of payload.lines) {
      if (!requiredQuantities[line.itemId]) {
        requiredQuantities[line.itemId] = {
          name: line.itemNameSnapshot,
          qty: 0,
          track: line.trackInventory,
        };
      }
      requiredQuantities[line.itemId].qty += line.quantity;
    }

    for (const [itemId, info] of Object.entries(requiredQuantities)) {
      if (info.track) {
        const available = stockMap[itemId] ?? 0;
        if (available < info.qty) {
          throw new InsufficientStockError(info.name, available, info.qty);
        }
      }
    }

    // 2. Generate unique Sale ID and sequential Invoice Number
    const saleId = generateUniqueId('SALE');
    const invoiceNumber = await saleRepository.getNextInvoiceNumber(businessId);

    // 3. Allocations array
    const allocations: PaymentAllocation[] = [];

    // 4. Construct Direct Payment record and Financial Movement if directPaidAmount > 0
    let directPayment: Payment | undefined;
    let directMovement: FinancialMovement | undefined;

    if (directPaidAmount > 0) {
      const account = await financialAccountService.resolveActiveAccount(businessId, payload.financialAccountId);
      const paymentId = generateUniqueId('PAY');
      directPayment = {
        id: paymentId,
        businessId,
        partyType: 'CUSTOMER',
        partyId: payload.customerId,
        referenceType: 'SALE',
        referenceId: saleId,
        amount: directPaidAmount,
        paymentDate: payload.saleDate || now,
        paymentMethod: payload.paymentMethod || 'CASH',
        notes: `Payment for ${invoiceNumber}`,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };

      // Direct payment allocation
      allocations.push({
        id: generateUniqueId('ALLOC'),
        businessId,
        paymentId: paymentId,
        saleId,
        customerId: payload.customerId || '',
        amount: directPaidAmount,
        createdAt: now,
        updatedAt: now,
        createdByDeviceId: deviceId,
        updatedByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      });

      // Direct payment FinancialMovement IN
      directMovement = {
        id: generateUniqueId('MOV'),
        businessId,
        accountId: account.id,
        type: 'CUSTOMER_PAYMENT',
        direction: 'IN',
        amount: directPaidAmount,
        movementDate: payload.saleDate || now,
        referenceType: 'PAYMENT',
        referenceId: paymentId,
        description: `Payment for Invoice #${invoiceNumber} (${payload.paymentMethod || 'CASH'})`,
        createdAt: now,
        createdByDeviceId: deviceId,
        version: 1,
        isDeleted: false,
      };
    }

    // 5. Apply Customer Credit if requested (Credit redemption is purely accounting allocation -> NO new FinancialMovement)
    let totalCreditAllocated = 0;
    if (requestedCredit > 0 && payload.customerId) {
      const unallocatedPayments = await paymentService.findUnallocatedPaymentsForCustomer(payload.customerId);
      let remainingCreditToApply = requestedCredit;

      for (const unalloc of unallocatedPayments) {
        if (remainingCreditToApply <= 0.001) break;
        const applyFromThisPayment = roundCurrency(
          Math.min(remainingCreditToApply, unalloc.unallocatedAmount)
        );

        if (applyFromThisPayment > 0) {
          allocations.push({
            id: generateUniqueId('ALLOC'),
            businessId,
            paymentId: unalloc.payment.id,
            saleId,
            customerId: payload.customerId,
            amount: applyFromThisPayment,
            createdAt: now,
            updatedAt: now,
            createdByDeviceId: deviceId,
            updatedByDeviceId: deviceId,
            version: 1,
            isDeleted: false,
          });

          totalCreditAllocated = roundCurrency(totalCreditAllocated + applyFromThisPayment);
          remainingCreditToApply = roundCurrency(remainingCreditToApply - applyFromThisPayment);
        }
      }
    }

    // 6. Calculate combined effective paid amount and status
    const totalEffectivePaid = roundCurrency(directPaidAmount + totalCreditAllocated);
    const dueAmount = roundCurrency(Math.max(0, grandTotal - totalEffectivePaid));

    let status: SaleStatus = 'UNPAID';
    if (totalEffectivePaid >= grandTotal - 0.005 && grandTotal > 0) {
      status = 'PAID';
    } else if (totalEffectivePaid > 0) {
      status = 'PARTIAL';
    } else if (grandTotal === 0) {
      status = 'PAID';
    }

    const sale: Sale = {
      id: saleId,
      businessId,
      invoiceNumber,
      customerId: payload.customerId,
      customerNameSnapshot: payload.customerNameSnapshot || 'Walk-in Customer',
      saleDate: payload.saleDate || now,
      status,
      subtotal: calculated.subtotal,
      discountType: calculated.overallDiscountType,
      discountValue: calculated.overallDiscountValue,
      discountAmount: calculated.overallDiscountAmount,
      taxAmount: calculated.taxAmount,
      totalAmount: grandTotal,
      paidAmount: totalEffectivePaid,
      dueAmount,
      notes: payload.notes,
      createdAt: now,
      updatedAt: now,
      createdByDeviceId: deviceId,
      updatedByDeviceId: deviceId,
      version: 1,
      isDeleted: false,
    };

    // 7. Construct Sale Lines
    const lines: SaleLine[] = payload.lines.map((line, index) => {
      const calcLine = calculated.lines[index];
      return {
        id: generateUniqueId('LINE'),
        saleId,
        businessId,
        itemId: line.itemId,
        itemNameSnapshot: line.itemNameSnapshot,
        quantity: line.quantity,
        unit: line.unit,
        rate: line.rate,
        discountType: calcLine ? calcLine.discountType : (line.discountType || 'NONE'),
        discountValue: calcLine ? calcLine.discountValue : (line.discountValue || 0),
        discountAmount: calcLine ? calcLine.discountAmount : (line.discountAmount || 0),
        taxAmount: calcLine ? calcLine.taxAmount : (line.taxAmount || 0),
        lineTotal: calcLine ? calcLine.lineTotal : roundCurrency(line.quantity * line.rate - (line.discountAmount || 0)),
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
    });

    // 8. Construct Stock Movements (negative quantity for SALE)
    const stockMovements: StockMovement[] = [];
    for (const line of payload.lines) {
      if (line.trackInventory) {
        stockMovements.push({
          id: generateUniqueId('STK'),
          businessId,
          itemId: line.itemId,
          type: 'SALE',
          quantityChange: -Math.abs(line.quantity), // negative
          reason: `Sale ${invoiceNumber}`,
          referenceId: saleId,
          createdAt: now,
          createdByDeviceId: deviceId,
          version: 1,
        });
      }
    }

    // 9. Execute Atomic Transaction in Dexie
    await saleRepository.executeAtomicSale(sale, lines, stockMovements, directPayment, allocations, directMovement);

    return sale;
  },
};

