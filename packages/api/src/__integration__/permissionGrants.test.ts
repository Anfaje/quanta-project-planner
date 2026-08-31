import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  setupTestApp,
  teardownTestApp,
  resetMutableTables,
  seedUser,
  seedProject,
  authenticateAs,
  getDefaultBu,
  getDefaultAccount,
  TEST_DOMAIN,
} from "./helpers";


/**
 * Scoped permission grants — the additive overlay on role presets.
 *
 * Grants must imply reach across three layers (guards, canAccessProject, and
 * the list/summary query filters), respect the additive model's invariants,
 * and enforce the editing ceiling: AA anywhere; BUL / manage_users grantees
 * only within their BU(s) and those BUs' projects — never account or
 * platform scope, never cross-BU, never an AA target.
 */

let app: Express;
let prisma: PrismaClient;

/** Minimal create-project fixture (mirrors the wizard payload). */
async function draftPayload(db: PrismaClient) {
  const bu = await getDefaultBu(db);
  const account = await getDefaultAccount(db);
  const pm = await seedUser(db, { buId: bu.id, roles: ["PM"] });
  const body = {
    name: "Grants fixture project",
    projectCode: `GR-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    accountId: account.id,
    owningBuId: bu.id,
    startDate: "2026-09-06",
    endDate: "2026-10-04",
    contingencyPct: 0.15,
    pricingModel: "time_and_materials" as const,
    assignments: [{ userId: pm.id, projectRole: "PM", billRate: 175, costRate: 95 }],
    plannedHours: [{ userId: pm.id, projectWeek: 0, plannedHours: 10 }],
  };
  return { pm, bu, account, body };
}

beforeAll(async () => {
  ({ app, prisma } = await setupTestApp());
});

afterAll(async () => {
  await teardownTestApp(prisma);
});

beforeEach(async () => {
  await resetMutableTables(prisma);
});

async function grant(
  userId: string,
  permission: string,
  scopeType: string,
  scopeId: string | null
) {
  await prisma.permissionGrant.create({
    data: {
      userId,
      permission: permission as never,
      scopeType: scopeType as never,
      scopeId,
    },
  });
}

async function twoAccountBook() {
  const bu = await getDefaultBu(prisma);
  const accountA = await getDefaultAccount(prisma);
  const accountB = await prisma.account.create({
    data: {
      name: "Grant Test Client",
      code: `GRT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    },
  });
  const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
  const worker = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
  const p1 = await seedProject(prisma, {
    accountId: accountA.id,
    owningBuId: bu.id,
    createdBy: aa!.id,
    assignments: [{ userId: worker.id, projectRole: "Dev", billRate: 200, costRate: 100 }],
    seedHours: { plannedPerWeek: 10, actualPerWeek: 10 },
  });
  const p2 = await seedProject(prisma, {
    accountId: accountB.id,
    owningBuId: bu.id,
    createdBy: aa!.id,
    assignments: [{ userId: worker.id, projectRole: "Dev", billRate: 200, costRate: 100 }],
    seedHours: { plannedPerWeek: 10, actualPerWeek: 10 },
  });
  return { bu, accountA, accountB, p1, p2, worker };
}

describe("permission grants: reach and visibility", () => {
  it("view_financials @ account: list, detail financials, and summary open up for that account only", async () => {
    const { bu, accountA, accountB, p1, p2 } = await twoAccountBook();
    const grantee = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    await grant(grantee.id, "view_financials", "account", accountA.id);
    const agent = await authenticateAs(app, grantee.email);

    // List: only the granted account's project appears.
    const list = await agent.get("/api/projects").expect(200);
    const ids = list.body.projects.map((p: { id: string }) => p.id);
    expect(ids).toContain(p1.id);
    expect(ids).not.toContain(p2.id);

    // Detail: accessible, with financials present (the serializer honours the grant).
    const detail = await agent.get(`/api/projects/${p1.id}`).expect(200);
    expect(detail.body.financials?.totalFee).toBeDefined();

    // The other account's project stays 403.
    await agent.get(`/api/projects/${p2.id}`).expect(403);

    // Accounts summary: granted account visible (whole), other absent.
    const sum = await agent.get("/api/accounts/summary?scope=lifetime").expect(200);
    const rowA = sum.body.accounts.find((a: { id: string }) => a.id === accountA.id);
    const rowB = sum.body.accounts.find((a: { id: string }) => a.id === accountB.id);
    expect(rowA).toBeDefined();
    expect(rowA.revenue).toBeGreaterThan(0);
    expect(rowB).toBeUndefined();
  });

  it("view_financials @ BU: BU slice in the summary, no leak into other BUs", async () => {
    const { bu, p1 } = await twoAccountBook();
    const otherBu = await prisma.businessUnit.upsert({
      where: { code: "ZZ-GRT" },
      update: {},
      create: { code: "ZZ-GRT", name: "Other BU (grants)" },
    });
    const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
    const worker = await seedUser(prisma, { buId: otherBu.id, roles: ["IC"] });
    const foreign = await seedProject(prisma, {
      accountId: (await getDefaultAccount(prisma)).id,
      owningBuId: otherBu.id,
      createdBy: aa!.id,
      assignments: [{ userId: worker.id, projectRole: "Dev", billRate: 100, costRate: 50 }],
      seedHours: { plannedPerWeek: 5, actualPerWeek: 5 },
    });

    const grantee = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    await grant(grantee.id, "view_financials", "business_unit", bu.id);
    const agent = await authenticateAs(app, grantee.email);

    const detail = await agent.get(`/api/projects/${p1.id}`).expect(200);
    expect(detail.body.financials?.totalFee).toBeDefined();
    await agent.get(`/api/projects/${foreign.id}`).expect(403);

    const sum = await agent.get("/api/accounts/summary?scope=lifetime").expect(200);
    expect(sum.body.slice).toEqual({ buCode: bu.code });
  });

  it("manage_projects @ account: edit and create projects in that account", async () => {
    const { accountA, p1 } = await twoAccountBook();
    const bu = await getDefaultBu(prisma);
    const grantee = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    await grant(grantee.id, "manage_projects", "account", accountA.id);
    const agent = await authenticateAs(app, grantee.email);

    // Edit an in-flight project in the account.
    await agent.patch(`/api/projects/${p1.id}`).send({ name: "Renamed by grantee" }).expect(200);
    const renamed = await prisma.project.findUnique({ where: { id: p1.id } });
    expect(renamed!.name).toBe("Renamed by grantee");

    // Create a new draft in the account (canCreateProject via grant).
    const { body } = await draftPayload(prisma);
    const created = await agent
      .post("/api/projects")
      .send({ ...body, projectCode: `${body.projectCode}G` })
      .expect(201);
    expect(created.body.projectId).toBeDefined();
  });

  it("approve_drafts @ BU: a non-BUL grantee can activate a draft", async () => {
    const { pm, body, bu } = await draftPayload(prisma);
    const pmAgent = await authenticateAs(app, pm.email);
    const created = await pmAgent.post("/api/projects").send(body).expect(201);

    const approver = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    await grant(approver.id, "approve_drafts", "business_unit", bu.id);
    const agent = await authenticateAs(app, approver.email);
    const approved = await agent.post(`/api/projects/${created.body.projectId}/approve`);
    expect(approved.status).toBeLessThan(300);
    const project = await prisma.project.findUnique({ where: { id: created.body.projectId } });
    expect(project!.status).toBe("active");
  });
});

