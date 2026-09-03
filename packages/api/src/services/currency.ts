import { Currency } from "@prisma/client";

/**
 * Planning-grade FX table: USD per one unit of each currency.
 *
 * Deliberately static — deterministic for tests, reports, and offers — and
 * maintained in one place. When rates need to be admin-editable or live,
 * this module is the single seam to replace.
 */
// Indicative FX rates (USD per 1 unit), refreshed 2026-09. CHF pinned to the
// user-verified 1.2356. These are static placeholders until live rates land
// (issue #12); the web mirror in packages/web/src/lib/currency.ts must be
// kept in sync with this table.
export const USD_PER_UNIT: Record<Currency, number> = {
  USD: 1,
  GBP: 1.35,
  EUR: 1.17,
  DKK: 0.157,
  CHF: 1.2356,
  CAD: 0.73,
};

export const CURRENCIES = Object.keys(USD_PER_UNIT) as Currency[];

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as string[]).includes(v);
}

/** Multiplier that converts amounts denominated in `from` into `to`. */
export function fxFactor(from: Currency, to: Currency): number {
  return USD_PER_UNIT[from] / USD_PER_UNIT[to];
}

export function convert(amount: number, from: Currency, to: Currency): number {
  return amount * fxFactor(from, to);
}

/** Scale a nullable Decimal/number rate by an FX factor (null stays null). */
export function scaleRate(rate: unknown, fx: number): number | null {
  return rate == null ? null : Number(rate) * fx;
}
