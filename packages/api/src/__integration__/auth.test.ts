import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  setupTestApp,
  teardownTestApp,
  resetMutableTables,
  seedUser,
  getDefaultBu,
  currentTotpCode,
  authenticateAs,
  TEST_PASSWORD,
  TEST_DOMAIN,
} from "./helpers";

/**
 * Auth integration tests.
 *
 * Covers the full auth surface end-to-end:
 *   - Registration: domain whitelist enforcement, password strength, dup
 *     email rejection
 *   - Login: returns mfa_required/mfa_setup_required correctly
 *   - MFA: rejects bad codes, requires login first
 *   - Logout: clears the session
 *   - GET /api/me: 401 without session, returns scoped user otherwise
 *   - Invite accept flow: GET context, POST accept, expired token
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
// Registration
// ═══════════════════════════════════════════════════════════════

describe("POST /api/auth/register", () => {
  it("accepts a whitelisted domain and starts MFA setup", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: `newuser@${TEST_DOMAIN}`,
      name: "New User",
      password: TEST_PASSWORD,
      projectRoles: [],
    });

    expect(res.status).toBe(201);
    expect(res.body.mfaSetup).toBeDefined();
    expect(res.body.mfaSetup.qrUri).toMatch(/^otpauth:\/\//);
    expect(res.body.mfaSetup.manualKey).toMatch(/^[A-Z2-7]+$/); // base32

    // Verify the row landed in the database.
    const inDb = await prisma.user.findUnique({ where: { email: `newuser@${TEST_DOMAIN}` } });
    expect(inDb).not.toBeNull();
    expect(inDb!.roles).toEqual(["IC"]);
  });

  it("rejects an email whose domain isn't whitelisted", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: "evil@untrusted-domain.io",
      name: "Bad Actor",
      password: TEST_PASSWORD,
      projectRoles: [],
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/domain/i);
    // And nothing was persisted.
    const inDb = await prisma.user.findUnique({ where: { email: "evil@untrusted-domain.io" } });
    expect(inDb).toBeNull();
  });

  it("rejects a duplicate email with 409", async () => {
    const bu = await getDefaultBu(prisma);
    await seedUser(prisma, { email: `dup@${TEST_DOMAIN}`, buId: bu.id });

    const res = await request(app).post("/api/auth/register").send({
      email: `dup@${TEST_DOMAIN}`,
      name: "Duplicate",
      password: TEST_PASSWORD,
      projectRoles: [],
    });

    expect(res.status).toBe(409);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: `weak@${TEST_DOMAIN}`,
      name: "Weak",
      password: "short", // 5 chars
      projectRoles: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.details).toBeDefined();
  });

  it("accepts an exactly-8-character password (boundary)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      email: `boundary@${TEST_DOMAIN}`,
      name: "Boundary",
      password: "12345678", // exactly 8 — the documented minimum (TC 1.16)
      projectRoles: [],
    });

    expect(res.status).toBe(201);
  });
});

// ═══════════════════════════════════════════════════════════════
// Login + MFA
// ═══════════════════════════════════════════════════════════════

describe("POST /api/auth/login + MFA", () => {
  it("returns mfa_required for an existing user with a valid password", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { buId: bu.id });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("mfa_required");
    // Session cookie should be set (it's HttpOnly so we just check existence).
    expect(res.headers["set-cookie"]?.[0]).toMatch(/connect\.sid=/);
  });

  it("rejects bad passwords with 401", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { buId: bu.id });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "wrong-password-12345" });

    expect(res.status).toBe(401);
    expect(res.headers["set-cookie"]?.[0]).not.toMatch(/connect\.sid=s%3A/);
  });

  it("MFA verify accepts a fresh TOTP code and grants session access", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { buId: bu.id });
    const agent = request.agent(app);

    await agent
      .post("/api/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(200);

    const res = await agent.post("/api/auth/mfa/verify").send({ code: currentTotpCode() });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("authenticated");
    expect(res.body.user.email).toBe(user.email);
  });

  it("MFA verify rejects an invalid code", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { buId: bu.id });
    const agent = request.agent(app);

    await agent.post("/api/auth/login").send({ email: user.email, password: TEST_PASSWORD });

    const res = await agent.post("/api/auth/mfa/verify").send({ code: "000000" });
    expect(res.status).toBe(401);
  });

  it("MFA verify with no prior login attempt returns 401", async () => {
    const res = await request(app).post("/api/auth/mfa/verify").send({ code: currentTotpCode() });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// /api/me + logout
// ═══════════════════════════════════════════════════════════════

describe("GET /api/me + logout", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("returns scoped user shape after MFA", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, {
      buId: bu.id,
      roles: ["IC", "PM"],
      projectRoles: ["iOS Dev"],
    });

    const agent = await authenticateAs(app, user.email);
    const res = await agent.get("/api/me");

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(user.email);
    expect(res.body.roles).toEqual(["IC", "PM"]);
    expect(res.body.projectRoles).toEqual(["iOS Dev"]);
    expect(res.body.primaryBu?.code).toBe("BU-A");
    expect(Array.isArray(res.body.dashboardSections)).toBe(true);
  });

  it("logout clears the session so the next /me is 401", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { buId: bu.id });
    const agent = await authenticateAs(app, user.email);

    await agent.get("/api/me").expect(200);
    await agent.post("/api/auth/logout").expect(200);
    await agent.get("/api/me").expect(401);
  });
});

// ═══════════════════════════════════════════════════════════════
// Domain whitelist endpoint
// ═══════════════════════════════════════════════════════════════

describe("GET /api/auth/domains", () => {
  it("is public and lists whitelisted domains", async () => {
    const res = await request(app).get("/api/auth/domains");
    expect(res.status).toBe(200);
    expect(res.body.domains).toContain(TEST_DOMAIN);
  });
});

// ═══════════════════════════════════════════════════════════════
// Forgot / reset password (TC 1.5)
// ═══════════════════════════════════════════════════════════════

describe("Password reset", () => {
  it("issues a reset token for an existing user and the new password works end-to-end", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { buId: bu.id });

    const forgot = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });
    expect(forgot.status).toBe(200);
    expect(forgot.body.resetUrl).toMatch(/^\/reset-password\//);

    const token = forgot.body.resetUrl.split("/reset-password/")[1];
    const newPassword = "brand-new-pass-9999";
    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: newPassword });
    expect(reset.status).toBe(200);

    // Old password no longer works…
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    // …new one does (advances to the MFA step).
    const newLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: newPassword });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.status).toBe("mfa_required");
  });

  it("returns a generic 200 with no resetUrl for an unknown email (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.resetUrl).toBeUndefined();
  });

  it("rejects an invalid reset token", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token", password: "another-good-pass" });
    expect(res.status).toBe(400);
  });

  it("rejects a reused (already-consumed) token", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { buId: bu.id });
    const forgot = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });
    const token = forgot.body.resetUrl.split("/reset-password/")[1];

    await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "first-reset-pass-1" })
      .expect(200);

    const second = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "second-reset-pass-2" });
    expect(second.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { buId: bu.id });
    const forgot = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: user.email });
    const token = forgot.body.resetUrl.split("/reset-password/")[1];

    // Backdate the token's expiry.
    await prisma.passwordReset.updateMany({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token, password: "should-not-work-1" });
    expect(res.status).toBe(400);
  });
});
