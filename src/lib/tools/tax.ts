export interface TaxBreakdown {
  base: number;
  tax: number;
  total: number;
  rate: number;
}

export const QUICK_RATES = [5, 12, 15, 18, 28];

/** Given a pre-tax amount and rate, add tax. */
export function addTax(base: number, rate: number): TaxBreakdown {
  const tax = (base * rate) / 100;
  return { base, tax, total: base + tax, rate };
}

/** Given a tax-inclusive amount and rate, back out the base and tax. */
export function removeTax(total: number, rate: number): TaxBreakdown {
  const base = total / (1 + rate / 100);
  return { base, tax: total - base, total, rate };
}

export function money(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
