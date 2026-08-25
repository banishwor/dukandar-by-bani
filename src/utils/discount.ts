import type { DiscountType } from '../types';
import { roundCurrency, addCurrency, subtractCurrency } from './money';

export class DiscountValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscountValidationError';
  }
}

export interface CalculatedLine {
  grossAmount: number;
  discountType: DiscountType;
  discountValue: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface CalculatedTransaction {
  lines: CalculatedLine[];
  grossSubtotal: number;
  totalLineDiscounts: number;
  subtotal: number;
  overallDiscountType: DiscountType;
  overallDiscountValue: number;
  overallDiscountAmount: number;
  taxAmount: number;
  finalTotal: number;
}

export const discountUtils = {
  /**
   * 1. Gross Line Amount = quantity * unitPrice
   */
  calculateLineGross(quantity: number, unitPrice: number): number {
    const q = Number(quantity);
    const p = Number(unitPrice);
    if (!Number.isFinite(q) || q < 0) throw new DiscountValidationError(`Invalid line quantity: ${quantity}`);
    if (!Number.isFinite(p) || p < 0) throw new DiscountValidationError(`Invalid unit price/cost: ${unitPrice}`);
    return roundCurrency(q * p);
  },

  /**
   * Validates line discount parameters.
   */
  validateLineDiscount(grossAmount: number, discountType: DiscountType = 'NONE', discountValue: number = 0): void {
    const val = Number(discountValue);
    if (!Number.isFinite(val) || val < 0) {
      throw new DiscountValidationError(`Line discount value cannot be negative, NaN, or infinite: ${discountValue}`);
    }

    if (discountType === 'PERCENTAGE') {
      if (val > 100) {
        throw new DiscountValidationError(`Line percentage discount cannot exceed 100%: ${val}%`);
      }
    } else if (discountType === 'FLAT') {
      if (val > grossAmount + 0.005) {
        throw new DiscountValidationError(
          `Line flat discount (₹${val}) cannot exceed the gross line amount (₹${grossAmount}).`
        );
      }
    }
  },

  /**
   * 2. Line Discount Amount & Line Total
   * Calculation Order: Gross -> Line Discount -> Line Net Total
   */
  calculateLineDiscount(
    grossAmount: number,
    discountType: DiscountType = 'NONE',
    discountValue: number = 0
  ): { discountAmount: number; lineTotal: number } {
    const gross = roundCurrency(grossAmount);
    this.validateLineDiscount(gross, discountType, discountValue);

    let discountAmount = 0;
    const val = Number(discountValue) || 0;

    if (discountType === 'PERCENTAGE' && val > 0) {
      discountAmount = roundCurrency((gross * val) / 100);
      discountAmount = Math.min(gross, discountAmount);
    } else if (discountType === 'FLAT' && val > 0) {
      discountAmount = roundCurrency(Math.min(gross, val));
    }

    const lineTotal = roundCurrency(Math.max(0, gross - discountAmount));
    return { discountAmount, lineTotal };
  },

  /**
   * Computes full line calculation.
   * Note: taxAmount is an inert optional placeholder for baseline schema compatibility (defaults to 0).
   * Active business logic contains NO GST/tax layer.
   */
  calculateLineNet(
    quantity: number,
    unitPrice: number,
    discountType: DiscountType = 'NONE',
    discountValue: number = 0,
    taxAmount: number = 0
  ): CalculatedLine {
    const grossAmount = this.calculateLineGross(quantity, unitPrice);
    const { discountAmount, lineTotal } = this.calculateLineDiscount(grossAmount, discountType, discountValue);
    const tax = roundCurrency(Number(taxAmount) || 0);

    return {
      grossAmount,
      discountType,
      discountValue: Number(discountValue) || 0,
      discountAmount,
      taxAmount: tax,
      lineTotal: roundCurrency(lineTotal + tax),
    };
  },

  /**
   * Validates transaction-level overall discount parameters.
   */
  validateTransactionDiscount(subtotal: number, discountType: DiscountType = 'NONE', discountValue: number = 0): void {
    const val = Number(discountValue);
    if (!Number.isFinite(val) || val < 0) {
      throw new DiscountValidationError(
        `Transaction discount value cannot be negative, NaN, or infinite: ${discountValue}`
      );
    }

    if (discountType === 'PERCENTAGE') {
      if (val > 100) {
        throw new DiscountValidationError(`Transaction percentage discount cannot exceed 100%: ${val}%`);
      }
    } else if (discountType === 'FLAT') {
      if (val > subtotal + 0.005) {
        throw new DiscountValidationError(
          `Transaction flat discount (₹${val}) cannot exceed the subtotal (₹${subtotal}).`
        );
      }
    }
  },

  /**
   * 3. Transaction-level Discount Amount
   */
  calculateTransactionDiscount(
    subtotal: number,
    discountType: DiscountType = 'NONE',
    discountValue: number = 0
  ): number {
    const sub = roundCurrency(subtotal);
    this.validateTransactionDiscount(sub, discountType, discountValue);

    let discountAmount = 0;
    const val = Number(discountValue) || 0;

    if (discountType === 'PERCENTAGE' && val > 0) {
      discountAmount = roundCurrency((sub * val) / 100);
      discountAmount = Math.min(sub, discountAmount);
    } else if (discountType === 'FLAT' && val > 0) {
      discountAmount = roundCurrency(Math.min(sub, val));
    }

    return discountAmount;
  },

  /**
   * 4. Complete Transaction Calculation
   *
   * STRICT CALCULATION ORDER (Pure Discount Architecture):
   * 1. Gross line amount (quantity * rateOrCost)
   * 2. Line discount (% or flat on line gross)
   * 3. Line net amount (gross - line discount)
   * 4. Sum line net amounts -> Subtotal
   * 5. Transaction-level discount (% or flat on subtotal)
   * 6. Final transaction total (subtotal - transaction discount)
   *
   * (taxAmount is purely an inert numeric 0 field for base schema compatibility).
   */
  calculateTransactionTotals(
    lines: Array<{
      quantity: number;
      rateOrCost: number;
      discountType?: DiscountType;
      discountValue?: number;
      discountAmount?: number;
      taxAmount?: number;
    }>,
    overallDiscountType: DiscountType = 'NONE',
    overallDiscountValue: number = 0,
    overallTaxAmount: number = 0
  ): CalculatedTransaction {
    let grossSubtotal = 0;
    let totalLineDiscounts = 0;
    let subtotal = 0;

    const calculatedLines: CalculatedLine[] = [];

    for (const l of lines) {
      const lineQty = Number(l.quantity) || 0;
      const lineRate = Number(l.rateOrCost) || 0;
      const gross = this.calculateLineGross(lineQty, lineRate);

      let discType: DiscountType = l.discountType || 'NONE';
      let discVal = Number(l.discountValue) || 0;

      // Backward compatibility: if flat discountAmount was passed without discountType
      if (discType === 'NONE' && (l.discountAmount || 0) > 0) {
        discType = 'FLAT';
        discVal = l.discountAmount!;
      }

      const { discountAmount, lineTotal } = this.calculateLineDiscount(gross, discType, discVal);
      const tax = roundCurrency(Number(l.taxAmount) || 0);

      grossSubtotal = addCurrency(grossSubtotal, gross);
      totalLineDiscounts = addCurrency(totalLineDiscounts, discountAmount);
      subtotal = addCurrency(subtotal, lineTotal);

      calculatedLines.push({
        grossAmount: gross,
        discountType: discType,
        discountValue: discVal,
        discountAmount,
        taxAmount: tax,
        lineTotal: roundCurrency(lineTotal + tax),
      });
    }

    let txDiscType = overallDiscountType;
    let txDiscVal = Number(overallDiscountValue) || 0;

    const overallDiscountAmount = this.calculateTransactionDiscount(subtotal, txDiscType, txDiscVal);
    const tax = roundCurrency(Number(overallTaxAmount) || 0);
    const finalTotal = roundCurrency(Math.max(0, subtotal - overallDiscountAmount + tax));

    return {
      lines: calculatedLines,
      grossSubtotal: roundCurrency(grossSubtotal),
      totalLineDiscounts: roundCurrency(totalLineDiscounts),
      subtotal: roundCurrency(subtotal),
      overallDiscountType: txDiscType,
      overallDiscountValue: txDiscVal,
      overallDiscountAmount,
      taxAmount: tax,
      finalTotal,
    };
  },
};
