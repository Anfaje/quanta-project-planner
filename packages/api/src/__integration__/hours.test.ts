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
      // The PM is assigned too: project access is assignment-based
      // (canAccessProject grants IC/PM only via assignment, not creation).
      { userId: pm.id, projectRole: "PM" },
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
    expect(Number(entry?.actualHours)).toBe(8);
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
    expect(Number(entry?.actualHours)).toBe(0);
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
    expect(Number(entry?.plannedHours)).toBe(24);
    expect(Number(entry?.actualHours)).toBe(18);
  });

  it("Locked week rejects writes from any role", async () => {
    const { pm, project, icAssignment } = await seedScenario();
    // Lock week 0 directly in the DB.
    await prisma.hourEntry.updateMany({
      where: { assignment: { projectId: project.id }, projectWeek: 0 },
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
    expect(Number(entry?.actualHours)).not.toBe(99);
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
      where: { assignment: { projectId: project.id }, projectWeek: 0 },
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
      where: { entityType: "HourEntry", field: "locked" },
      orderBy: { changedAt: "desc" },
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
    expect(filled.every((e) => Number(e.actualHours ?? 0) > 0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/projects/:id/hours/import (CSV bulk import)
// ═══════════════════════════════════════════════════════════════

describe("POST /api/projects/:id/hours/import", () => {
  // Seeded users all share the name "Test User", so the CSV matches by
  // email (which is unique per user) — the import accepts either.
  it("PM imports a valid CSV and the actuals land", async () => {
    const { pm, ic, project, icAssignment } = await seedScenario();
    const csv = ["Resource,W1,W2,W3,W4", `${ic.email},8,7.5,8,0`].join("\n");

    const agent = await authenticateAs(app, pm.email);
    const res = await agent.post(`/api/projects/${project.id}/hours/import`).send({ csv });

    expect(res.status).toBe(200);
    expect(res.body.cellsUpdated).toBe(3); // W4=0 equals the seeded 0 → no-op
    expect(res.body.unmatched).toEqual([]);

    const entries = await prisma.hourEntry.findMany({
      where: { assignmentId: icAssignment.id, projectWeek: { in: [0, 1, 2] } },
      orderBy: { projectWeek: "asc" },
    });
    expect(entries.map((e) => Number(e.actualHours))).toEqual([
      8, 7.5, 8,
    ]);
  });

  it("reports unmatched resource names but still applies the matched rows (TC 3.18)", async () => {
    const { pm, ic, project, icAssignment } = await seedScenario();
    const csv = [
      "Resource,W1,W2",
      "Mxispelled Name,40,40", // no such resource
      `${ic.email},8,8`,
    ].join("\n");

    const agent = await authenticateAs(app, pm.email);
    const res = await agent.post(`/api/projects/${project.id}/hours/import`).send({ csv });

    expect(res.status).toBe(200);
    expect(res.body.unmatched).toContain("Mxispelled Name");
    expect(res.body.cellsUpdated).toBe(2);

    const entry = await prisma.hourEntry.findFirst({
      where: { assignmentId: icAssignment.id, projectWeek: 0 },
    });
    expect(Number(entry?.actualHours)).toBe(8);
  });

  it("ignores week columns outside the project span", async () => {
    const { pm, ic, project } = await seedScenario(); // 4 weeks → W5 is out of range
    const csv = ["Resource,W1,W5", `${ic.email},8,99`].join("\n");

    const agent = await authenticateAs(app, pm.email);
    const res = await agent.post(`/api/projects/${project.id}/hours/import`).send({ csv });

    expect(res.status).toBe(200);
    expect(res.body.weeksOutOfRange).toContain("W5");
    expect(res.body.cellsUpdated).toBe(1); // only W1 applied
  });

  it("skips locked cells and reports them rather than failing", async () => {
    const { pm, ic, project, icAssignment } = await seedScenario();
    await prisma.hourEntry.updateMany({
      where: { assignmentId: icAssignment.id, projectWeek: 0 },
      data: { locked: true },
    });
    const csv = ["Resource,W1,W2", `${ic.email},8,8`].join("\n");

    const agent = await authenticateAs(app, pm.email);
    const res = await agent.post(`/api/projects/${project.id}/hours/import`).send({ csv });

    expect(res.status).toBe(200);
    expect(res.body.skippedLocked.length).toBe(1);
    expect(res.body.cellsUpdated).toBe(1); // only the unlocked W2

    const locked = await prisma.hourEntry.findFirst({
      where: { assignmentId: icAssignment.id, projectWeek: 0 },
    });
    expect(Number(locked?.actualHours)).toBe(0); // untouched
  });

  it("403 when an IC tries to import", async () => {
    const { ic, project } = await seedScenario();
    const csv = ["Resource,W1", `${ic.email},8`].join("\n");

    const agent = await authenticateAs(app, ic.email);
    const res = await agent.post(`/api/projects/${project.id}/hours/import`).send({ csv });
    expect(res.status).toBe(403);
  });

  it("matches resources by name with quoted fields and UTF-8 (TC 8.6)", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const named = await seedUser(prisma, { buId: bu.id, name: "Zoë Çelik" });
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: pm.id,
      totalWeeks: 2,
      assignments: [{ userId: named.id, projectRole: "iOS Dev" }],
      seedHours: { plannedPerWeek: 10, actualPerWeek: 0 },
    });
    // Quoted because of the accent-free comma-safety + exercising the parser.
    const csv = ['Resource,W1,W2', '"Zoë Çelik",6,6'].join("\n");

    const agent = await authenticateAs(app, pm.email);
    const res = await agent.post(`/api/projects/${project.id}/hours/import`).send({ csv });

    expect(res.status).toBe(200);
    expect(res.body.unmatched).toEqual([]);
    expect(res.body.cellsUpdated).toBe(2);
  });
});
