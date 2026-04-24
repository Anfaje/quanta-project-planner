import type { Prisma } from "@prisma/client";

/**
 * Financial Calculations
 *
 * Pure, side-effect-free functions. All monetary results are rounded to 2 dp.
 * Prisma Decimal is tolerated alongside plain numbers — every call goes through
 * toNum() which handles both transparently.
 *
 * NOTE: These functions produce the *raw* financial truth. The serialiser
 * (services/financialSerializer.ts) is still responsible for stripping fields
 * before the response leaves the API. These two layers are intentionally split:
 * this module knows the math, the serialiser knows the visibility rules.
 */

type Decimalish = number | Prisma.Decimal | null | undefined;

interface HourEntryInput {
  projectWeek?: number;
  weekStartDate?: Date;
  plannedHours: Decimalish;
  actualHours: Decimalish;
}

interface AssignmentInput {
  billRate: Decimalish;
  costRate: Decimalish;
  entries: HourEntryInput[];
}

// ── Assignment-level totals ──

export interface AssignmentFinancials {
  plannedHours: number;
  actualHours: number;
  plannedFee: number;
  actualFee: number;
  plannedCost: number;
  actualCost: number;
}

export function computeAssignmentFinancials(a: AssignmentInput): AssignmentFinancials {
  const bill = toNum(a.billRate);
  const cost = toNum(a.costRate);

  let plannedHours = 0;
  let actualHours = 0;
  for (const e of a.entries) {
    plannedHours += toNum(e.plannedHours);
    actualHours += toNum(e.actualHours);
  }

  return {
    plannedHours: round2(plannedHours),
    actualHours: round2(actualHours),
    plannedFee: round2(plannedHours * bill),
    actualFee: round2(actualHours * bill),
    plannedCost: round2(plannedHours * cost),
    actualCost: round2(actualHours * cost),
  };
}

// ── Project-level totals ──

export interface ProjectFinancials {
  totalPlannedHours: number;
  totalActualHours: number;
  totalFee: number;           // planned × bill (the quoted fee)
  totalActualFee: number;     // actual × bill (earned to date)
  totalCost: number;          // planned × cost (projected cost)
  totalActualCost: number;    // actual × cost (cost to date)
  contingencyAmt: number;     // totalFee × contingencyPct
  adjustedFee: number;        // totalFee + contingencyAmt
  marginPct: number;          // (totalFee - totalCost) / totalFee × 100
  actualMarginPct: number;    // (actualFee - actualCost) / actualFee × 100
  eacHours: number;           // estimate-at-completion hours: sum(actual ?? planned)
  eacCost: number;            // eac hours at cost rate per assignment
}

export function computeProjectFinancials(
  assignments: AssignmentInput[],
  contingencyPct: Decimalish
): ProjectFinancials {
  let totalPlannedHours = 0;
  let totalActualHours = 0;
  let totalFee = 0;
  let totalActualFee = 0;
  let totalCost = 0;
  let totalActualCost = 0;
  let eacHours = 0;
  let eacCost = 0;

  for (const a of assignments) {
    const bill = toNum(a.billRate);
    const cost = toNum(a.costRate);

    for (const e of a.entries) {
      const p = toNum(e.plannedHours);
      const hasActual = e.actualHours != null;
      const ac = hasActual ? toNum(e.actualHours) : 0;

      totalPlannedHours += p;
      totalActualHours += ac;
      totalFee += p * bill;
      totalActualFee += ac * bill;
      totalCost += p * cost;
      totalActualCost += ac * cost;

      // EAC: use actual if set, else fall back to planned
      const eacEntry = hasActual ? ac : p;
      eacHours += eacEntry;
      eacCost += eacEntry * cost;
    }
  }

  const contPct = toNum(contingencyPct);
  const contingencyAmt = totalFee * contPct;
  const adjustedFee = totalFee + contingencyAmt;
  const marginPct = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : 0;
  const actualMarginPct =
    totalActualFee > 0 ? ((totalActualFee - totalActualCost) / totalActualFee) * 100 : 0;

  return {
    totalPlannedHours: round2(totalPlannedHours),
    totalActualHours: round2(totalActualHours),
    totalFee: round2(totalFee),
    totalActualFee: round2(totalActualFee),
    totalCost: round2(totalCost),
    totalActualCost: round2(totalActualCost),
    contingencyAmt: round2(contingencyAmt),
    adjustedFee: round2(adjustedFee),
    marginPct: round2(marginPct),
    actualMarginPct: round2(actualMarginPct),
    eacHours: round2(eacHours),
    eacCost: round2(eacCost),
  };
}

