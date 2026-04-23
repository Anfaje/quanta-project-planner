import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import { serializeForUser, serializeAssignment, getExportColumns } from "../services/financialSerializer";
import type { AuthUser, ResourceContext } from "../types";

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1", email: "test@test.com", name: "Test", roles: [Role.IC],
    projectRoles: [], primaryBuId: "bu-owls", financialAccess: false,
    isActive: true, managedAccountIds: [], ...overrides,
  };
}

const CTX: ResourceContext = {
  projectId: "proj-1", projectAccountId: "acct-mer",
  projectOwningBuId: "bu-owls", projectSharedBuIds: [],
};

const FULL_DATA = {
  id: "res-1",
  name: "Maya",
  billRate: 185,
  costRate: 95,
  totalFee: 59200,
  totalCost: 26030,
  margin: 56,
  contingencyAmt: 8880,
  adjustedFee: 68080,
};

describe("serializeForUser", () => {
  it("IC: strips all financial fields including bill rate", () => {
    const result = serializeForUser(FULL_DATA, makeUser({ roles: [Role.IC] }), CTX);
    expect(result.billRate).toBeUndefined();
    expect(result.costRate).toBeUndefined();
    expect(result.totalFee).toBeUndefined();
    expect(result.margin).toBeUndefined();
    expect(result.id).toBe("res-1");
    expect(result.name).toBe("Maya");
  });

  it("PM: has bill rate, strips cost rate and financials", () => {
    const result = serializeForUser(FULL_DATA, makeUser({ roles: [Role.PM] }), CTX);
    expect(result.billRate).toBe(185);
    expect(result.costRate).toBeUndefined();
    expect(result.totalFee).toBeUndefined();
    expect(result.margin).toBeUndefined();
  });

  it("AC on managed Account: all fields present", () => {
    const user = makeUser({ roles: [Role.AC], managedAccountIds: ["acct-mer"] });
    const result = serializeForUser(FULL_DATA, user, CTX);
    expect(result.billRate).toBe(185);
    expect(result.costRate).toBe(95);
    expect(result.totalFee).toBe(59200);
    expect(result.margin).toBe(56);
  });

  it("AC on non-managed Account: strips cost/financials, keeps bill rate", () => {
    const user = makeUser({ roles: [Role.AC], managedAccountIds: ["acct-other"] });
    const result = serializeForUser(FULL_DATA, user, CTX);
    expect(result.billRate).toBe(185);
    expect(result.costRate).toBeUndefined();
    expect(result.totalFee).toBeUndefined();
  });

  it("BUL on own BU: all fields present", () => {
    const user = makeUser({ roles: [Role.BUL], primaryBuId: "bu-owls" });
    const result = serializeForUser(FULL_DATA, user, CTX);
    expect(result.costRate).toBe(95);
    expect(result.margin).toBe(56);
  });

  it("BUL on other BU: strips financials", () => {
    const user = makeUser({ roles: [Role.BUL], primaryBuId: "bu-panda" });
    const result = serializeForUser(FULL_DATA, user, CTX);
    expect(result.costRate).toBeUndefined();
    expect(result.margin).toBeUndefined();
  });

  it("PM+AC on Account: financials present", () => {
    const user = makeUser({ roles: [Role.PM, Role.AC], managedAccountIds: ["acct-mer"] });
    const result = serializeForUser(FULL_DATA, user, CTX);
    expect(result.costRate).toBe(95);
    expect(result.margin).toBe(56);
  });

  it("PM+AC on non-Account project: cost stripped, bill kept", () => {
    const user = makeUser({ roles: [Role.PM, Role.AC], managedAccountIds: ["acct-other"] });
    const result = serializeForUser(FULL_DATA, user, CTX);
    expect(result.billRate).toBe(185);
    expect(result.costRate).toBeUndefined();
  });
});

describe("serializeAssignment", () => {
  const ASSIGNMENT = { id: "a1", name: "Maya", billRate: 185, costRate: 95, fee: 59200, cost: 26030, margin: 56 };

  it("IC: strips bill rate and cost rate", () => {
    const result = serializeAssignment(ASSIGNMENT, makeUser({ roles: [Role.IC] }), CTX);
    expect(result.billRate).toBeUndefined();
    expect(result.costRate).toBeUndefined();
    expect(result.fee).toBeUndefined();
  });

  it("PM: keeps bill rate, strips cost", () => {
    const result = serializeAssignment(ASSIGNMENT, makeUser({ roles: [Role.PM] }), CTX);
    expect(result.billRate).toBe(185);
    expect(result.costRate).toBeUndefined();
    expect(result.fee).toBeUndefined();
  });
});

describe("getExportColumns", () => {
  it("IC: no financial columns", () => {
    const cols = getExportColumns(makeUser({ roles: [Role.IC] }), CTX);
    expect(cols.includeBillRate).toBe(false);
    expect(cols.includeCostRate).toBe(false);
    expect(cols.includeFinancials).toBe(false);
  });

  it("PM: bill rate yes, cost no", () => {
    const cols = getExportColumns(makeUser({ roles: [Role.PM] }), CTX);
    expect(cols.includeBillRate).toBe(true);
    expect(cols.includeCostRate).toBe(false);
  });

  it("BUL on own BU: all columns", () => {
    const cols = getExportColumns(makeUser({ roles: [Role.BUL], primaryBuId: "bu-owls" }), CTX);
    expect(cols.includeBillRate).toBe(true);
    expect(cols.includeCostRate).toBe(true);
    expect(cols.includeFinancials).toBe(true);
  });
});
