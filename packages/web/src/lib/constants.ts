/**
 * Cross-BU cost markup.
 *
 * When a person is staffed to a project owned by a BU other than their own,
 * their cost to that project is their standing (baseline) rate plus this
 * markup — the agreed inter-BU lending charge. Same-BU work uses the baseline
 * unchanged. The wizard applies and labels this so a PM never adds it twice.
 */
export const CROSS_BU_MARKUP = 0.18;

/** Effective cost: baseline, or baseline + cross-BU markup when BUs differ. */
export function effectiveCost(baseline: number, personBuCode: string, owningBuCode: string): number {
  if (!isCrossBu(personBuCode, owningBuCode)) return baseline;
  return Math.round(baseline * (1 + CROSS_BU_MARKUP) * 100) / 100;
}

/** True when the person's home BU differs from the project's owning BU. */
export function isCrossBu(personBuCode: string, owningBuCode: string): boolean {
  return personBuCode !== "" && owningBuCode !== "" && personBuCode !== owningBuCode;
}

/** Target planned margin (%) — below this a project is at-risk and draft approval warns. */
export const TARGET_MARGIN_PCT = 35;

/** Supported project currencies (mirror of the API enum). */
export const CURRENCIES = ["USD", "GBP", "DKK", "EUR", "CHF", "CAD"] as const;
