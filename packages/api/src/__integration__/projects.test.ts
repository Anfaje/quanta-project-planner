import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
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
 * Projects route integration tests.
 *
 * Focus on the permission story since that's the gap unit tests don't catch:
 *   - List scope respects role + BU + project shares
 *   - Create rejects IC, accepts PM / BUL on their BU, rejects PM on a BU
 *     they don't belong to
 *   - Validation: end <= start, dup project code, bad UUIDs, unknown user
 *   - Detail: 404 for non-existent, 403 for out-of-scope, 200 for assigned IC
 */

let app: Express;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await setupTestApp());
});

afterAll(async () => {
  await teardownTestApp(prisma);
});

beforeEach(async () => {
  await resetMutableTables(prisma);
});

// ═══════════════════════════════════════════════════════════════
// GET /api/projects (list, scoped)
// ═══════════════════════════════════════════════════════════════

describe("GET /api/projects", () => {
  it("returns 401 without a session", async () => {
    await request(app).get("/api/projects").expect(401);
  });

  it("lists only projects the IC is assigned to", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const ic = await seedUser(prisma, { buId: bu.id });
    const otherIc = await seedUser(prisma, { buId: bu.id });

    const visible = await seedProject(prisma, {
      name: "Visible",
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      assignments: [{ userId: ic.id, projectRole: "iOS Dev" }],
    });
    await seedProject(prisma, {
      name: "Hidden",
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      assignments: [{ userId: otherIc.id, projectRole: "iOS Dev" }],
    });

    const agent = await authenticateAs(app, ic.email);
    const res = await agent.get("/api/projects").expect(200);

    const ids = res.body.projects.map((p: { id: string }) => p.id);
    expect(ids).toContain(visible.id);
    expect(ids).toHaveLength(1); // only assigned project
  });

  it("BUL sees every project owned by their BU", async () => {
    const bu = await getDefaultBu(prisma);
    const otherBu = await prisma.businessUnit.findUnique({ where: { code: "BU-B" } });
    const account = await getDefaultAccount(prisma);

    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });

    await seedProject(prisma, {
      name: "BU-A project",
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      assignments: [{ userId: pm.id, projectRole: "PM" }],
    });
    await seedProject(prisma, {
      name: "BU-B project",
      accountId: account.id,
      owningBuId: otherBu!.id,
      createdBy: pm.id,
      assignments: [{ userId: pm.id, projectRole: "PM" }],
    });

    const agent = await authenticateAs(app, bul.email);
    const res = await agent.get("/api/projects").expect(200);

    const names = res.body.projects.map((p: { name: string }) => p.name);
    expect(names).toContain("BU-A project");
    expect(names).not.toContain("BU-B project");
  });

  it("AA sees all projects regardless of BU", async () => {
    const bu = await getDefaultBu(prisma);
    const otherBu = await prisma.businessUnit.findUnique({ where: { code: "BU-B" } });
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });

    await seedProject(prisma, {
      name: "P1",
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      assignments: [{ userId: pm.id, projectRole: "PM" }],
    });
    await seedProject(prisma, {
      name: "P2",
      accountId: account.id,
      owningBuId: otherBu!.id,
      createdBy: pm.id,
      assignments: [{ userId: pm.id, projectRole: "PM" }],
    });

    const agent = await authenticateAs(app, `aa@example.com`);
    const res = await agent.get("/api/projects").expect(200);
    expect(res.body.projects.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/projects (create)
// ═══════════════════════════════════════════════════════════════

describe("POST /api/projects", () => {
  async function basePayload(prisma: PrismaClient) {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    return {
      bu,
      account,
      pm,
      body: {
        name: "Brand Refresh",
        projectCode: `P-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        accountId: account.id,
        owningBuId: bu.id,
        startDate: "2026-03-01",
        endDate: "2026-03-29",
        contingencyPct: 0.15,
        assignments: [
          { userId: pm.id, projectRole: "PM", billRate: 200, costRate: 100 },
        ],
        plannedHours: [],
        saveAsDraft: true,
      },
    };
  }

  it("403 when an IC tries to create", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const ic = await seedUser(prisma, { buId: bu.id });

    const agent = await authenticateAs(app, ic.email);
    const res = await agent.post("/api/projects").send({
      name: "Should not exist",
      projectCode: "NOPE-001",
      accountId: account.id,
      owningBuId: bu.id,
      startDate: "2026-03-01",
      endDate: "2026-03-29",
      assignments: [{ userId: ic.id, projectRole: "IC", billRate: 100, costRate: 50 }],
      plannedHours: [],
    });
    expect(res.status).toBe(403);
  });

  it("PM in the owning BU can save a draft (status draft, code reserved)", async () => {
    const { pm, body } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const res = await agent.post("/api/projects").send(body).expect(201);

    expect(res.body.projectId).toBeDefined();
    expect(res.body.status).toBe("draft");
    const inDb = await prisma.project.findUnique({ where: { id: res.body.projectId } });
    expect(inDb?.projectCode).toBe(body.projectCode);
    expect(inDb?.status).toBe("draft");
  });

  it("can save a draft that staffs an inactive / not-yet-activated user", async () => {
    const { pm, body } = await basePayload(prisma);
    const bu = await getDefaultBu(prisma);
    // Pending (invited, no password) and deactivated users are both isActive:false;
    // either should be assignable to a draft.
    const pending = await seedUser(prisma, { buId: bu.id, isActive: false });
    const agent = await authenticateAs(app, pm.email);
    const res = await agent
      .post("/api/projects")
      .send({
        ...body,
        assignments: [
          ...body.assignments,
          { userId: pending.id, projectRole: "iOS Dev", billRate: 150, costRate: 80 },
        ],
      })
      .expect(201);

    const count = await prisma.resourceAssignment.count({
      where: { projectId: res.body.projectId },
    });
    expect(count).toBe(2);
    const a = await prisma.resourceAssignment.findFirst({
      where: { projectId: res.body.projectId, userId: pending.id },
    });
    expect(a).not.toBeNull();
  });

  it("can add an inactive / not-yet-activated user to an existing draft", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const draft = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      status: "draft",
      assignments: [{ userId: pm.id, projectRole: "PM" }],
    });
    const pending = await seedUser(prisma, { buId: bu.id, isActive: false });

    const agent = await authenticateAs(app, pm.email);
    await agent
      .post(`/api/projects/${draft.id}/assignments`)
      .send({ userId: pending.id, projectRole: "iOS Dev", billRate: 150, costRate: 80 })
      .expect(201);

    const a = await prisma.resourceAssignment.findFirst({
      where: { projectId: draft.id, userId: pending.id },
    });
    expect(a).not.toBeNull();
  });

  it("PUT /:id replaces a draft's plan (details, resources, hours)", async () => {
    const { pm, body, bu } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const created = await agent.post("/api/projects").send(body).expect(201);
    const projectId = created.body.projectId;

    const other = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });

    const res = await agent.put(`/api/projects/${projectId}`).send({
      ...body,
      name: "Renamed Draft",
      contingencyPct: 0.2,
      assignments: [
        { userId: pm.id, projectRole: "PM", billRate: 200, costRate: 100 },
        { userId: other.id, projectRole: "iOS Dev", billRate: 150, costRate: 80 },
      ],
      plannedHours: [{ userId: other.id, projectWeek: 0, plannedHours: 10 }],
    });
    expect(res.status).toBe(200);

    const proj = await prisma.project.findUnique({ where: { id: projectId } });
    expect(proj?.name).toBe("Renamed Draft");
    expect(Number(proj?.contingencyPct)).toBeCloseTo(0.2);
    expect(proj?.status).toBe("draft"); // still a draft
    expect(proj?.projectCode).toBe(body.projectCode); // code preserved

    const assignments = await prisma.resourceAssignment.findMany({ where: { projectId } });
    expect(assignments).toHaveLength(2);
    const otherAssignment = assignments.find((a) => a.userId === other.id);
    expect(otherAssignment).toBeTruthy();
    const he = await prisma.hourEntry.findFirst({
      where: { assignmentId: otherAssignment!.id, projectWeek: 0 },
    });
    expect(he?.plannedHours == null ? null : Number(he.plannedHours)).toBe(10);
  });

  it("exposes approvalFinancials to a draft approver even without financial access", async () => {
    const { pm, body, bu } = await basePayload(prisma);
    const pmAgent = await authenticateAs(app, pm.email);
    const created = await pmAgent.post("/api/projects").send(body).expect(201);
    const projectId = created.body.projectId;

    // An AA WITHOUT the financialAccess flag: general financials are stripped
    // for them, but the approval mandate still surfaces the plan's economics.
    const auditor = await seedUser(prisma, { buId: bu.id, roles: ["AA"], financialAccess: false });
    const aaAgent = await authenticateAs(app, auditor.email);
    const res = await aaAgent.get(`/api/projects/${projectId}`).expect(200);

    expect(res.body.capabilities.canApproveDraft).toBe(true);
    expect(res.body.approvalFinancials).toBeTruthy();
    expect(typeof res.body.approvalFinancials.marginPct).toBe("number");
    expect(typeof res.body.approvalFinancials.belowTarget).toBe("boolean");
    // The general stripping stays intact — approvalFinancials is scoped, not a bypass.
    expect(res.body.financials.totalFee).toBeUndefined();

    // The PM owner has no approval mandate → no approvalFinancials.
    const own = await pmAgent.get(`/api/projects/${projectId}`).expect(200);
    expect(own.body.approvalFinancials).toBeUndefined();
  });

  it("baseline drift: comparison reflects plan growth after approval", async () => {
    const { pm, body } = await basePayload(prisma);
    const pmAgent = await authenticateAs(app, pm.email);
    const created = await pmAgent
      .post("/api/projects")
      .send({
        ...body,
        plannedHours: [{ userId: pm.id, projectWeek: 0, plannedHours: 20 }],
      })
      .expect(201);
    const projectId = created.body.projectId;

    // Approval captures the Initial Plan baseline (20h).
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const ap = await aaAgent.post(`/api/projects/${projectId}/approve`);
    expect(ap.status).toBeLessThan(300);

    // Scope creep: bump the planned hours to 30 after activation.
    const a = await prisma.resourceAssignment.findFirst({
      where: { projectId, userId: pm.id },
    });
    await prisma.hourEntry.updateMany({
      where: { assignmentId: a!.id, projectWeek: 0 },
      data: { plannedHours: 30 },
    });

    // AA (financial access) sees hours drift + fee/cost/margin deltas.
    const res = await aaAgent.get(`/api/projects/${projectId}/baseline-comparison`).expect(200);
    expect(res.body.totals.baselineHours).toBe(20);
    expect(res.body.totals.currentHours).toBe(30);
    expect(res.body.totals.hoursDriftPct).toBe(50);
    expect(res.body.totals.baselineFee).toBeDefined();
    const row = res.body.rows.find((r: { userId: string }) => r.userId === pm.id);
    expect(row.change).toBe("kept");
    expect(row.deltaHours).toBe(10);

    // The PM (no financial visibility) still gets the hours story, no money.
    const pmRes = await pmAgent.get(`/api/projects/${projectId}/baseline-comparison`).expect(200);
    expect(pmRes.body.totals.currentHours).toBe(30);
    expect(pmRes.body.totals.baselineFee).toBeUndefined();

    // The list surfaces the same drift signal.
    const list = await aaAgent.get("/api/projects").expect(200);
    const item = list.body.projects.find((x: { id: string }) => x.id === projectId);
    expect(item.hoursDriftPct).toBe(50);
  });

  it("baseline drift: 404 when no baseline has been captured", async () => {
    const { pm, body } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const created = await agent.post("/api/projects").send(body).expect(201);
    await agent.get(`/api/projects/${created.body.projectId}/baseline-comparison`).expect(404);
  });

  it("admin backfill captures baselines for pre-feature non-draft projects", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
    const legacy = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: aa!.id,
      status: "active",
      assignments: [{ userId: aa!.id, projectRole: "AA" }],
    });
    expect(await prisma.planBaseline.findUnique({ where: { projectId: legacy.id } })).toBeNull();

    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await aaAgent.post("/api/admin/backfill-baselines").expect(200);
    expect(res.body.created).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.planBaseline.findUnique({ where: { projectId: legacy.id } })
    ).not.toBeNull();
  });

  it("billing schedule: fee-side offer numbers for a PM, weekly and monthly", async () => {
    const { pm, body } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const created = await agent
      .post("/api/projects")
      .send({
        ...body,
        contingencyPct: 0.15,
        assignments: [{ userId: pm.id, projectRole: "PM", billRate: 200, costRate: 100 }],
        plannedHours: [
          { userId: pm.id, projectWeek: 0, plannedHours: 10 },
          { userId: pm.id, projectWeek: 1, plannedHours: 20 },
        ],
      })
      .expect(201);
    const projectId = created.body.projectId;

    const res = await agent.get(`/api/projects/${projectId}/billing`).expect(200);
    expect(res.body.totals.hours).toBe(30);
    expect(res.body.totals.fee).toBe(6000);
    expect(res.body.totals.contingencyAmt).toBe(900);
    expect(res.body.totals.offerTotal).toBe(6900);
    expect(res.body.totals.blendedRate).toBe(200);
    expect(res.body.weekly).toHaveLength(2);
    expect(res.body.weekly[0]).toMatchObject({ week: 0, hours: 10, fee: 2000, blendedRate: 200 });
    expect(res.body.weekly[1]).toMatchObject({ week: 1, hours: 20, fee: 4000 });
    expect(res.body.monthly.reduce((t: number, m: { hours: number }) => t + m.hours, 0)).toBe(30);
    expect(res.body.monthly.reduce((t: number, m: { fee: number | null }) => t + (m.fee ?? 0), 0)).toBe(6000);
    expect(res.body.team[0]).toMatchObject({ billRate: 200, totalHours: 30, totalFee: 6000 });

    // Fee-side only by design: nothing cost- or margin-shaped in the payload.
    expect(JSON.stringify(res.body)).not.toMatch(/cost/i);
    expect(JSON.stringify(res.body)).not.toMatch(/margin/i);

    // The detail advertises the tab.
    const detail = await agent.get(`/api/projects/${projectId}`).expect(200);
    expect(detail.body.capabilities.canViewBilling).toBe(true);
  });

  it("billing schedule: fixed price carries hours per period, contract as the offer", async () => {
    const { pm, body } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const created = await agent
      .post("/api/projects")
      .send({
        ...body,
        pricingModel: "fixed_price",
        fixedPrice: 9000,
        assignments: [{ userId: pm.id, projectRole: "PM", costRate: 100 }],
        plannedHours: [
          { userId: pm.id, projectWeek: 0, plannedHours: 10 },
          { userId: pm.id, projectWeek: 1, plannedHours: 20 },
        ],
      })
      .expect(201);

    const res = await agent
      .get(`/api/projects/${created.body.projectId}/billing`)
      .expect(200);
    expect(res.body.totals.hours).toBe(30);
    expect(res.body.totals.fee).toBeNull();
    expect(res.body.totals.offerTotal).toBe(9000);
    expect(res.body.totals.blendedRate).toBe(300); // implied: 9000 / 30h
    expect(res.body.weekly[0].fee).toBeNull();
  });

  it("billing schedule: 403 without bill-rate visibility", async () => {
    const { pm, body, bu } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const created = await agent.post("/api/projects").send(body).expect(201);

    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const icAgent = await authenticateAs(app, ic.email);
    await icAgent.get(`/api/projects/${created.body.projectId}/billing`).expect(403);
  });

  it("PUT /:id 409s on a non-draft project", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
    const active = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: aa!.id,
      status: "active",
      assignments: [{ userId: aa!.id, projectRole: "AA" }],
    });
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await agent.put(`/api/projects/${active.id}`).send({
      name: "Nope",
      accountId: account.id,
      owningBuId: bu.id,
      projectCode: active.projectCode,
      startDate: "2026-03-01",
      endDate: "2026-03-29",
      contingencyPct: 0.15,
      pricingModel: "time_and_materials",
      assignments: [{ userId: aa!.id, projectRole: "AA", billRate: 200, costRate: 100 }],
      plannedHours: [],
      saveAsDraft: true,
    });
    expect(res.status).toBe(409);
  });

  it("403 when a PM tries to launch directly (no saveAsDraft)", async () => {
    const { pm, body } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const res = await agent.post("/api/projects").send({ ...body, saveAsDraft: false });
    expect(res.status).toBe(403);
  });

  it("BUL in the owning BU can launch directly (status active)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const agent = await authenticateAs(app, bul.email);
    const res = await agent
      .post("/api/projects")
      .send({
        name: "Direct Launch",
        projectCode: `D-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        accountId: account.id,
        owningBuId: bu.id,
        startDate: "2026-03-01",
        endDate: "2026-03-29",
        contingencyPct: 0.15,
        assignments: [{ userId: bul.id, projectRole: "BUL", billRate: 200, costRate: 100 }],
        plannedHours: [],
        saveAsDraft: false,
      })
      .expect(201);
    expect(res.body.status).toBe("active");
  });

  it("400 when endDate is before startDate", async () => {
    const { pm, body } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const res = await agent
      .post("/api/projects")
      .send({ ...body, startDate: "2026-03-29", endDate: "2026-03-01" });
    expect(res.status).toBe(400);
  });

  it("409 on duplicate project code", async () => {
    const { pm, body } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    await agent.post("/api/projects").send(body).expect(201);
    const res = await agent.post("/api/projects").send(body); // same body, same code
    expect(res.status).toBe(409);
  });

  it("400 when plannedHours references a week outside the project range", async () => {
    const { pm, body } = await basePayload(prisma);
    const agent = await authenticateAs(app, pm.email);
    const res = await agent
      .post("/api/projects")
      .send({
        ...body,
        // Project spans 5 weeks; week 99 is way past the end.
        plannedHours: [{ userId: pm.id, projectWeek: 99, plannedHours: 8 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/out of range/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// Draft approval workflow
// ═══════════════════════════════════════════════════════════════

describe("Draft approval workflow", () => {
  async function seedDraft(
    prisma: PrismaClient,
    opts: { ownerId: string; owningBuId: string; accountId: string }
  ) {
    return seedProject(prisma, {
      accountId: opts.accountId,
      owningBuId: opts.owningBuId,
      createdBy: opts.ownerId,
      status: "draft",
      assignments: [{ userId: opts.ownerId, projectRole: "PM" }],
    });
  }

  it("excludes drafts from the main list but returns them from /drafts", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });

    const draft = await seedDraft(prisma, { ownerId: pm.id, owningBuId: bu.id, accountId: account.id });
    const active = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      status: "active",
      assignments: [{ userId: pm.id, projectRole: "PM" }],
    });

    const agent = await authenticateAs(app, pm.email);

    const list = await agent.get("/api/projects").expect(200);
    const listIds = list.body.projects.map((p: { id: string }) => p.id);
    expect(listIds).toContain(active.id);
    expect(listIds).not.toContain(draft.id);

    const drafts = await agent.get("/api/projects/drafts").expect(200);
    const draftIds = drafts.body.drafts.map((d: { id: string }) => d.id);
    expect(draftIds).toContain(draft.id);
    expect(draftIds).not.toContain(active.id);
  });

  it("403 when a PM tries to approve a draft", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const owner = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const otherPm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const draft = await seedDraft(prisma, { ownerId: owner.id, owningBuId: bu.id, accountId: account.id });

    const agent = await authenticateAs(app, otherPm.email);
    await agent.post(`/api/projects/${draft.id}/approve`).expect(403);

    const inDb = await prisma.project.findUnique({ where: { id: draft.id } });
    expect(inDb?.status).toBe("draft");
  });

  it("owning-BU BUL approves a draft -> active", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const draft = await seedDraft(prisma, { ownerId: pm.id, owningBuId: bu.id, accountId: account.id });

    const agent = await authenticateAs(app, bul.email);
    const res = await agent.post(`/api/projects/${draft.id}/approve`).expect(200);
    expect(res.body.status).toBe("active");

    const inDb = await prisma.project.findUnique({ where: { id: draft.id } });
    expect(inDb?.status).toBe("active");
  });

  it("a BUL can approve their OWN draft (no self-approval restriction)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const draft = await seedDraft(prisma, { ownerId: bul.id, owningBuId: bu.id, accountId: account.id });

    const agent = await authenticateAs(app, bul.email);
    await agent.post(`/api/projects/${draft.id}/approve`).expect(200);

    const inDb = await prisma.project.findUnique({ where: { id: draft.id } });
    expect(inDb?.status).toBe("active");
  });

  it("reject leaves the project a draft", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const draft = await seedDraft(prisma, { ownerId: pm.id, owningBuId: bu.id, accountId: account.id });

    const agent = await authenticateAs(app, bul.email);
    const res = await agent
      .post(`/api/projects/${draft.id}/reject`)
      .send({ reason: "Margins too thin" })
      .expect(200);
    expect(res.body.rejected).toBe(true);

    const inDb = await prisma.project.findUnique({ where: { id: draft.id } });
    expect(inDb?.status).toBe("draft");
  });

  it("owner shares a draft; the reviewer then sees it under /drafts", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const owner = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const peer = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const draft = await seedDraft(prisma, { ownerId: owner.id, owningBuId: bu.id, accountId: account.id });

    const ownerAgent = await authenticateAs(app, owner.email);
    await ownerAgent
      .post(`/api/projects/${draft.id}/reviewers`)
      .send({ userIds: [peer.id] })
      .expect(200);

    const peerAgent = await authenticateAs(app, peer.email);
    const drafts = await peerAgent.get("/api/projects/drafts").expect(200);
    const draftIds = drafts.body.drafts.map((d: { id: string }) => d.id);
    expect(draftIds).toContain(draft.id);
  });

  it("draft owner who is NOT assigned can still modify the draft", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const owner = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const someoneElse = await seedUser(prisma, { buId: bu.id });
    const draft = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: owner.id,
      status: "draft",
      assignments: [{ userId: someoneElse.id, projectRole: "iOS Dev" }], // owner not assigned
    });

    const agent = await authenticateAs(app, owner.email);
    await agent.patch(`/api/projects/${draft.id}`).send({ name: "Revised Name" }).expect(200);

    const inDb = await prisma.project.findUnique({ where: { id: draft.id } });
    expect(inDb?.name).toBe("Revised Name");
  });

  it("PATCH cannot flip a draft to active (activation is approval-only)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const owner = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const draft = await seedDraft(prisma, { ownerId: owner.id, owningBuId: bu.id, accountId: account.id });

    const agent = await authenticateAs(app, owner.email);
    await agent.patch(`/api/projects/${draft.id}`).send({ status: "active" }).expect(400);

    const inDb = await prisma.project.findUnique({ where: { id: draft.id } });
    expect(inDb?.status).toBe("draft");
  });

  it("reject records feedback the owner sees; resubmit clears it (draft never deleted)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const owner = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const draft = await seedDraft(prisma, { ownerId: owner.id, owningBuId: bu.id, accountId: account.id });

    const bulAgent = await authenticateAs(app, bul.email);
    await bulAgent
      .post(`/api/projects/${draft.id}/reject`)
      .send({ reason: "Trim the contingency" })
      .expect(200);

    const ownerAgent = await authenticateAs(app, owner.email);
    let drafts = await ownerAgent.get("/api/projects/drafts").expect(200);
    let mine = drafts.body.drafts.find((d: { id: string }) => d.id === draft.id);
    expect(mine.changesRequested).toBe(true);
    expect(mine.rejectionNote).toBe("Trim the contingency");

    // Draft still exists (reject does not delete).
    const stillThere = await prisma.project.findUnique({ where: { id: draft.id } });
    expect(stillThere?.status).toBe("draft");

    await ownerAgent.post(`/api/projects/${draft.id}/resubmit`).expect(200);
    drafts = await ownerAgent.get("/api/projects/drafts").expect(200);
    mine = drafts.body.drafts.find((d: { id: string }) => d.id === draft.id);
    expect(mine.changesRequested).toBe(false);
    expect(mine.rejectionNote).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// GET /api/projects/:id
// ═══════════════════════════════════════════════════════════════

describe("GET /api/projects/:id", () => {
  it("404 for unknown project id", async () => {
    const bu = await getDefaultBu(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const agent = await authenticateAs(app, pm.email);
    await agent.get("/api/projects/00000000-0000-0000-0000-000000000000").expect(404);
  });

  it("403 for an IC not assigned to the project", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const ic = await seedUser(prisma, { buId: bu.id });
    const otherIc = await seedUser(prisma, { buId: bu.id });

    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      assignments: [{ userId: otherIc.id, projectRole: "iOS Dev" }],
    });

    const agent = await authenticateAs(app, ic.email);
    await agent.get(`/api/projects/${project.id}`).expect(403);
  });

  it("200 with non-financial fields stripped for an assigned IC", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const ic = await seedUser(prisma, { buId: bu.id });

    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      assignments: [{ userId: ic.id, projectRole: "iOS Dev" }],
    });

    const agent = await authenticateAs(app, ic.email);
    const res = await agent.get(`/api/projects/${project.id}`).expect(200);

    // IC should never see fee / cost / rates.
    expect(res.body.project.plannedFee).toBeUndefined();
    expect(res.body.project.plannedCost).toBeUndefined();
    const firstAssignment = res.body.project.assignments?.[0];
    expect(firstAssignment?.billRate).toBeUndefined();
    expect(firstAssignment?.costRate).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Project sharing (TC 4.10 / 5.22)
