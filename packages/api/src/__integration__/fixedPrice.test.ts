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
} from "./helpers";

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

function uniqueCode(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

describe("Fixed-price project creation", () => {
  it("launches a fixed-price project: stores price, zeroes contingency, nulls bill rates, baselines it", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const agent = await authenticateAs(app, bul.email);

    const res = await agent
      .post("/api/projects")
      .send({
        name: "Fixed Bid Build",
        projectCode: uniqueCode("FP"),
        accountId: account.id,
        owningBuId: bu.id,
        startDate: "2026-03-01",
        endDate: "2026-03-29",
        pricingModel: "fixed_price",
        fixedPrice: 100000,
        assignments: [{ userId: ic.id, projectRole: "Engineer", costRate: 100 }], // no billRate
        plannedHours: [],
        saveAsDraft: false,
      })
      .expect(201);

    const project = await prisma.project.findUnique({ where: { id: res.body.projectId } });
    expect(project?.pricingModel).toBe("fixed_price");
    expect(Number(project?.fixedPrice)).toBe(100000);
    expect(Number(project?.contingencyPct)).toBe(0);

    const assignment = await prisma.resourceAssignment.findFirst({
      where: { projectId: res.body.projectId },
    });
    expect(assignment?.billRate).toBeNull();

    // Launched → Initial Plan baseline captured, recording the pricing.
    const baseline = await prisma.planBaseline.findUnique({
      where: { projectId: res.body.projectId },
    });
    expect(baseline).not.toBeNull();
    const snap = baseline!.snapshot as any;
    expect(snap.pricingModel).toBe("fixed_price");
    expect(snap.fixedPrice).toBe(100000);
    expect(snap.assignments[0].billRate).toBeNull();
  });

  it("rejects a fixed-price project with no contract value (400)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const agent = await authenticateAs(app, bul.email);

    const res = await agent.post("/api/projects").send({
      name: "No Price",
      projectCode: uniqueCode("FP"),
      accountId: account.id,
      owningBuId: bu.id,
      startDate: "2026-03-01",
      endDate: "2026-03-29",
      pricingModel: "fixed_price",
      assignments: [{ userId: ic.id, projectRole: "Engineer", costRate: 100 }],
      plannedHours: [],
      saveAsDraft: false,
    });
    expect(res.status).toBe(400);
  });

  it("rejects a T&M project whose resource is missing a bill rate (400)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const agent = await authenticateAs(app, bul.email);

    const res = await agent.post("/api/projects").send({
      name: "Missing Bill Rate",
      projectCode: uniqueCode("TM"),
      accountId: account.id,
      owningBuId: bu.id,
      startDate: "2026-03-01",
      endDate: "2026-03-29",
      pricingModel: "time_and_materials",
      assignments: [{ userId: ic.id, projectRole: "Engineer", costRate: 100 }], // no billRate
      plannedHours: [],
      saveAsDraft: false,
    });
    expect(res.status).toBe(400);
  });
});

describe("Fixed-price financials", () => {
  it("reports the contract value as revenue, margin = price − cost, no contingency", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: bul.id,
      status: "active",
      pricingModel: "fixed_price",
      fixedPrice: 100000,
      assignments: [{ userId: ic.id, projectRole: "Engineer", costRate: 100 }],
      seedHours: { plannedPerWeek: 10 },
      totalWeeks: 4,
    });

    const agent = await authenticateAs(app, bul.email);
    const res = await agent.get(`/api/projects/${project.id}`).expect(200);

    expect(res.body.project.pricingModel).toBe("fixed_price");
    expect(res.body.financials.totalFee).toBe(100000);
    expect(res.body.financials.fixedPrice).toBe(100000);
    expect(res.body.financials.contingencyAmt).toBe(0);
    expect(res.body.financials.totalCost).toBe(4000); // 4wk × 10h × $100
    expect(res.body.financials.marginPct).toBe(96); // (100000-4000)/100000
  });
});

describe("Fixed-price lifecycle rules", () => {
  it("allows editing the contract value but rejects contingency edits on a fixed-price project", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: bul.id,
      status: "active",
      pricingModel: "fixed_price",
      fixedPrice: 100000,
      assignments: [{ userId: ic.id, projectRole: "Engineer", costRate: 100 }],
    });
    const agent = await authenticateAs(app, bul.email);

    await agent.patch(`/api/projects/${project.id}`).send({ fixedPrice: 120000 }).expect(200);
    const updated = await prisma.project.findUnique({ where: { id: project.id } });
    expect(Number(updated?.fixedPrice)).toBe(120000);

    await agent.patch(`/api/projects/${project.id}`).send({ contingencyPct: 0.2 }).expect(400);
  });

  it("rejects setting a contract value on a T&M project (400)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: bul.id,
      status: "active",
      assignments: [{ userId: ic.id, projectRole: "Engineer", billRate: 200, costRate: 100 }],
    });
    const agent = await authenticateAs(app, bul.email);
    await agent.patch(`/api/projects/${project.id}`).send({ fixedPrice: 50000 }).expect(400);
  });

  it("adds a resource without a bill rate to a fixed-price project, but requires one for T&M", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });

    const fixed = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: bul.id,
      status: "active",
      pricingModel: "fixed_price",
      fixedPrice: 100000,
      assignments: [{ userId: ic.id, projectRole: "Engineer", costRate: 100 }],
    });
    const tm = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: bul.id,
      status: "active",
      assignments: [{ userId: ic.id, projectRole: "Engineer", billRate: 200, costRate: 100 }],
    });

    const agent = await authenticateAs(app, bul.email);
    const newbie = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });

    // Fixed-price: no bill rate needed.
    await agent
      .post(`/api/projects/${fixed.id}/assignments`)
      .send({ userId: newbie.id, projectRole: "Engineer", costRate: 90 })
      .expect(201);
    const added = await prisma.resourceAssignment.findUnique({
      where: { projectId_userId: { projectId: fixed.id, userId: newbie.id } },
    });
    expect(added?.billRate).toBeNull();

    // T&M: bill rate required.
    await agent
      .post(`/api/projects/${tm.id}/assignments`)
      .send({ userId: newbie.id, projectRole: "Engineer", costRate: 90 })
      .expect(400);
  });
});
