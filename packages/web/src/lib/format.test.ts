import { describe, it, expect } from "vitest";
import {
  formatMoney,
  formatHours,
  formatPercent,
  formatPercentSigned,
  formatDate,
  formatDateShort,
  formatRelative,
  projectLabel,
  statusColorClasses,
  roleLabel,
} from "./format";

/**
 * Pure-function tests for the formatter module.
 *
 * These exist to document the contract: a single failing assertion here
 * tells us the locale / null-handling / signed-format behaviour changed
 * unexpectedly, which would ripple into every dashboard cell.
 */

describe("formatMoney", () => {
  it("renders whole-dollar by default", () => {
    expect(formatMoney(1234)).toBe("$1,234");
    expect(formatMoney(1234567)).toBe("$1,234,567");
  });

  it("renders cents when requested", () => {
    expect(formatMoney(1234.56, true)).toBe("$1,234.56");
  });

  it("shows em-dash for null and undefined", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });

  it("handles zero as a real value, not as missing", () => {
    expect(formatMoney(0)).toBe("$0");
  });
});

describe("formatHours", () => {
  it("renders integers without decimals", () => {
    expect(formatHours(40)).toBe("40");
  });

  it("renders fractional hours to 1 decimal", () => {
    expect(formatHours(7.5)).toBe("7.5");
  });

  it("shows em-dash for null", () => {
    expect(formatHours(null)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("appends a percent sign and pads decimals", () => {
    expect(formatPercent(42)).toBe("42.0%");
    expect(formatPercent(42, 0)).toBe("42%");
  });

  it("shows em-dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatPercentSigned", () => {
  it("prefixes positive with +", () => {
    expect(formatPercentSigned(12.3)).toBe("+12.3%");
  });

  it("prefixes negative with proper minus glyph (not hyphen)", () => {
    expect(formatPercentSigned(-4.5)).toBe("−4.5%");
  });

  it("shows zero unsigned", () => {
    expect(formatPercentSigned(0)).toBe("0.0%");
  });
});

describe("formatDate", () => {
  it("formats ISO date in en-US short style", () => {
    // We pass a UTC date string and assert UTC-formatted output to avoid
    // failing in different runner timezones.
    expect(formatDate("2026-02-03")).toBe("Feb 3, 2026");
  });

  it("returns em-dash for null/undefined and for unparseable strings", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });
});

describe("formatDateShort", () => {
  it("renders month-day only", () => {
    expect(formatDateShort("2026-02-03")).toBe("Feb 3");
  });
});

describe("formatRelative", () => {
  it("treats sub-30-second differences as 'just now'", () => {
    const now = new Date(Date.now() - 5_000);
    expect(formatRelative(now)).toBe("just now");
  });

  it("uses plural minutes for >1, singular for exactly 1", () => {
    expect(formatRelative(new Date(Date.now() - 60_000))).toBe("1 min ago");
    expect(formatRelative(new Date(Date.now() - 5 * 60_000))).toBe("5 mins ago");
  });

  it("falls back to a full date for differences over a week", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    // Just assert it doesn't include the word 'days' anymore — switched to absolute.
    expect(formatRelative(tenDaysAgo)).toMatch(/\d{4}/);
  });
});

describe("projectLabel", () => {
  it("joins project code and account name with middle dot", () => {
    expect(projectLabel({ projectCode: "BRF-2026", account: { name: "Meridian Corp" } })).toBe(
      "BRF-2026 · Meridian Corp"
    );
  });
});

describe("statusColorClasses", () => {
  it("maps known statuses to distinct Tailwind class strings", () => {
    expect(statusColorClasses("active")).toContain("emerald");
    expect(statusColorClasses("on_hold")).toContain("amber");
    expect(statusColorClasses("complete")).toContain("sky");
    expect(statusColorClasses("archived")).toContain("gray");
  });

  it("falls back to gray for unknown values", () => {
    expect(statusColorClasses("nonexistent")).toContain("gray");
  });
});

describe("roleLabel", () => {
  it("expands role codes into human labels", () => {
    expect(roleLabel("IC")).toBe("Individual Contributor");
    expect(roleLabel("AA")).toBe("Application Admin");
  });

  it("returns the raw code if unrecognised", () => {
    expect(roleLabel("XYZ")).toBe("XYZ");
  });
});
