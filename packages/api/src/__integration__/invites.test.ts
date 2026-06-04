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
  TEST_PASSWORD,
} from "./helpers";

/**
 * Invite flow integration tests.
 *
 * Verifies the public invite-accept surface end-to-end:
 *   - GET context lookup with 200 / 404 / 410 outcomes
 *   - POST accept creates the user, marks the invite accepted, and starts
 *     the MFA-setup flow with the same response shape /api/auth/register uses
 *   - Expired tokens return 410
 *   - Already-accepted tokens return 410 and don't create duplicate users
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
 * Helper: seeds an invite owned by the baseline AA user. Returns the raw
 * token (caller passes it as the URL param). Uses the admin user as the
 * inviter since they exist in the baseline seed.
 */
async function seedInvite(opts?: {
  email?: string;
  name?: string;
  projectRole?: string;
  expiresAt?: Date;
  acceptedAt?: Date | null;
}) {
  const bu = await getDefaultBu(prisma);
  const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
  if (!aa) throw new Error("Baseline AA missing");

  const token = `tok-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return prisma.userInvite.create({
    data: {
      token,
      email: opts?.email ?? `invitee-${Math.random().toString(36).slice(2, 6)}@${TEST_DOMAIN}`,
      name: opts?.name ?? "Invited User",
      projectRole: opts?.projectRole ?? "iOS Dev",
      buId: bu.id,
      invitedBy: aa.id,
      expiresAt: opts?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      acceptedAt: opts?.acceptedAt ?? null,
    },
  });
}

// ═══════════════════════════════════════════════════════════════
// GET /api/invites/:token
// ═══════════════════════════════════════════════════════════════

describe("GET /api/invites/:token", () => {
  it("returns the invite context for a valid token", async () => {
    const invite = await seedInvite({ name: "Maya Chen", projectRole: "iOS Dev" });
    const res = await request(app).get(`/api/invites/${invite.token}`).expect(200);

    expect(res.body.email).toBe(invite.email);
    expect(res.body.name).toBe("Maya Chen");
    expect(res.body.projectRole).toBe("iOS Dev");
    expect(res.body.bu.code).toBe("BU-A");
    expect(res.body.invitedBy.email).toBe(`aa@${TEST_DOMAIN}`);
  });

  it("404 for unknown token", async () => {
    await request(app).get("/api/invites/nonexistent-token-12345").expect(404);
  });

  it("410 for expired token", async () => {
    const invite = await seedInvite({ expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).get(`/api/invites/${invite.token}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("410 for already-accepted token", async () => {
    const invite = await seedInvite({ acceptedAt: new Date() });
    const res = await request(app).get(`/api/invites/${invite.token}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/already been used/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// POST /api/invites/:token/accept
// ═══════════════════════════════════════════════════════════════

describe("POST /api/invites/:token/accept", () => {
  it("creates the user, marks the invite accepted, and returns the MFA setup payload", async () => {
    const invite = await seedInvite({ email: `newhire@${TEST_DOMAIN}`, name: "New Hire" });

    const res = await request(app)
      .post(`/api/invites/${invite.token}/accept`)
      .send({ name: "New Hire", password: TEST_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.mfaSetup?.qrUri).toMatch(/^otpauth:\/\//);
    expect(res.body.mfaSetup?.manualKey).toMatch(/^[A-Z2-7]+$/);

    const created = await prisma.user.findUnique({ where: { email: `newhire@${TEST_DOMAIN}` } });
    expect(created).not.toBeNull();
    expect(created!.name).toBe("New Hire");
    expect(created!.primaryBuId).toBe(invite.buId);

    const after = await prisma.userInvite.findUnique({ where: { token: invite.token } });
    expect(after?.acceptedAt).not.toBeNull();
  });

  it("400 when password is too short", async () => {
    const invite = await seedInvite();
    const res = await request(app)
      .post(`/api/invites/${invite.token}/accept`)
      .send({ name: "Shorty", password: "short" });
    expect(res.status).toBe(400);
  });

  it("410 when accepting an already-accepted token", async () => {
    const invite = await seedInvite({ acceptedAt: new Date() });
    const res = await request(app)
      .post(`/api/invites/${invite.token}/accept`)
      .send({ name: "New Hire", password: TEST_PASSWORD });
    expect(res.status).toBe(410);
  });

  it("410 when accepting an expired token", async () => {
    const invite = await seedInvite({ expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app)
      .post(`/api/invites/${invite.token}/accept`)
      .send({ name: "New Hire", password: TEST_PASSWORD });
    expect(res.status).toBe(410);
  });

  it("409 when the email is already taken by a direct signup", async () => {
    const bu = await getDefaultBu(prisma);
    const stolenEmail = `racer@${TEST_DOMAIN}`;
    // Someone signed up first via the normal flow.
    await seedUser(prisma, { buId: bu.id, email: stolenEmail });

    const invite = await seedInvite({ email: stolenEmail });
    const res = await request(app)
      .post(`/api/invites/${invite.token}/accept`)
      .send({ name: "New Hire", password: TEST_PASSWORD });
    expect(res.status).toBe(409);
  });
});
