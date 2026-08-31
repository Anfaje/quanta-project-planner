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
 * Per-BU target margin: BusinessUnit.targetMarginPct (percent, default 35)
 * drives the BU-health dashboard comparison and the below-target flag on the
 * BU's projects. Editable by AA (any BU) and a BUL (their own BU only).
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
  // Targets are mutated by these tests; restore the default.
  await prisma.businessUnit.updateMany({ data: { targetMarginPct: 35 } });
});

describe("BU target margin", () => {
  it("AA sets any BU's target; it round-trips through GET /bus", async () => {
    const bu = await getDefaultBu(prisma);
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const patched = await aaAgent
      .patch(`/api/admin/bus/${bu.id}`)
      .send({ targetMarginPct: 42 })
      .expect(200);
    expect(patched.body.targetMarginPct).toBe(42);

    const list = await aaAgent.get("/api/admin/bus").expect(200);
    const row = list.body.businessUnits.find((b: { id: string }) => b.id === bu.id);
    expect(row.targetMarginPct).toBe(42);
  });

  it("a BUL sets their own BU's target but not another BU's; others get 403; bounds are validated", async () => {
    const bu = await getDefaultBu(prisma);
    const otherBu = await prisma.businessUnit.upsert({
      where: { code: "ZZ-TGT" },
      update: {},
      create: { code: "ZZ-TGT", name: "Other BU (targets)" },
    });
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const bulAgent = await authenticateAs(app, bul.email);

    await bulAgent.patch(`/api/admin/bus/${bu.id}`).send({ targetMarginPct: 40 }).expect(200);
    await bulAgent.patch(`/api/admin/bus/${otherBu.id}`).send({ targetMarginPct: 40 }).expect(403);
    await bulAgent.patch(`/api/admin/bus/${bu.id}`).send({ targetMarginPct: 150 }).expect(400);

    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const pmAgent = await authenticateAs(app, pm.email);
    await pmAgent.patch(`/api/admin/bus/${bu.id}`).send({ targetMarginPct: 40 }).expect(403);
  });

  it("the below-target flag on project detail follows the owning BU's target", async () => {
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
    const worker = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    // billRate 200 / costRate 100 → ~50% planned margin. Drafts carry the
    // belowTarget flag on detail (it powers the approval hint).
    const project = await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: aa!.id,
      status: "draft",
      assignments: [{ userId: worker.id, projectRole: "Dev", billRate: 200, costRate: 100 }],
      seedHours: { plannedPerWeek: 10, actualPerWeek: 0 },
    });
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);

    // Default target (35%): a 50%-margin project is fine.
    let detail = await aaAgent.get(`/api/projects/${project.id}`).expect(200);
    expect(detail.body.financials.belowTarget).toBe(false);
    expect(detail.body.financials.targetMarginPct).toBe(35);

    // Raise the BU's bar above the project's margin: the flag flips.
    await aaAgent.patch(`/api/admin/bus/${bu.id}`).send({ targetMarginPct: 60 }).expect(200);
    detail = await aaAgent.get(`/api/projects/${project.id}`).expect(200);
    expect(detail.body.financials.belowTarget).toBe(true);
    expect(detail.body.financials.targetMarginPct).toBe(60);
  });

  it("the BU-health dashboard reports the BU's own target", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"], financialAccess: true });
    const bulAgent = await authenticateAs(app, bul.email);
    await bulAgent.patch(`/api/admin/bus/${bu.id}`).send({ targetMarginPct: 44 }).expect(200);

    const dash = await bulAgent.get("/api/dashboard").expect(200);
    expect(dash.body.buHealth?.marginTargetPct).toBe(44);
  });
});
