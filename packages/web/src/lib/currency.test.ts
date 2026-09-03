import { describe, it, expect } from "vitest";
import { convert, round2, USD_PER_UNIT } from "./currency";
import { effectiveCost, CROSS_BU_MARKUP } from "./constants";

/**
 * Conversion direction is the thing these tests exist to pin, after a field
 * report that 150 USD "came out as 158.04" on a CHF project. That number was
 * NOT an inverted conversion — it was the correct conversion at the old
 * placeholder rate (150/1.12 = 133.93) times the 18% cross-BU markup
 * (× 1.18 = 158.04). Inverted would have shown 168.00. The rate table is now
 * realistic (CHF 1.2356 USD), and these tests pin both the direction and the
 * exact composed numbers so the next question answers itself.
 */

describe("conversion direction", () => {
  it("USD → CHF shrinks the number (CHF is worth more than a dollar)", () => {
    expect(convert(150, "USD", "CHF")).toBeLessThan(150);
    expect(round2(convert(150, "USD", "CHF"))).toBe(121.4); // the reported scenario
  });
  it("CHF → USD grows the number", () => {
    expect(convert(100, "CHF", "USD")).toBeGreaterThan(100);
    expect(round2(convert(100, "CHF", "USD"))).toBe(123.56);
  });
  it("USD → DKK grows; DKK → USD shrinks (a krone is a fraction of a dollar)", () => {
    expect(round2(convert(100, "USD", "DKK"))).toBe(636.94);
    expect(round2(convert(750, "DKK", "USD"))).toBe(117.75);
  });
  it("is identity for same-currency and round-trips cleanly", () => {
    expect(convert(150, "USD", "USD")).toBe(150);
    expect(round2(convert(convert(100, "GBP", "CHF"), "CHF", "GBP"))).toBe(100);
  });
  it("cross-rates go through USD", () => {
    // 750 DKK → EUR: (750 × 0.157) / 1.17
    expect(round2(convert(750, "DKK", "EUR"))).toBe(100.64);
  });
});

describe("the wizard's standing-cost default (conversion × cross-BU markup)", () => {
  const converted = round2(convert(150, "USD", "CHF"));
  it("same-BU: the default is the plain conversion", () => {
    expect(effectiveCost(converted, "US-ORD-OWLS", "US-ORD-OWLS")).toBe(121.4);
  });
  it("cross-BU: the 18% markup applies on top of the converted rate", () => {
    expect(CROSS_BU_MARKUP).toBe(0.18);
    expect(effectiveCost(converted, "US-ORD-OWLS", "EU-ZRH-LYNX")).toBe(143.25);
  });
  it("the table is the single source of truth the API mirrors", () => {
    expect(USD_PER_UNIT.CHF).toBe(1.2356);
    expect(USD_PER_UNIT.USD).toBe(1);
  });
});
