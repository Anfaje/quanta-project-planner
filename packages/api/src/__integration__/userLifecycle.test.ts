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
  TEST_DOMAIN,
} from "./helpers";

/**
 * User-lifecycle integration tests for the "account & users" feature set:
 *   - inviting a user creates a pending (inactive, password-less) row up front
 *   - pending users surface in the admin list with status "pending" and can't log in
 *   - re-inviting a pending user refreshes rather than 409s
 *   - accepting the invite activates the SAME row (no duplicate)
 *   - AA can delete inactive users, but only when they carry no dependent records
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

const rand = () => Math.random().toString(36).slice(2, 6);

describe("invite creates a pending user", () => {
  it("creates an inactive, password-less user carrying the invite's roles", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const email = `pending-${rand()}@${TEST_DOMAIN}`;

    await agent
      .post("/api/admin/users/invite")
      .send({ email, buId: bu.id, name: "Pending Pat", projectRole: "iOS Dev", roles: ["PM"] })
      .expect(201);

    const u = await prisma.user.findUnique({ where: { email } });
    expect(u).not.toBeNull();
    expect(u?.isActive).toBe(false);
    expect(u?.passwordHash).toBeNull();
    expect(u?.roles).toEqual(["PM"]);
    expect(u?.projectRoles).toEqual(["iOS Dev"]);
  });

  it("surfaces the pending user in the admin list with status 'pending' and no hash", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const email = `pendlist-${rand()}@${TEST_DOMAIN}`;
    await agent.post("/api/admin/users/invite").send({ email, buId: bu.id }).expect(201);

    const res = await agent.get("/api/admin/users").expect(200);
    const row = res.body.users.find((x: { email: string }) => x.email === email);
    expect(row?.status).toBe("pending");
    expect(row).not.toHaveProperty("passwordHash");
  });

  it("blocks login for a pending user that hasn't accepted yet", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const email = `pendlogin-${rand()}@${TEST_DOMAIN}`;
    await agent.post("/api/admin/users/invite").send({ email, buId: bu.id }).expect(201);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "anything-at-all" });
    expect(res.status).toBe(403);
  });

  it("allows re-inviting a pending user — refreshes the row, no 409", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const email = `reinvite-${rand()}@${TEST_DOMAIN}`;
    await agent.post("/api/admin/users/invite").send({ email, buId: bu.id, roles: ["IC"] }).expect(201);
    await agent.post("/api/admin/users/invite").send({ email, buId: bu.id, roles: ["PM"] }).expect(201);

    const users = await prisma.user.findMany({ where: { email } });
    expect(users).toHaveLength(1);
    expect(users[0].roles).toEqual(["PM"]);
  });

  it("rejects inviting an email that already has an active account (409)", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const active = await seedUser(prisma, { roles: ["IC"], buId: bu.id });

    const res = await agent
      .post("/api/admin/users/invite")
      .send({ email: active.email, buId: bu.id });
    expect(res.status).toBe(409);
  });
});

describe("accept activates the pending user", () => {
  it("activates the same row instead of creating a duplicate", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const email = `activate-${rand()}@${TEST_DOMAIN}`;
    const inviteRes = await agent
      .post("/api/admin/users/invite")
      .send({ email, buId: bu.id, roles: ["IC"] })
      .expect(201);
    const token = inviteRes.body.token as string;

    const before = await prisma.user.findUnique({ where: { email } });

    await request(app)
      .post(`/api/invites/${token}/accept`)
      .send({ name: "Activated Ann", password: "set-my-password-1" })
      .expect(201);

    const after = await prisma.user.findMany({ where: { email } });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before?.id);
    expect(after[0].isActive).toBe(true);
    expect(after[0].passwordHash).not.toBeNull();
    expect(after[0].name).toBe("Activated Ann");
  });
});

describe("DELETE /api/admin/users/:id (AA, safe)", () => {
  it("deletes an inactive user with no dependent records", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const u = await seedUser(prisma, { roles: ["IC"], buId: bu.id, isActive: false });

    await agent.delete(`/api/admin/users/${u.id}`).expect(200);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
  });

  it("refuses to delete an active user (409)", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const u = await seedUser(prisma, { roles: ["IC"], buId: bu.id, isActive: true });

    const res = await agent.delete(`/api/admin/users/${u.id}`);
    expect(res.status).toBe(409);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
  });

  it("refuses to delete an inactive user that still has assignments (409 blocked)", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const bu = await getDefaultBu(prisma);
    const account = await getDefaultAccount(prisma);
    const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
    const u = await seedUser(prisma, { roles: ["IC"], buId: bu.id, isActive: false });
    await seedProject(prisma, {
      accountId: account.id,
      owningBuId: bu.id,
      createdBy: aa!.id,
      assignments: [{ userId: u.id, projectRole: "Dev" }],
    });

    const res = await agent.delete(`/api/admin/users/${u.id}`);
    expect(res.status).toBe(409);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).not.toBeNull();
  });

  it("returns 404 for an unknown user", async () => {
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);
    const res = await agent.delete(`/api/admin/users/nonexistent-id`);
    expect(res.status).toBe(404);
  });

  it("forbids non-AA callers (403)", async () => {
    const bu = await getDefaultBu(prisma);
    const bul = await seedUser(prisma, { roles: ["BUL"], buId: bu.id });
    const victim = await seedUser(prisma, { roles: ["IC"], buId: bu.id, isActive: false });
    const agent = await authenticateAs(app, bul.email);

    const res = await agent.delete(`/api/admin/users/${victim.id}`);
    expect(res.status).toBe(403);
  });
});
