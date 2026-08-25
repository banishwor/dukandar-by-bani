/**
 * Financial and Currency calculation utilities
 * Ensures precision and avoids floating point calculation errors (IEEE-754).
 */

/**
 * Rounds a number to 2 decimal places safely.
 */
export function roundCurrency(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Safely adds currency amounts
 */
export function addCurrency(...amounts: number[]): number {
  const sum = amounts.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  return roundCurrency(sum);
}

/**
 * Safely subtracts subtrahends from a minuend (a - b - c)
 */
export function subtractCurrency(minuend: number, ...subtrahends: number[]): number {
  const subTotal = subtrahends.reduce((acc, curr) => acc + (Number(curr) || 0), 0);
  return roundCurrency((Number(minuend) || 0) - subTotal);
}

/**
 * Safe currency comparison: returns true if a is greater than b (considering small float epsilon)
 */
export function isCurrencyGreaterThan(a: number, b: number): boolean {
  return roundCurrency(a) > roundCurrency(b) + 0.001;
}

/**
 * Safe currency comparison: returns true if a and b are equal within cents
 */
export function isCurrencyEqual(a: number, b: number): boolean {
  return Math.abs(roundCurrency(a) - roundCurrency(b)) < 0.005;
}
