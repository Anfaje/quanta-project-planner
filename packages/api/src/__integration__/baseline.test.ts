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

describe("Plan baseline (Initial Plan)", () => {
  it("captures a baseline when a draft is approved, snapshotting the planned plan", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      status: "draft",
      assignments: [{ userId: ic.id, projectRole: "Engineer", billRate: 200, costRate: 100 }],
      seedHours: { plannedPerWeek: 10 },
      totalWeeks: 4,
    });

    const aa = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    await aa.post(`/api/projects/${project.id}/approve`).expect(200);

    const baseline = await prisma.planBaseline.findUnique({ where: { projectId: project.id } });
    expect(baseline).not.toBeNull();
    const snap = baseline!.snapshot as any;
    expect(snap.capturedAtStatus).toBe("active");
    expect(snap.contingencyPct).toBe(0.15);
    expect(snap.assignments).toHaveLength(1);
    expect(snap.assignments[0].userId).toBe(ic.id);
    expect(snap.assignments[0].billRate).toBe(200);
    expect(snap.assignments[0].plannedHours).toBe(40); // 10/wk × 4 weeks
    expect(snap.assignments[0].weekly).toHaveLength(4);
  });

  it("captures a baseline when a project is launched directly (not saved as draft)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const agent = await authenticateAs(app, bul.email);

    const res = await agent
      .post("/api/projects")
      .send({
        name: "Launched Project",
        projectCode: `LAU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        accountId: account.id,
        owningBuId: bu.id,
        startDate: "2026-03-01",
        endDate: "2026-03-29",
        contingencyPct: 0.15,
        assignments: [{ userId: ic.id, projectRole: "Engineer", billRate: 200, costRate: 100 }],
        plannedHours: [],
        saveAsDraft: false,
      })
      .expect(201);

    const baseline = await prisma.planBaseline.findUnique({
      where: { projectId: res.body.projectId },
    });
    expect(baseline).not.toBeNull();
    const snap = baseline!.snapshot as any;
    expect(snap.capturedAtStatus).toBe("active");
    expect(snap.assignments).toHaveLength(1);
    expect(snap.assignments[0].userId).toBe(ic.id);
  });

  it("does NOT capture a baseline for a project saved as a draft", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const agent = await authenticateAs(app, pm.email);

    const res = await agent
      .post("/api/projects")
      .send({
        name: "Just a Draft",
        projectCode: `DR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        accountId: account.id,
        owningBuId: bu.id,
        startDate: "2026-03-01",
        endDate: "2026-03-29",
        contingencyPct: 0.15,
        assignments: [{ userId: pm.id, projectRole: "PM", billRate: 200, costRate: 100 }],
        plannedHours: [],
        saveAsDraft: true,
      })
      .expect(201);

    const baseline = await prisma.planBaseline.findUnique({
      where: { projectId: res.body.projectId },
    });
    expect(baseline).toBeNull();
  });

  it("is immutable — re-approving does not replace the captured baseline", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      status: "draft",
      assignments: [{ userId: ic.id, projectRole: "Engineer" }],
      seedHours: { plannedPerWeek: 5 },
      totalWeeks: 4,
    });

    const aa = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    await aa.post(`/api/projects/${project.id}/approve`).expect(200);
    const first = await prisma.planBaseline.findUnique({ where: { projectId: project.id } });
    expect(first).not.toBeNull();

    // Re-approving an already-active project is rejected; the baseline must persist unchanged.
    await aa.post(`/api/projects/${project.id}/approve`).expect(409);
    const second = await prisma.planBaseline.findUnique({ where: { projectId: project.id } });
    expect(second!.id).toBe(first!.id);
    expect(second!.capturedAt.getTime()).toBe(first!.capturedAt.getTime());
  });

  it("exposes the baseline (capturedAt) in the project detail payload", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });

    // A seeded (pre-feature) active project has no baseline.
    const noBaseline = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      status: "active",
      assignments: [{ userId: ic.id, projectRole: "Engineer" }],
    });
    const aa = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const before = await aa.get(`/api/projects/${noBaseline.id}`).expect(200);
    expect(before.body.project.baseline).toBeNull();

    // After launch via approval, the baseline shows up.
    const draft = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      status: "draft",
      assignments: [{ userId: ic.id, projectRole: "Engineer" }],
      seedHours: { plannedPerWeek: 5 },
      totalWeeks: 4,
    });
    await aa.post(`/api/projects/${draft.id}/approve`).expect(200);
    const after = await aa.get(`/api/projects/${draft.id}`).expect(200);
    expect(after.body.project.baseline).not.toBeNull();
    expect(after.body.project.baseline.capturedAt).toBeDefined();
  });
});

describe("Plan lock on completion", () => {
  async function completeProject() {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      status: "complete",
      assignments: [{ userId: ic.id, projectRole: "Engineer" }],
      seedHours: { plannedPerWeek: 5, actualPerWeek: 4 },
      totalWeeks: 4,
    });
    return { bu, account, pm, ic, project };
  }

  it("blocks editing hours on a complete project (409)", async () => {
    const { pm, project } = await completeProject();
    const assignment = await prisma.resourceAssignment.findFirst({
      where: { projectId: project.id },
    });
    const agent = await authenticateAs(app, pm.email);
    const res = await agent
      .put(`/api/projects/${project.id}/hours`)
      .send({ updates: [{ assignmentId: assignment!.id, projectWeek: 0, plannedHours: 99 }] });
    expect(res.status).toBe(409);
  });

  it("blocks adding an assignment to a complete project (409)", async () => {
    const { bu, pm, project } = await completeProject();
    const other = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const agent = await authenticateAs(app, pm.email);
    const res = await agent
      .post(`/api/projects/${project.id}/assignments`)
      .send({ userId: other.id, projectRole: "Engineer", billRate: 175, costRate: 90 });
    expect(res.status).toBe(409);
  });

  it("blocks plan-field edits but allows reopening a complete project", async () => {
    const { pm, project } = await completeProject();
    const agent = await authenticateAs(app, pm.email);

    // Editing the plan (contingency) on a complete project is blocked.
    await agent.patch(`/api/projects/${project.id}`).send({ contingencyPct: 0.2 }).expect(409);

    // A status-only change (reopen) is allowed and unlocks the plan.
    await agent.patch(`/api/projects/${project.id}`).send({ status: "active" }).expect(200);
    const reopened = await prisma.project.findUnique({ where: { id: project.id } });
    expect(reopened?.status).toBe("active");
  });
});