// ── Burn chart ──

export interface BurnPoint {
  week: number;
  weekStart: string;              // YYYY-MM-DD
  plannedCumulative: number;      // hours
  actualCumulative: number;       // hours
  eacCumulative: number;          // hours (actual ?? planned per entry)
  plannedFeeCumulative?: number;
  actualFeeCumulative?: number;
  plannedCostCumulative?: number;
  actualCostCumulative?: number;
}

/**
 * Compute a cumulative burn series for a project.
 *
 * includeFinancials is typically driven by canViewFinancials at the call site.
 * When false, only hour totals are returned (no fee/cost streams).
 */
export function computeBurn(
  assignments: AssignmentInput[],
  includeFinancials: boolean
): BurnPoint[] {
  // Aggregate per-week across all assignments.
  interface WeekBucket {
    weekStart: Date;
    plannedHours: number;
    actualHours: number;
    eacHours: number;
    plannedFee: number;
    actualFee: number;
    plannedCost: number;
    actualCost: number;
  }

  const buckets = new Map<number, WeekBucket>();

  for (const a of assignments) {
    const bill = toNum(a.billRate);
    const cost = toNum(a.costRate);

    for (const e of a.entries) {
      if (e.projectWeek == null || e.weekStartDate == null) continue;
      let b = buckets.get(e.projectWeek);
      if (!b) {
        b = {
          weekStart: e.weekStartDate,
          plannedHours: 0,
          actualHours: 0,
          eacHours: 0,
          plannedFee: 0,
          actualFee: 0,
          plannedCost: 0,
          actualCost: 0,
        };
        buckets.set(e.projectWeek, b);
      }
      const p = toNum(e.plannedHours);
      const hasActual = e.actualHours != null;
      const ac = hasActual ? toNum(e.actualHours) : 0;
      const eac = hasActual ? ac : p;

      b.plannedHours += p;
      b.actualHours += ac;
      b.eacHours += eac;
      b.plannedFee += p * bill;
      b.actualFee += ac * bill;
      b.plannedCost += p * cost;
      b.actualCost += ac * cost;
    }
  }

  const sorted = [...buckets.entries()].sort(([a], [b]) => a - b);

  let cumP = 0, cumA = 0, cumE = 0;
  let cumPF = 0, cumAF = 0, cumPC = 0, cumAC = 0;
  const result: BurnPoint[] = [];

  for (const [week, b] of sorted) {
    cumP += b.plannedHours;
    cumA += b.actualHours;
    cumE += b.eacHours;
    cumPF += b.plannedFee;
    cumAF += b.actualFee;
    cumPC += b.plannedCost;
    cumAC += b.actualCost;

    const point: BurnPoint = {
      week,
      weekStart: b.weekStart.toISOString().slice(0, 10),
      plannedCumulative: round2(cumP),
      actualCumulative: round2(cumA),
      eacCumulative: round2(cumE),
    };
    if (includeFinancials) {
      point.plannedFeeCumulative = round2(cumPF);
      point.actualFeeCumulative = round2(cumAF);
      point.plannedCostCumulative = round2(cumPC);
      point.actualCostCumulative = round2(cumAC);
    }
    result.push(point);
  }

  return result;
}

// ── Week helpers ──

/**
 * Total weeks between startDate and endDate (inclusive of the end week).
 * Both dates are treated as midnight UTC dates (no time zone ambiguity).
 */
export function countProjectWeeks(startDate: Date, endDate: Date): number {
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const start = toUtcDate(startDate).getTime();
  const end = toUtcDate(endDate).getTime();
  if (end < start) return 0;
  return Math.floor((end - start) / MS_PER_WEEK) + 1;
}

/**
 * Compute the week start date for week N of a project (0-indexed).
 */
export function weekStartDate(projectStart: Date, weekIndex: number): Date {
  const d = toUtcDate(projectStart);
  d.setUTCDate(d.getUTCDate() + weekIndex * 7);
  return d;
}

// ── Internal ──

function toNum(v: Decimalish): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  // Prisma Decimal exposes .toString() and .toNumber(); go via string for safety.
  const s = (v as any).toString?.() ?? String(v);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
