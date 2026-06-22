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
