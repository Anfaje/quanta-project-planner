import type { Currency } from "./types";

/**
 * Static FX table mirrored from the API's services/currency.ts (indicative
 * rates, refreshed 2026-09; CHF pinned to the user-verified 1.2356). Keep the
 * two tables in sync — live rates are tracked in issue #12.
 */
export const USD_PER_UNIT: Record<Currency, number> = {
  USD: 1,
  GBP: 1.35,
  EUR: 1.17,
  DKK: 0.157,
  CHF: 1.2356,
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
