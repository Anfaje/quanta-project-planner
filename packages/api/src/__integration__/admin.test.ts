import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
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
 * Admin route integration tests.
 *
 * Covers the role-gating story for every admin endpoint and the audit-log
 * side effect on the most consequential action (role update).
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
// GET /api/admin/users
// ═══════════════════════════════════════════════════════════════

describe("GET /api/admin/users", () => {
  it("IC is denied (403)", async () => {
    const bu = await getDefaultBu(prisma);
    const ic = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, ic.email);
    await agent.get("/api/admin/users").expect(403);
  });

  it("BUL is allowed (200)", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const agent = await authenticateAs(app, bul.email);
    const res = await agent.get("/api/admin/users").expect(200);
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it("AA is allowed and sees the full user list", async () => {
    const bu = await getDefaultBu(prisma);
    await seedUser(prisma, { buId: bu.id }); // adds an IC
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await agent.get("/api/admin/users").expect(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(2); // baseline AA + new IC
  });
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/admin/users/:id/roles
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/admin/users/:id/roles", () => {
  it("AA can promote an IC to PM and the change is audit-logged", async () => {
    const bu = await getDefaultBu(prisma);
    const ic = await seedUser(prisma, { buId: bu.id });

    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await agent
      .put(`/api/admin/users/${ic.id}/roles`)
      .send({ roles: ["IC", "PM"] });
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: ic.id } });
    expect(updated?.roles).toEqual(expect.arrayContaining(["IC", "PM"]));

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: ic.id, entityType: "User", field: "roles" },
      orderBy: { changedAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.newValue).toContain("PM");
  });

  it("BUL cannot update roles (only AA can)", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const target = await seedUser(prisma, { buId: bu.id });

    const agent = await authenticateAs(app, bul.email);
    await agent
      .put(`/api/admin/users/${target.id}/roles`)
      .send({ roles: ["IC", "PM"] })
      .expect(403);
  });

  it("400 when roles array is empty (a user must have at least one role)", async () => {
    const bu = await getDefaultBu(prisma);
    const target = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await agent
      .put(`/api/admin/users/${target.id}/roles`)
      .send({ roles: [] });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// Domain whitelist CRUD
// ═══════════════════════════════════════════════════════════════

describe("Domain whitelist CRUD", () => {
  it("AA can add and remove domains", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);

    const add = await agent.post("/api/admin/domains").send({ domain: "newco.io" });
    expect(add.status).toBe(201);
    // POST /domains returns { message, domain } (no id), so look up the id.
    const created = await prisma.domainWhitelist.findUnique({ where: { domain: "newco.io" } });
    const addedId = created!.id;

    const list = await agent.get("/api/admin/domains").expect(200);
    expect(list.body.domains.some((d: { domain: string }) => d.domain === "newco.io")).toBe(true);

    await agent.delete(`/api/admin/domains/${addedId}`).expect(204);

    const after = await prisma.domainWhitelist.findUnique({ where: { id: addedId } });
    expect(after).toBeNull();
  });

  it("BUL cannot manage domain whitelist", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const agent = await authenticateAs(app, bul.email);
    await agent.post("/api/admin/domains").send({ domain: "shadow.io" }).expect(403);
  });
});

// ═══════════════════════════════════════════════════════════════
// BU + Account create
// ═══════════════════════════════════════════════════════════════

describe("BU + Account create", () => {
  it("AA can create a BU; non-AA gets 403", async () => {
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await aaAgent
      .post("/api/admin/bus")
      .send({ code: "BU-NEW", name: "New Studio" });
    expect(res.status).toBe(201);

    const bu = await getDefaultBu(prisma);
    const ic = await seedUser(prisma, { buId: bu.id });
    const icAgent = await authenticateAs(app, ic.email);
    await icAgent.post("/api/admin/bus").send({ code: "BU-Z", name: "Z" }).expect(403);
  });

  it("AA can create an Account; non-AA gets 403", async () => {
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await aaAgent
      .post("/api/admin/accounts")
      .send({ code: "MERIDIAN", name: "Meridian Corp" });
    expect(res.status).toBe(201);

    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const bulAgent = await authenticateAs(app, bul.email);
    await bulAgent.post("/api/admin/accounts").send({ code: "X", name: "X" }).expect(403);
  });
});