// ═══════════════════════════════════════════════════════════════

describe("Project sharing", () => {
  async function seedShareScenario() {
    const bu = await getDefaultBu(prisma); // BU-A (owner)
    const buB = await prisma.businessUnit.findUnique({ where: { code: "BU-B" } });
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      assignments: [{ userId: pm.id, projectRole: "PM" }],
    });
    return { bu, buB: buB!, account, bul, pm, project };
  }

  it("BUL shares a project with another BU; it becomes visible to that BU's leader", async () => {
    const { bul, buB, project } = await seedShareScenario();

    const bulAgent = await authenticateAs(app, bul.email);
    const res = await bulAgent.post(`/api/projects/${project.id}/share`).send({ buId: buB.id });
    expect(res.status).toBe(200);
    expect(res.body.sharedWithBus.map((b: { code: string }) => b.code)).toContain("BU-B");

    // A BUL in BU-B can now see the shared project in their list.
    const buBLeader = await seedUser(prisma, { buId: buB.id, roles: ["BUL"] });
    const otherAgent = await authenticateAs(app, buBLeader.email);
    const list = await otherAgent.get("/api/projects").expect(200);
    expect(list.body.projects.map((p: { id: string }) => p.id)).toContain(project.id);
  });

  it("sharing is idempotent", async () => {
    const { bul, buB, project } = await seedShareScenario();
    const bulAgent = await authenticateAs(app, bul.email);
    await bulAgent.post(`/api/projects/${project.id}/share`).send({ buId: buB.id }).expect(200);
    await bulAgent.post(`/api/projects/${project.id}/share`).send({ buId: buB.id }).expect(200);
    const count = await prisma.projectShare.count({ where: { projectId: project.id } });
    expect(count).toBe(1);
  });

  it("400 when sharing with the owning BU", async () => {
    const { bu, bul, project } = await seedShareScenario();
    const bulAgent = await authenticateAs(app, bul.email);
    const res = await bulAgent.post(`/api/projects/${project.id}/share`).send({ buId: bu.id });
    expect(res.status).toBe(400);
  });

  it("unshare removes the share", async () => {
    const { bul, buB, project } = await seedShareScenario();
    const bulAgent = await authenticateAs(app, bul.email);
    await bulAgent.post(`/api/projects/${project.id}/share`).send({ buId: buB.id }).expect(200);
    const res = await bulAgent.delete(`/api/projects/${project.id}/share/${buB.id}`);
    expect(res.status).toBe(200);
    expect(res.body.sharedWithBus).toEqual([]);
    const count = await prisma.projectShare.count({ where: { projectId: project.id } });
    expect(count).toBe(0);
  });

  it("403 when an IC tries to share", async () => {
    const { bu, buB, project } = await seedShareScenario();
    const ic = await seedUser(prisma, { buId: bu.id });
    const icAgent = await authenticateAs(app, ic.email);
    const res = await icAgent.post(`/api/projects/${project.id}/share`).send({ buId: buB.id });
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════
// Assignment business-unit snapshot — stores the BU CODE, not the id
// ═══════════════════════════════════════════════════════════════

describe("Assignment business-unit snapshot", () => {
  it("stores the BU code (not its id) on wizard-created assignments", async () => {
    const bu = await getDefaultBu(prisma); // code "BU-A"
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const member = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, pm.email);

    const res = await agent
      .post("/api/projects")
      .send({
        name: "BU Code Test",
        accountId: account.id,
        owningBuId: bu.id,
        projectCode: "BUCODE-1",
        startDate: "2026-03-01",
        endDate: "2026-03-15",
        contingencyPct: 0.1,
        assignments: [{ userId: member.id, projectRole: "iOS Dev", billRate: 150, costRate: 90 }],
        plannedHours: [],
        saveAsDraft: true,
      })
      .expect(201);

    const a = await prisma.resourceAssignment.findFirst({
      where: { projectId: res.body.projectId, userId: member.id },
    });
    expect(a?.businessUnit).toBe(bu.code);
    expect(a?.businessUnit).not.toBe(bu.id);
  });

  it("stores the BU code when an assignment is added later", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const owner = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const member = await seedUser(prisma, { buId: bu.id });
    // A draft owned by the PM: the owner can add assignments to it.
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: owner.id,
      status: "draft",
    });
    const agent = await authenticateAs(app, owner.email);

    await agent
      .post(`/api/projects/${project.id}/assignments`)
      .send({ userId: member.id, projectRole: "Backend", billRate: 150, costRate: 90 })
      .expect(201);

    const a = await prisma.resourceAssignment.findFirst({
      where: { projectId: project.id, userId: member.id },
    });
    expect(a?.businessUnit).toBe(bu.code);
  });

  it("backfill converts an id-valued business_unit to the BU code (idempotent)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const owner = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const member = await seedUser(prisma, { buId: bu.id });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: owner.id,
      status: "active",
    });
    // Simulate the old bug: store the BU id in business_unit.
    const broken = await prisma.resourceAssignment.create({
      data: {
        projectId: project.id,
        userId: member.id,
        projectRole: "Dev",
        billRate: 100,
        costRate: 50,
        businessUnit: bu.id,
      },
    });

    const sql = `UPDATE "resource_assignments" AS ra SET "business_unit" = bu."code" FROM "business_units" AS bu WHERE ra."business_unit" = bu."id";`;
    await prisma.$executeRawUnsafe(sql);
    const fixed = await prisma.resourceAssignment.findUnique({ where: { id: broken.id } });
    expect(fixed?.businessUnit).toBe(bu.code);

    // Running again changes nothing — values are now codes, not ids.
    await prisma.$executeRawUnsafe(sql);
    const again = await prisma.resourceAssignment.findUnique({ where: { id: broken.id } });
    expect(again?.businessUnit).toBe(bu.code);
  });
});
