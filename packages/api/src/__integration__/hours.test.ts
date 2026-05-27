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
 * Hours route integration tests.
 *
 * The week-lock guard and IC own-row restriction are the most important
 * permission gates in the system (they're how we prevent ICs from
 * inflating their own hours retroactively after a week is closed). Verify
 * the gates at the HTTP layer, not just the service layer.
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

/**
 * Helper: seeds the standard "PM + IC + another IC on one project" world.
 * Returns the ids you'd want to assert against.
 */
async function seedScenario() {
  const bu = await getDefaultBu(prisma);
  const account = await getDefaultAccount(prisma);
  const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
  const ic = await seedUser(prisma, { buId: bu.id });
  const otherIc = await seedUser(prisma, { buId: bu.id });

  const project = await seedProject(prisma, {
    accountId: account.id,
    owningBuId: bu.id,
    createdBy: pm.id,
    totalWeeks: 4,
    assignments: [
      { userId: ic.id, projectRole: "iOS Dev" },
      { userId: otherIc.id, projectRole: "Android Dev" },
    ],
    seedHours: { plannedPerWeek: 20, actualPerWeek: 0 },
  });

  // Look up the assignment IDs that seedProject just created.
  const assignments = await prisma.resourceAssignment.findMany({
    where: { projectId: project.id },
    select: { id: true, userId: true },
  });
  const icAssignment = assignments.find((a: { userId: string }) => a.userId === ic.id)!;
  const otherIcAssignment = assignments.find((a: { userId: string }) => a.userId === otherIc.id)!;

  return { bu, account, pm, ic, otherIc, project, icAssignment, otherIcAssignment };
}

// ═══════════════════════════════════════════════════════════════
// PUT /api/projects/:id/hours
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/projects/:id/hours", () => {
  it("IC can update actual hours on their own row", async () => {
    const { ic, project, icAssignment } = await seedScenario();
    const agent = await authenticateAs(app, ic.email);

    const res = await agent.put(`/api/projects/${project.id}/hours`).send({
      updates: [{ assignmentId: icAssignment.id, projectWeek: 0, actualHours: 8 }],
    });
    expect(res.status).toBe(200);

    const entry = await prisma.hourEntry.findFirst({
      where: { assignmentId: icAssignment.id, projectWeek: 0 },
    });
    expect(entry?.actualHours).toBe(8);
  });

  it("IC cannot edit someone else's actual hours", async () => {
    const { ic, project, otherIcAssignment } = await seedScenario();
    const agent = await authenticateAs(app, ic.email);

    const res = await agent.put(`/api/projects/${project.id}/hours`).send({
      updates: [{ assignmentId: otherIcAssignment.id, projectWeek: 0, actualHours: 8 }],
    });
    expect(res.status).toBe(403);

    // And nothing was written.
    const entry = await prisma.hourEntry.findFirst({
      where: { assignmentId: otherIcAssignment.id, projectWeek: 0 },
    });
    expect(entry?.actualHours).toBe(0);
  });

  it("IC cannot edit planned hours even on their own row", async () => {
    const { ic, project, icAssignment } = await seedScenario();
    const agent = await authenticateAs(app, ic.email);

    const res = await agent.put(`/api/projects/${project.id}/hours`).send({
      updates: [{ assignmentId: icAssignment.id, projectWeek: 0, plannedHours: 40 }],
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/planned hours/i);
  });

  it("PM can update both planned and actual hours", async () => {
    const { pm, project, icAssignment } = await seedScenario();
    const agent = await authenticateAs(app, pm.email);

    const res = await agent.put(`/api/projects/${project.id}/hours`).send({
      updates: [
        { assignmentId: icAssignment.id, projectWeek: 0, plannedHours: 24, actualHours: 18 },
      ],
    });
    expect(res.status).toBe(200);

    const entry = await prisma.hourEntry.findFirst({
      where: { assignmentId: icAssignment.id, projectWeek: 0 },
    });
    expect(entry?.plannedHours).toBe(24);
    expect(entry?.actualHours).toBe(18);
  });

  it("Locked week rejects writes from any role", async () => {
    const { pm, project, icAssignment } = await seedScenario();
    // Lock week 0 directly in the DB.
    await prisma.hourEntry.updateMany({
      where: { projectId: project.id, projectWeek: 0 },
      data: { locked: true },
    });

    const agent = await authenticateAs(app, pm.email);
    const res = await agent.put(`/api/projects/${project.id}/hours`).send({
      updates: [{ assignmentId: icAssignment.id, projectWeek: 0, actualHours: 99 }],
    });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const entry = await prisma.hourEntry.findFirst({
      where: { assignmentId: icAssignment.id, projectWeek: 0 },
    });
    expect(entry?.actualHours).not.toBe(99);
  });
});

// ═══════════════════════════════════════════════════════════════
// Week lock / unlock
// ═══════════════════════════════════════════════════════════════

describe("POST /api/projects/:id/weeks/:week/lock + /unlock", () => {
  it("PM can lock a week, IC cannot", async () => {
    const { ic, pm, project } = await seedScenario();

    // IC: denied
    const icAgent = await authenticateAs(app, ic.email);
    await icAgent.post(`/api/projects/${project.id}/weeks/0/lock`).expect(403);

    // PM: ok
    const pmAgent = await authenticateAs(app, pm.email);
    await pmAgent.post(`/api/projects/${project.id}/weeks/0/lock`).expect(200);

    const entries = await prisma.hourEntry.findMany({
      where: { projectId: project.id, projectWeek: 0 },
    });
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e: { locked: boolean }) => e.locked)).toBe(true);
  });

  it("Unlock with reason writes the reason to audit log", async () => {
    const { pm, project } = await seedScenario();
    const agent = await authenticateAs(app, pm.email);

    await agent.post(`/api/projects/${project.id}/weeks/0/lock`).expect(200);
    await agent
      .post(`/api/projects/${project.id}/weeks/0/unlock`)
      .send({ reason: "Client requested late timesheet correction" })
      .expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Project", action: "unlock_week" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.newValue).toContain("Client requested");
  });
});

// ═══════════════════════════════════════════════════════════════
// Fill-remaining
// ═══════════════════════════════════════════════════════════════

describe("POST /api/projects/:id/weeks/:week/fill-remaining", () => {
  it("PM can spread remaining-budget evenly across unlocked weeks", async () => {
    const { pm, project, icAssignment } = await seedScenario();
    // First, set actual hours on weeks 0..1 to consume some budget; planned is 20/wk.
    await prisma.hourEntry.updateMany({
      where: { assignmentId: icAssignment.id, projectWeek: { in: [0, 1] } },
      data: { actualHours: 10 },
    });

    const agent = await authenticateAs(app, pm.email);
    const res = await agent
      .post(`/api/projects/${project.id}/weeks/2/fill-remaining`)
      .send({ assignmentId: icAssignment.id });
    expect(res.status).toBe(200);

    // Weeks 2..3 should each have a value > 0 written.
    const filled = await prisma.hourEntry.findMany({
      where: { assignmentId: icAssignment.id, projectWeek: { gte: 2 } },
      orderBy: { projectWeek: "asc" },
    });
    expect(filled.length).toBe(2);
    expect(filled.every((e: { actualHours: number | null }) => (e.actualHours ?? 0) > 0)).toBe(true);
  });
});
