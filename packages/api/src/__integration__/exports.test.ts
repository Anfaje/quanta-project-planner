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
 * Export route integration tests.
 *
 * The financial serialiser is unit-tested but the integration question is
 * whether the export routes actually pipe their data through it. These
 * tests verify the visible field set per role, then assert the CSV body
 * column-by-column.
 *
 * PDF is checked for "200, content-type PDF, non-zero length" — assertion
 * against the binary payload would be brittle, and the financial-field
 * suppression for ICs is exercised at the data layer feeding both formats.
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

async function seedExportScenario() {
  const bu = await getDefaultBu(prisma);
  const account = await getDefaultAccount(prisma);
  const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
  const ic = await seedUser(prisma, { buId: bu.id });
  const project = await seedProject(prisma, {
    accountId: account.id,
    owningBuId: bu.id,
    createdBy: pm.id,
    assignments: [
      { userId: pm.id, projectRole: "PM" },
      { userId: ic.id, projectRole: "iOS Dev", billRate: 175, costRate: 90 },
    ],
    seedHours: { plannedPerWeek: 20, actualPerWeek: 10 },
  });
  return { bu, account, pm, ic, project };
}

describe("GET /api/projects/:id/export.csv", () => {
  it("IC export omits fee, cost, and rate columns", async () => {
    const { ic, project } = await seedExportScenario();
    const agent = await authenticateAs(app, ic.email);
    const res = await agent.get(`/api/projects/${project.id}/export.csv`).expect(200);

    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    const csv = res.text.toLowerCase();
    expect(csv).not.toMatch(/bill.?rate|cost.?rate/);
    expect(csv).not.toMatch(/planned.?fee|actual.?fee/);
    expect(csv).not.toMatch(/planned.?cost|actual.?cost/);
    // Hours columns should still be present.
    expect(csv).toMatch(/planned.?hours/);
    expect(csv).toMatch(/actual.?hours/);
  });

  it("AA export includes financial columns", async () => {
    const { project } = await seedExportScenario();
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await agent.get(`/api/projects/${project.id}/export.csv`).expect(200);

    const csv = res.text.toLowerCase();
    expect(csv).toMatch(/bill.?rate/);
    expect(csv).toMatch(/cost.?rate/);
  });
});

describe("GET /api/projects/:id/export.pdf", () => {
  it("returns 200 with a non-empty PDF body for an authorised viewer", async () => {
    const { pm, project } = await seedExportScenario();
    const agent = await authenticateAs(app, pm.email);
    const res = await agent.get(`/api/projects/${project.id}/export.pdf`).expect(200);

    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(100); // non-trivial PDF
    // First four bytes of any valid PDF.
    expect(res.body.slice(0, 4).toString()).toBe("%PDF");
  });

  it("403 for someone with no access to the project", async () => {
    const bu = await getDefaultBu(prisma);
    const { project } = await seedExportScenario();
    const stranger = await seedUser(prisma, { buId: bu.id }); // not assigned
    const agent = await authenticateAs(app, stranger.email);
    await agent.get(`/api/projects/${project.id}/export.pdf`).expect(403);
  });
});
