import { describe, it, expect } from "vitest";
import { effectiveCost, isCrossBu, CROSS_BU_MARKUP } from "./constants";

describe("cross-BU cost", () => {
  it("the markup is 18%", () => {
    expect(CROSS_BU_MARKUP).toBe(0.18);
  });

  it("adds the markup when the BUs differ", () => {
    expect(effectiveCost(100, "BU-A", "BU-B")).toBe(118);
  });

  it("uses the baseline when the BUs match", () => {
    expect(effectiveCost(100, "BU-A", "BU-A")).toBe(100);
  });

  it("uses the baseline when a BU code is missing", () => {
    expect(effectiveCost(100, "", "BU-A")).toBe(100);
    expect(effectiveCost(100, "BU-A", "")).toBe(100);
  });

  it("rounds the marked-up cost to cents", () => {
    expect(effectiveCost(95.5, "BU-A", "BU-B")).toBe(112.69); // 95.5 × 1.18
  });

  it("isCrossBu reflects whether the BUs differ", () => {
    expect(isCrossBu("BU-A", "BU-B")).toBe(true);
    expect(isCrossBu("BU-A", "BU-A")).toBe(false);
    expect(isCrossBu("", "BU-B")).toBe(false);
    expect(isCrossBu("BU-A", "")).toBe(false);
  });
});
