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

  it("BUL can update roles of users in their own BU (up to BUL, never AA)", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const target = await seedUser(prisma, { buId: bu.id });

    const agent = await authenticateAs(app, bul.email);
    await agent
      .put(`/api/admin/users/${target.id}/roles`)
      .send({ roles: ["IC", "PM"] })
      .expect(200);

    const fresh = await prisma.user.findUnique({ where: { id: target.id } });
    expect([...(fresh?.roles ?? [])].sort()).toEqual(["IC", "PM"]);

    // The ceiling still holds: granting AA is refused.
    await agent
      .put(`/api/admin/users/${target.id}/roles`)
      .send({ roles: ["AA"] })
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

    await agent.delete(`/api/admin/domains/${addedId}`).expect(200);

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

// ═══════════════════════════════════════════════════════════════
// PUT /api/admin/users/:id/cost-rate
// ═══════════════════════════════════════════════════════════════

describe("PUT /api/admin/users/:id/cost-rate", () => {
  it("BUL sets the cost rate for a user in their own BU", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const member = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, bul.email);

    const res = await agent.put(`/api/admin/users/${member.id}/cost-rate`).send({ costRate: 132.5 });
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: member.id } });
    expect(Number(updated?.costRate)).toBe(132.5);
  });

  it("records the change in the audit log", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const member = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, bul.email);

    await agent.put(`/api/admin/users/${member.id}/cost-rate`).send({ costRate: 100 }).expect(200);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: member.id, field: "cost_rate" },
    });
    expect(log).not.toBeNull();
    expect(log?.newValue).toBe("100");
  });

  it("BUL cannot set the cost rate for a user in another BU (403)", async () => {
    const buA = await getDefaultBu(prisma);
    const buB = await prisma.businessUnit.findUnique({ where: { code: "BU-B" } });
    const bul = await seedUser(prisma, { buId: buA.id, roles: ["BUL"] });
    const otherMember = await seedUser(prisma, { buId: buB!.id });
    const agent = await authenticateAs(app, bul.email);

    const res = await agent.put(`/api/admin/users/${otherMember.id}/cost-rate`).send({ costRate: 100 });
    expect(res.status).toBe(403);
  });

  it("AA can set the cost rate for a user in any BU", async () => {
    const buB = await prisma.businessUnit.findUnique({ where: { code: "BU-B" } });
    const member = await seedUser(prisma, { buId: buB!.id });
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);

    await agent.put(`/api/admin/users/${member.id}/cost-rate`).send({ costRate: 175 }).expect(200);
    const updated = await prisma.user.findUnique({ where: { id: member.id } });
    expect(Number(updated?.costRate)).toBe(175);
  });

  it("clearing the rate with null is allowed", async () => {
    const bu = await getDefaultBu(prisma);
    const member = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    await agent.put(`/api/admin/users/${member.id}/cost-rate`).send({ costRate: 90 }).expect(200);
    await agent.put(`/api/admin/users/${member.id}/cost-rate`).send({ costRate: null }).expect(200);
    const updated = await prisma.user.findUnique({ where: { id: member.id } });
    expect(updated?.costRate).toBeNull();
  });

  it("rejects a negative cost rate (400)", async () => {
    const bu = await getDefaultBu(prisma);
    const member = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await agent.put(`/api/admin/users/${member.id}/cost-rate`).send({ costRate: -5 });
    expect(res.status).toBe(400);
  });

  it("a PM cannot set cost rates (403)", async () => {
    const bu = await getDefaultBu(prisma);
    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const member = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, pm.email);
    const res = await agent.put(`/api/admin/users/${member.id}/cost-rate`).send({ costRate: 100 });
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/users includes costRate", async () => {
    const bu = await getDefaultBu(prisma);
    const member = await seedUser(prisma, { buId: bu.id });
    const aa = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    await aa.put(`/api/admin/users/${member.id}/cost-rate`).send({ costRate: 144 }).expect(200);

    const res = await aa.get("/api/admin/users").expect(200);
    const row = res.body.users.find((u: { id: string }) => u.id === member.id);
    expect(row.costRate).toBe(144);
  });
});
