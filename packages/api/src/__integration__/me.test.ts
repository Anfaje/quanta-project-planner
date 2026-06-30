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
  TEST_PASSWORD,
} from "./helpers";

/**
 * Self-service account endpoints (PATCH /api/me, POST /api/me/change-password).
 *
 * Key guarantees:
 *   - a user can edit their own name + preferred project-role labels
 *   - a user CANNOT escalate their own system roles / financial access / BU
 *     through these endpoints (those fields are silently ignored)
 *   - password change verifies the current password and re-points login
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

describe("PATCH /api/me", () => {
  it("updates name and preferred project roles", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { roles: ["IC"], buId: bu.id, name: "Old Name" });
    const agent = await authenticateAs(app, user.email);

    const res = await agent
      .patch("/api/me")
      .send({ name: "New Name", projectRoles: ["iOS Dev", "Backend"] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
    expect(res.body.projectRoles).toEqual(["iOS Dev", "Backend"]);

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.name).toBe("New Name");
    expect(fresh?.projectRoles).toEqual(["iOS Dev", "Backend"]);
  });

  it("ignores attempts to change system roles, financial access, or BU", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { roles: ["IC"], buId: bu.id, financialAccess: false });
    const agent = await authenticateAs(app, user.email);

    await agent
      .patch("/api/me")
      .send({ name: "Escalator", roles: ["AA"], financialAccess: true, primaryBuId: "spoofed" })
      .expect(200);

    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.roles).toEqual(["IC"]); // unchanged — no self-escalation
    expect(fresh?.financialAccess).toBe(false); // unchanged
    expect(fresh?.primaryBuId).toBe(bu.id); // unchanged
    expect(fresh?.name).toBe("Escalator"); // the one allowed field did change
  });
});

describe("POST /api/me/change-password", () => {
  it("rejects a wrong current password", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { roles: ["IC"], buId: bu.id });
    const agent = await authenticateAs(app, user.email);

    const res = await agent
      .post("/api/me/change-password")
      .send({ currentPassword: "definitely-wrong", newPassword: "brand-new-pass-1" });
    expect(res.status).toBe(400);
  });

  it("changes the password when the current one is correct", async () => {
    const bu = await getDefaultBu(prisma);
    const user = await seedUser(prisma, { roles: ["IC"], buId: bu.id });
    const agent = await authenticateAs(app, user.email);

    const newPassword = "brand-new-pass-1";
    await agent
      .post("/api/me/change-password")
      .send({ currentPassword: TEST_PASSWORD, newPassword })
      .expect(200);

    // Old password no longer authenticates...
    await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(401);

    // ...the new one passes the password step (proceeds to MFA).
    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: newPassword });
    expect(ok.status).toBe(200);
  });
});
