import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  setupTestApp,
  teardownTestApp,
  resetMutableTables,
  seedUser,
  authenticateAs,
  getDefaultBu,
  TEST_DOMAIN,
} from "./helpers";

/**
 * Dashboard route integration tests.
 *
 * The dashboard is unique because the API picks which sections to return
 * based on the caller's role union. These tests confirm the wiring between
 * `getDashboardSections` (unit-tested in Drop 2) and the actual HTTP
 * response — proving the route invokes the resolver and returns matching
 * payload blocks for each section.
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

describe("GET /api/dashboard", () => {
  it("401 without a session", async () => {
    const request = await import("supertest").then((m) => m.default);
    await request(app).get("/api/dashboard").expect(401);
  });

  it("IC sees my_hours and nothing else", async () => {
    const bu = await getDefaultBu(prisma);
    const ic = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, ic.email);
    const res = await agent.get("/api/dashboard").expect(200);

    expect(res.body.sections).toContain("my_hours");
    expect(res.body.sections).not.toContain("platform_admin");
    expect(res.body.sections).not.toContain("bu_health");
    expect(res.body.myHours).toBeDefined();
  });

  it("PM sees project_health", async () => {
    const bu = await getDefaultBu(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const agent = await authenticateAs(app, pm.email);
    const res = await agent.get("/api/dashboard").expect(200);

    expect(res.body.sections).toContain("project_health");
    expect(res.body.projectHealth).toBeDefined();
  });

  it("BUL sees bu_health, scoped to their primary BU", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const agent = await authenticateAs(app, bul.email);
    const res = await agent.get("/api/dashboard").expect(200);

    expect(res.body.sections).toContain("bu_health");
    expect(res.body.buHealth?.businessUnit?.code).toBe("BU-A");
  });

  it("AA sees platform_admin with the user / domain / BU counts", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await agent.get("/api/dashboard").expect(200);

    expect(res.body.sections).toContain("platform_admin");
    expect(typeof res.body.platformAdmin?.userCount).toBe("number");
    expect(typeof res.body.platformAdmin?.domainCount).toBe("number");
    expect(typeof res.body.platformAdmin?.buCount).toBe("number");
  });

  it("union role (PM + BUL) sees both their sections in the same response", async () => {
    const bu = await getDefaultBu(prisma);
    const u = await seedUser(prisma, { buId: bu.id, roles: ["PM", "BUL"] });
    const agent = await authenticateAs(app, u.email);
    const res = await agent.get("/api/dashboard").expect(200);

    expect(res.body.sections).toEqual(expect.arrayContaining(["project_health", "bu_health"]));
    expect(res.body.projectHealth).toBeDefined();
    expect(res.body.buHealth).toBeDefined();
  });
});