describe("permission grants: the editing ceiling", () => {
  it("manage_users @ BU grantee edits within reach; account/platform/cross-BU are refused", async () => {
    const bu = await getDefaultBu(prisma);
    const accountA = await getDefaultAccount(prisma);
    const otherBu = await prisma.businessUnit.upsert({
      where: { code: "ZZ-GRT2" },
      update: {},
      create: { code: "ZZ-GRT2", name: "Other BU (ceiling)" },
    });
    const editor = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    await grant(editor.id, "manage_users", "business_unit", bu.id);
    const targetIn = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const targetOut = await seedUser(prisma, { buId: otherBu.id, roles: ["IC"] });
    const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
    const project = await seedProject(prisma, {
      accountId: accountA.id,
      owningBuId: bu.id,
      createdBy: aa!.id,
      assignments: [{ userId: targetIn.id, projectRole: "Dev", billRate: 100, costRate: 50 }],
    });
    const agent = await authenticateAs(app, editor.email);

    // In-reach: BU-scope and project-scope grants are accepted.
    const ok = await agent
      .put(`/api/admin/users/${targetIn.id}/permissions`)
      .send({
        grants: [
          { permission: "view_financials", scopeType: "business_unit", scopeId: bu.id },
          { permission: "manage_projects", scopeType: "project", scopeId: project.id },
        ],
      })
      .expect(200);
    expect(ok.body.grants).toHaveLength(2);

    // Account scope: AA-only (accounts span BUs).
    await agent
      .put(`/api/admin/users/${targetIn.id}/permissions`)
      .send({
        grants: [{ permission: "view_financials", scopeType: "account", scopeId: accountA.id }],
      })
      .expect(403);

    // Platform scope: AA-only.
    await agent
      .put(`/api/admin/users/${targetIn.id}/permissions`)
      .send({ grants: [{ permission: "view_financials", scopeType: "platform" }] })
      .expect(403);

    // Cross-BU target: outside reach.
    await agent
      .put(`/api/admin/users/${targetOut.id}/permissions`)
      .send({ grants: [] })
      .expect(403);

    // GET mirrors the same visibility rule.
    const got = await agent.get(`/api/admin/users/${targetIn.id}/permissions`).expect(200);
    expect(got.body.grants).toHaveLength(2);
  });

  it("manage_users itself is only grantable at business-unit scope, for everyone", async () => {
    const bu = await getDefaultBu(prisma);
    const target = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    await aaAgent
      .put(`/api/admin/users/${target.id}/permissions`)
      .send({ grants: [{ permission: "manage_users", scopeType: "platform" }] })
      .expect(400);
  });

  it("AA replaces the full grid, including account and platform scopes", async () => {
    const bu = await getDefaultBu(prisma);
    const accountA = await getDefaultAccount(prisma);
    const target = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    await grant(target.id, "view_bill_rates", "business_unit", bu.id);
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);

    const res = await aaAgent
      .put(`/api/admin/users/${target.id}/permissions`)
      .send({
        grants: [
          { permission: "view_financials", scopeType: "platform" },
          { permission: "approve_drafts", scopeType: "account", scopeId: accountA.id },
        ],
      })
      .expect(200);
    const perms = res.body.grants.map((g: { permission: string }) => g.permission).sort();
    expect(perms).toEqual(["approve_drafts", "view_financials"]);
    // Full replace: the pre-existing bill-rates grant is gone.
    expect(
      res.body.grants.some((g: { permission: string }) => g.permission === "view_bill_rates")
    ).toBe(false);
  });
});
