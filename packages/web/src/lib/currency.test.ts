import { describe, it, expect } from "vitest";
import { convert, round2 } from "./currency";

describe("currency conversion (web mirror of the API table)", () => {
  it("is identity for same-currency", () => {
    expect(convert(750, "DKK", "DKK")).toBe(750);
  });
  it("converts through USD", () => {
    // 750 DKK → USD: 750 × 0.145 = 108.75
    expect(round2(convert(750, "DKK", "USD"))).toBe(108.75);
    // and on into EUR: 108.75 / 1.08
    expect(round2(convert(750, "DKK", "EUR"))).toBe(100.69);
  });
  it("round-trips within rounding error", () => {
    expect(round2(convert(convert(100, "GBP", "CHF"), "CHF", "GBP"))).toBe(100);
  });
});
