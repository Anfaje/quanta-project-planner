import type { Currency } from "./types";

/**
 * Static FX table mirrored from the API's services/currency.ts — the single
 * source of truth for cross-currency conversion until live rates land (#12).
 * Keep the two tables in sync when editing.
 */
export const USD_PER_UNIT: Record<Currency, number> = {
  USD: 1,
  GBP: 1.27,
  EUR: 1.08,
  DKK: 0.145,
  CHF: 1.12,
  CAD: 0.73,
};

export const CURRENCIES = Object.keys(USD_PER_UNIT) as Currency[];

export function convert(amount: number, from: Currency, to: Currency): number {
  if (from === to) return amount;
  return (amount * USD_PER_UNIT[from]) / USD_PER_UNIT[to];
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
