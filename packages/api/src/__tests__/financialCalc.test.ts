import { describe, it, expect } from "vitest";
import {
  computeAssignmentFinancials,
  computeProjectFinancials,
  computeBurn,
  countProjectWeeks,
  weekStartDate,
} from "../services/financialCalc";

// ═══════════════════════════════════════════════════════════════
// computeAssignmentFinancials
// ═══════════════════════════════════════════════════════════════

describe("computeAssignmentFinancials", () => {
  it("sums hours and applies rates", () => {
    const result = computeAssignmentFinancials({
      billRate: 200,
      costRate: 100,
      entries: [
        { plannedHours: 40, actualHours: 38 },
        { plannedHours: 40, actualHours: 42 },
        { plannedHours: 40, actualHours: null },
      ],
    });

    expect(result.plannedHours).toBe(120);
    expect(result.actualHours).toBe(80);
    expect(result.plannedFee).toBe(24_000);   // 120 × 200
    expect(result.actualFee).toBe(16_000);    // 80 × 200
    expect(result.plannedCost).toBe(12_000);  // 120 × 100
    expect(result.actualCost).toBe(8_000);    // 80 × 100
  });

  it("treats null hours as zero", () => {
    const result = computeAssignmentFinancials({
      billRate: 100,
      costRate: 50,
      entries: [
        { plannedHours: null, actualHours: null },
        { plannedHours: null, actualHours: 10 },
      ],
    });
    expect(result.plannedHours).toBe(0);
    expect(result.actualHours).toBe(10);
  });

  it("rounds results to two decimal places", () => {
    const result = computeAssignmentFinancials({
      billRate: 195.33,
      costRate: 99.77,
      entries: [{ plannedHours: 37.5, actualHours: 37.5 }],
    });
    expect(result.plannedFee).toBe(7324.88); // 37.5 × 195.33 = 7324.875 → 7324.88
    expect(result.plannedCost).toBe(3741.38); // 37.5 × 99.77 = 3741.375 → 3741.38
  });

  it("handles empty entries gracefully", () => {
    const result = computeAssignmentFinancials({
      billRate: 100,
      costRate: 50,
      entries: [],
    });
    expect(result.plannedHours).toBe(0);
    expect(result.actualFee).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// computeProjectFinancials
// ═══════════════════════════════════════════════════════════════

describe("computeProjectFinancials", () => {
  it("aggregates multiple assignments and applies contingency", () => {
    const result = computeProjectFinancials(
      [
        {
          billRate: 200,
          costRate: 100,
          entries: [
            { plannedHours: 40, actualHours: 40 },
            { plannedHours: 40, actualHours: null },
          ],
        },
        {
          billRate: 150,
          costRate: 75,
          entries: [
            { plannedHours: 20, actualHours: 18 },
          ],
        },
      ],
      0.15
    );

    expect(result.totalPlannedHours).toBe(100);       // 40+40+20
    expect(result.totalActualHours).toBe(58);         // 40+18
    expect(result.totalFee).toBe(19_000);             // 80×200 + 20×150
    expect(result.totalActualFee).toBe(10_700);       // 40×200 + 18×150
    expect(result.totalCost).toBe(9_500);             // 80×100 + 20×75
    expect(result.totalActualCost).toBe(5_350);       // 40×100 + 18×75
    expect(result.contingencyAmt).toBe(2_850);        // 19000 × 0.15
    expect(result.adjustedFee).toBe(21_850);          // 19000 + 2850
    expect(result.marginPct).toBe(50);                // (19000-9500)/19000 = 50%
    expect(result.actualMarginPct).toBe(50);          // (10700-5350)/10700 = 50%
  });

  it("EAC uses actuals where available, planned otherwise", () => {
    const result = computeProjectFinancials(
      [
        {
          billRate: 100,
          costRate: 50,
          entries: [
            { plannedHours: 40, actualHours: 45 },      // exceeded: use 45
            { plannedHours: 40, actualHours: null },    // future: use 40
            { plannedHours: 40, actualHours: 35 },      // underrun: use 35
          ],
        },
      ],
      0
    );
    expect(result.eacHours).toBe(120);   // 45 + 40 + 35
    expect(result.eacCost).toBe(6_000);  // 120 × 50
  });

  it("zero fee project has zero margin (no divide-by-zero)", () => {
    const result = computeProjectFinancials(
      [{ billRate: 0, costRate: 0, entries: [{ plannedHours: 40, actualHours: 40 }] }],
      0.15
    );
    expect(result.marginPct).toBe(0);
    expect(result.actualMarginPct).toBe(0);
    expect(result.contingencyAmt).toBe(0);
  });

  it("respects contingency of 0", () => {
    const result = computeProjectFinancials(
      [{ billRate: 100, costRate: 50, entries: [{ plannedHours: 10, actualHours: 10 }] }],
      0
    );
    expect(result.contingencyAmt).toBe(0);
    expect(result.adjustedFee).toBe(1_000);
  });

  it("handles project with no actuals yet", () => {
    const result = computeProjectFinancials(
      [{ billRate: 200, costRate: 100, entries: [{ plannedHours: 40, actualHours: null }] }],
      0.15
    );
    expect(result.totalActualHours).toBe(0);
    expect(result.totalActualFee).toBe(0);
    expect(result.actualMarginPct).toBe(0);
    expect(result.eacHours).toBe(40); // falls back to planned
  });
});

// ═══════════════════════════════════════════════════════════════
// computeBurn
// ═══════════════════════════════════════════════════════════════

describe("computeBurn", () => {
  const makeEntry = (week: number, planned: number | null, actual: number | null) => ({
    projectWeek: week,
    weekStartDate: new Date(Date.UTC(2026, 1, 3 + week * 7)),
    plannedHours: planned,
    actualHours: actual,
  });

  it("produces cumulative hour series sorted by week", () => {
    const points = computeBurn(
      [
        {
          billRate: 100,
          costRate: 50,
          entries: [
            makeEntry(0, 40, 40),
            makeEntry(1, 40, 38),
            makeEntry(2, 40, null),
          ],
        },
      ],
      false
    );

    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ week: 0, plannedCumulative: 40, actualCumulative: 40, eacCumulative: 40 });
    expect(points[1]).toMatchObject({ week: 1, plannedCumulative: 80, actualCumulative: 78, eacCumulative: 78 });
    expect(points[2]).toMatchObject({ week: 2, plannedCumulative: 120, actualCumulative: 78, eacCumulative: 118 }); // 78 + 40 EAC
  });

  it("omits financial streams when includeFinancials is false", () => {
    const points = computeBurn(
      [{ billRate: 100, costRate: 50, entries: [makeEntry(0, 40, 40)] }],
      false
    );
    expect(points[0].plannedFeeCumulative).toBeUndefined();
    expect(points[0].actualFeeCumulative).toBeUndefined();
    expect(points[0].plannedCostCumulative).toBeUndefined();
    expect(points[0].actualCostCumulative).toBeUndefined();
  });

  it("includes financial streams when includeFinancials is true", () => {
    const points = computeBurn(
      [{ billRate: 200, costRate: 100, entries: [makeEntry(0, 40, 38)] }],
      true
    );
    expect(points[0].plannedFeeCumulative).toBe(8_000);
    expect(points[0].actualFeeCumulative).toBe(7_600);
    expect(points[0].plannedCostCumulative).toBe(4_000);
    expect(points[0].actualCostCumulative).toBe(3_800);
  });

  it("aggregates multiple assignments into the same week", () => {
    const points = computeBurn(
      [
        { billRate: 100, costRate: 50, entries: [makeEntry(0, 40, 40)] },
        { billRate: 200, costRate: 100, entries: [makeEntry(0, 20, 20)] },
      ],
      true
    );
    expect(points).toHaveLength(1);
    expect(points[0].plannedCumulative).toBe(60);
    expect(points[0].plannedFeeCumulative).toBe(8_000); // 40×100 + 20×200
  });

  it("emits weekStart as YYYY-MM-DD", () => {
    const points = computeBurn(
      [{ billRate: 100, costRate: 50, entries: [makeEntry(0, 40, 40)] }],
      false
    );
    expect(points[0].weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ═══════════════════════════════════════════════════════════════
// week helpers
// ═══════════════════════════════════════════════════════════════

describe("countProjectWeeks", () => {
  it("counts a 1-week project (same date) as 1", () => {
    const d = new Date(Date.UTC(2026, 1, 3));
    expect(countProjectWeeks(d, d)).toBe(1);
  });

  it("counts an 8-week project correctly", () => {
    const start = new Date(Date.UTC(2026, 1, 3));
    const end = new Date(Date.UTC(2026, 2, 24)); // exactly 49 days later → 8 inclusive weeks
    expect(countProjectWeeks(start, end)).toBe(8);
  });

  it("returns 0 for inverted date range", () => {
    const start = new Date(Date.UTC(2026, 2, 3));
    const end = new Date(Date.UTC(2026, 1, 3));
    expect(countProjectWeeks(start, end)).toBe(0);
  });
});

describe("weekStartDate", () => {
  it("returns project start for week 0", () => {
    const start = new Date(Date.UTC(2026, 1, 3));
    const w0 = weekStartDate(start, 0);
    expect(w0.toISOString().slice(0, 10)).toBe("2026-02-03");
  });

  it("adds 7 days per week index", () => {
    const start = new Date(Date.UTC(2026, 1, 3));
    const w3 = weekStartDate(start, 3);
    expect(w3.toISOString().slice(0, 10)).toBe("2026-02-24");
  });
});
