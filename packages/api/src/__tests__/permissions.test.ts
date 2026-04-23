import { describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import {
  hasCapability,
  canViewFinancials,
  canViewBillRates,
  canAccessProject,
  canEditHours,
  canManagePlan,
  canLockWeeks,
  getDashboardSections,
} from "../lib/permissions";
import type { AuthUser, ResourceContext } from "../types";

// ── Helpers ──

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "user-1",
    email: "test@trifork.com",
    name: "Test User",
    roles: [Role.IC],
    projectRoles: ["Backend"],
    primaryBuId: "bu-owls",
    financialAccess: false,
    isActive: true,
    managedAccountIds: [],
    ...overrides,
  };
}

const PROJECT_CTX: ResourceContext = {
  projectId: "proj-1",
  projectAccountId: "acct-mer",
  projectOwningBuId: "bu-owls",
  projectSharedBuIds: [],
};

// ═══════════════════════════════════════════════════════════════
// BASE CAPABILITIES
// ═══════════════════════════════════════════════════════════════

describe("hasCapability", () => {
  it("IC can log hours", () => {
    expect(hasCapability(makeUser({ roles: [Role.IC] }), "logHours")).toBe(true);
  });

  it("IC cannot create projects", () => {
    expect(hasCapability(makeUser({ roles: [Role.IC] }), "createProject")).toBe(false);
  });

  it("PM can create projects", () => {
    expect(hasCapability(makeUser({ roles: [Role.PM] }), "createProject")).toBe(true);
  });

  it("PM cannot admin users", () => {
    expect(hasCapability(makeUser({ roles: [Role.PM] }), "adminUsers")).toBe(false);
  });

  it("AA can admin users", () => {
    expect(hasCapability(makeUser({ roles: [Role.AA] }), "adminUsers")).toBe(true);
  });

  it("IC+PM union: can log hours AND create projects", () => {
    const user = makeUser({ roles: [Role.IC, Role.PM] });
    expect(hasCapability(user, "logHours")).toBe(true);
    expect(hasCapability(user, "createProject")).toBe(true);
  });

  it("Adding a role never reduces capabilities", () => {
    const icOnly = makeUser({ roles: [Role.IC] });
    const icPm = makeUser({ roles: [Role.IC, Role.PM] });
    // Everything IC can do, IC+PM can also do
    expect(hasCapability(icOnly, "logHours")).toBe(true);
    expect(hasCapability(icPm, "logHours")).toBe(true);
    // IC+PM gains createProject
    expect(hasCapability(icOnly, "createProject")).toBe(false);
    expect(hasCapability(icPm, "createProject")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// FINANCIAL ACCESS
// ═══════════════════════════════════════════════════════════════

describe("canViewFinancials", () => {
  it("IC cannot view financials", () => {
    expect(canViewFinancials(makeUser({ roles: [Role.IC] }), PROJECT_CTX)).toBe(false);
  });

  it("PM cannot view financials", () => {
    expect(canViewFinancials(makeUser({ roles: [Role.PM] }), PROJECT_CTX)).toBe(false);
  });

  it("IC+PM cannot view financials", () => {
    expect(canViewFinancials(makeUser({ roles: [Role.IC, Role.PM] }), PROJECT_CTX)).toBe(false);
  });

  it("AC can view financials on managed Account project", () => {
    const user = makeUser({ roles: [Role.AC], managedAccountIds: ["acct-mer"] });
    expect(canViewFinancials(user, PROJECT_CTX)).toBe(true);
  });

  it("AC cannot view financials on non-managed Account project", () => {
    const user = makeUser({ roles: [Role.AC], managedAccountIds: ["acct-other"] });
    expect(canViewFinancials(user, PROJECT_CTX)).toBe(false);
  });

  it("BUL can view financials on own BU project", () => {
    const user = makeUser({ roles: [Role.BUL], primaryBuId: "bu-owls" });
    expect(canViewFinancials(user, PROJECT_CTX)).toBe(true);
  });

  it("BUL cannot view financials on other BU project", () => {
    const user = makeUser({ roles: [Role.BUL], primaryBuId: "bu-panda" });
    expect(canViewFinancials(user, PROJECT_CTX)).toBe(false);
  });

  it("BUL can view financials on shared project", () => {
    const user = makeUser({ roles: [Role.BUL], primaryBuId: "bu-panda" });
    const ctx = { ...PROJECT_CTX, projectSharedBuIds: ["bu-panda"] };
    expect(canViewFinancials(user, ctx)).toBe(true);
  });

  it("AA without flag cannot view financials", () => {
    const user = makeUser({ roles: [Role.AA], financialAccess: false });
    expect(canViewFinancials(user, PROJECT_CTX)).toBe(false);
  });

  it("AA with flag can view financials", () => {
    const user = makeUser({ roles: [Role.AA], financialAccess: true });
    expect(canViewFinancials(user, PROJECT_CTX)).toBe(true);
  });

  it("PM+AC: financials on Account project YES, non-Account project NO", () => {
    const user = makeUser({ roles: [Role.PM, Role.AC], managedAccountIds: ["acct-mer"] });
    expect(canViewFinancials(user, PROJECT_CTX)).toBe(true);
    expect(canViewFinancials(user, { ...PROJECT_CTX, projectAccountId: "acct-other" })).toBe(false);
  });

  it("AC+BUL: union of both scopes (Account OR BU)", () => {
    const user = makeUser({
      roles: [Role.AC, Role.BUL],
      primaryBuId: "bu-owls",
      managedAccountIds: ["acct-pin"],
    });
    // Via BUL: same BU
    expect(canViewFinancials(user, PROJECT_CTX)).toBe(true);
    // Via AC: different BU but managed Account
    expect(canViewFinancials(user, {
      ...PROJECT_CTX,
      projectOwningBuId: "bu-panda",
      projectAccountId: "acct-pin",
    })).toBe(true);
    // Neither scope
    expect(canViewFinancials(user, {
      ...PROJECT_CTX,
      projectOwningBuId: "bu-panda",
      projectAccountId: "acct-other",
    })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// BILL RATES
// ═══════════════════════════════════════════════════════════════

describe("canViewBillRates", () => {
  it("IC cannot see bill rates", () => {
    expect(canViewBillRates(makeUser({ roles: [Role.IC] }))).toBe(false);
  });

  it("PM can see bill rates", () => {
    expect(canViewBillRates(makeUser({ roles: [Role.PM] }))).toBe(true);
  });

  it("AC can see bill rates", () => {
    expect(canViewBillRates(makeUser({ roles: [Role.AC] }))).toBe(true);
  });

  it("AA without flag cannot see bill rates", () => {
    expect(canViewBillRates(makeUser({ roles: [Role.AA], financialAccess: false }))).toBe(false);
  });

  it("AA with flag can see bill rates", () => {
    expect(canViewBillRates(makeUser({ roles: [Role.AA], financialAccess: true }))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// PROJECT ACCESS
// ═══════════════════════════════════════════════════════════════

describe("canAccessProject", () => {
  it("IC assigned to project can access", () => {
    expect(canAccessProject(
      makeUser({ roles: [Role.IC] }),
      { ...PROJECT_CTX, assignedUserIds: ["user-1"] }
    )).toBe(true);
  });

  it("IC not assigned cannot access", () => {
    expect(canAccessProject(
      makeUser({ roles: [Role.IC] }),
      { ...PROJECT_CTX, assignedUserIds: ["user-2"] }
    )).toBe(false);
  });

  it("AA can access any project", () => {
    expect(canAccessProject(
      makeUser({ roles: [Role.AA] }),
      { ...PROJECT_CTX, assignedUserIds: [] }
    )).toBe(true);
  });

  it("AC can access Account project even if not assigned", () => {
    expect(canAccessProject(
      makeUser({ roles: [Role.AC], managedAccountIds: ["acct-mer"] }),
      { ...PROJECT_CTX, assignedUserIds: [] }
    )).toBe(true);
  });

  it("BUL can access BU project even if not assigned", () => {
    expect(canAccessProject(
      makeUser({ roles: [Role.BUL], primaryBuId: "bu-owls" }),
      { ...PROJECT_CTX, assignedUserIds: [] }
    )).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// HOURS EDITING
// ═══════════════════════════════════════════════════════════════

describe("canEditHours", () => {
  it("IC can edit own row", () => {
    expect(canEditHours(makeUser({ roles: [Role.IC] }), true)).toBe(true);
  });

  it("IC cannot edit other rows", () => {
    expect(canEditHours(makeUser({ roles: [Role.IC] }), false)).toBe(false);
  });

  it("PM can edit any row", () => {
    expect(canEditHours(makeUser({ roles: [Role.PM] }), false)).toBe(true);
  });

  it("AA alone cannot edit hours", () => {
    expect(canEditHours(makeUser({ roles: [Role.AA] }), false)).toBe(false);
    expect(canEditHours(makeUser({ roles: [Role.AA] }), true)).toBe(false);
  });

  it("AA+IC can edit own row", () => {
    expect(canEditHours(makeUser({ roles: [Role.AA, Role.IC] }), true)).toBe(true);
    expect(canEditHours(makeUser({ roles: [Role.AA, Role.IC] }), false)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// DASHBOARD SECTIONS
// ═══════════════════════════════════════════════════════════════

describe("getDashboardSections", () => {
  it("IC only: my_hours", () => {
    expect(getDashboardSections(makeUser({ roles: [Role.IC] }))).toEqual(["my_hours"]);
  });

  it("PM+IC: project_health then my_hours", () => {
    expect(getDashboardSections(makeUser({ roles: [Role.PM, Role.IC] })))
      .toEqual(["project_health", "my_hours"]);
  });

  it("BUL+PM+IC: bu_health, project_health, my_hours", () => {
    expect(getDashboardSections(makeUser({ roles: [Role.BUL, Role.PM, Role.IC] })))
      .toEqual(["bu_health", "project_health", "my_hours"]);
  });

  it("AC+PM+IC: account_overview, project_health, my_hours", () => {
    expect(getDashboardSections(makeUser({ roles: [Role.AC, Role.PM, Role.IC] })))
      .toEqual(["account_overview", "project_health", "my_hours"]);
  });

  it("AA alone: platform_admin only", () => {
    expect(getDashboardSections(makeUser({ roles: [Role.AA] }))).toEqual(["platform_admin"]);
  });

  it("AA+IC: platform_admin, my_hours", () => {
    expect(getDashboardSections(makeUser({ roles: [Role.AA, Role.IC] })))
      .toEqual(["platform_admin", "my_hours"]);
  });

  it("All roles: all sections in priority order", () => {
    expect(getDashboardSections(makeUser({ roles: [Role.IC, Role.PM, Role.AC, Role.BUL, Role.AA] })))
      .toEqual(["bu_health", "account_overview", "platform_admin", "project_health", "my_hours"]);
  });
});
