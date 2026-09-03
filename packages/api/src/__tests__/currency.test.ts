import { describe, it, expect } from "vitest";
import { convert, fxFactor, USD_PER_UNIT } from "../services/currency";

/** Direction pins for the FX service (see the web mirror's test for the
 *  field-reported 158.04 story: correct conversion × cross-BU markup). */
describe("services/currency", () => {
  it("converts USD → CHF downward and CHF → USD upward", () => {
    expect(convert(150, "USD", "CHF")).toBeCloseTo(121.4, 2);
    expect(convert(121.4, "CHF", "USD")).toBeCloseTo(150, 2);
  });
  it("fxFactor composes with amounts the same way convert does", () => {
    expect(150 * fxFactor("USD", "CHF")).toBeCloseTo(convert(150, "USD", "CHF"), 10);
    expect(fxFactor("DKK", "USD")).toBeCloseTo(USD_PER_UNIT.DKK, 10);
  });
  it("same-currency factor is exactly 1", () => {
    expect(fxFactor("EUR", "EUR")).toBe(1);
  });
});
