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
 * Permanent deletion of projects — including in-flight ones. Deliberately
 * heavyweight: AA or the owning BU's lead only, and the caller must echo the
 * project code (?confirm=). Cascades remove assignments, hours, baselines,
 * shares, and reviewers, so recorded revenue/cost vanish from all overviews.
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

async function seedActiveWithHours() {
  const bu = await getDefaultBu(prisma);
  const account = await getDefaultAccount(prisma);
  const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
  const worker = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
  const project = await seedProject(prisma, {
    accountId: account.id,
    owningBuId: bu.id,
    createdBy: aa!.id,
    assignments: [{ userId: worker.id, projectRole: "Dev", billRate: 180, costRate: 90 }],
    seedHours: { plannedPerWeek: 10, actualPerWeek: 8 },
  });
  return { bu, account, project };
}

describe("DELETE /api/projects/:id", () => {
  it("AA deletes an in-flight project: echo-code required, cascades wipe hours, audit survives", async () => {
    const { project } = await seedActiveWithHours();
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const code = (await prisma.project.findUnique({ where: { id: project.id } }))!.projectCode;

    // Listed before; hours exist.
    const before = await aaAgent.get("/api/projects").expect(200);
    expect(before.body.projects.some((p: { id: string }) => p.id === project.id)).toBe(true);
    const hoursBefore = await prisma.hourEntry.count({
      where: { assignment: { projectId: project.id } },
    });
    expect(hoursBefore).toBeGreaterThan(0);

    // Wrong / missing confirmation is refused.
    await aaAgent.delete(`/api/projects/${project.id}`).expect(400);
    await aaAgent.delete(`/api/projects/${project.id}?confirm=WRONG`).expect(400);

    // Correct echo deletes.
    await aaAgent
      .delete(`/api/projects/${project.id}?confirm=${encodeURIComponent(code)}`)
      .expect(200);

    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
    expect(
      await prisma.hourEntry.count({ where: { assignment: { projectId: project.id } } })
    ).toBe(0);
    const after = await aaAgent.get("/api/projects").expect(200);
    expect(after.body.projects.some((p: { id: string }) => p.id === project.id)).toBe(false);

    // The deletion itself is on the audit trail.
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Project", entityId: project.id, field: "project.deleted" },
    });
    expect(audit).not.toBeNull();
    expect(audit!.oldValue).toContain(code);
  });

  it("owning BUL may delete; a BUL of another BU and a PM may not", async () => {
    const { bu, project } = await seedActiveWithHours();
    const code = (await prisma.project.findUnique({ where: { id: project.id } }))!.projectCode;
    const otherBu = await prisma.businessUnit.upsert({
      where: { code: "ZZ-DEL" },
      update: {},
      create: { code: "ZZ-DEL", name: "Other BU (delete)" },
    });

    const foreignBul = await seedUser(prisma, { buId: otherBu.id, roles: ["BUL"] });
    const foreignAgent = await authenticateAs(app, foreignBul.email);
    await foreignAgent
      .delete(`/api/projects/${project.id}?confirm=${encodeURIComponent(code)}`)
      .expect(403);

    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const pmAgent = await authenticateAs(app, pm.email);
    await pmAgent
      .delete(`/api/projects/${project.id}?confirm=${encodeURIComponent(code)}`)
      .expect(403);

    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const bulAgent = await authenticateAs(app, bul.email);
    await bulAgent
      .delete(`/api/projects/${project.id}?confirm=${encodeURIComponent(code)}`)
      .expect(200);
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
  });
});
