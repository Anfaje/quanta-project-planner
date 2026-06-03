import { PrismaClient, Role, ProjectStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import request, { Agent } from "supertest";
import { TOTP, Secret } from "otpauth";
import { createApp } from "../createApp";
import { encryptSecret } from "../utils/totp";
import { TEST_PASSWORD, TEST_DOMAIN, TEST_TOTP_SECRET } from "./globalSetup";

/**
 * Per-test helpers.
 *
 * The full flow each test typically wants:
 *
 *   const { app, prisma } = await setupTestApp();
 *   const bu = await getDefaultBu(prisma);
 *   const ic = await seedUser(prisma, { roles: ["IC"], buId: bu.id });
 *   const agent = await authenticateAs(app, ic.email);
 *
 *   await agent.get("/api/me").expect(200);
 *
 * `setupTestApp` is cheap (just `createApp()` with the test-mode flags) so
 * each test file calls it in `beforeAll`. The Prisma client is shared
 * across the file and disconnected in `afterAll`.
 */

export { TEST_PASSWORD, TEST_DOMAIN, TEST_TOTP_SECRET };

// ── App + Prisma setup ──

export async function setupTestApp() {
  // Rate limit is incompatible with the >10-requests-per-test paths we
  // exercise; disabled via env flag the createApp factory honours.
  process.env.RATE_LIMIT_DISABLED = "1";

  const app = createApp({ logging: false });
  const prisma = new PrismaClient();
  await prisma.$connect();
  return { app, prisma };
}

export async function teardownTestApp(prisma: PrismaClient) {
  await prisma.$disconnect();
}

// ── Truncation between tests ──

/**
 * Wipe the per-test mutable tables but leave the baseline (domains, BUs,
 * accounts, the seeded AA user) intact. Faster than schema reset.
 *
 * Order respects FK dependencies — children first, then parents.
 */
export async function resetMutableTables(prisma: PrismaClient): Promise<void> {
  // Children of Project / User get cascaded by the schema but truncate
  // explicitly to make the test ordering obvious and deterministic.
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.hourEntry.deleteMany(),
    prisma.resourceAssignment.deleteMany(),
    prisma.projectShare.deleteMany(),
    prisma.project.deleteMany(),
    prisma.userInvite.deleteMany(),
    prisma.passwordReset.deleteMany(),
    prisma.accountManager.deleteMany(),
    // Keep the AA bootstrap user (aa@example.com) so the domain whitelist
    // FK isn't violated; delete everyone else.
    prisma.user.deleteMany({ where: { email: { not: `aa@${TEST_DOMAIN}` } } }),
  ]);
}

// ── User factory ──

interface SeedUserOpts {
  email?: string;
  name?: string;
  roles?: Role[];
  projectRoles?: string[];
  buId: string;
  isActive?: boolean;
  financialAccess?: boolean;
  /** Defaults to true so authenticateAs() works without extra setup. */
  totpVerified?: boolean;
}

export async function seedUser(
  prisma: PrismaClient,
  opts: SeedUserOpts
): Promise<{ id: string; email: string; name: string }> {
  const email = opts.email ?? `u${Math.random().toString(36).slice(2, 8)}@${TEST_DOMAIN}`;
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 6);
  const totpSecret = encryptSecret(TEST_TOTP_SECRET);
  const user = await prisma.user.create({
    data: {
      email,
      name: opts.name ?? "Test User",
      passwordHash,
      roles: opts.roles ?? ["IC"],
      projectRoles: opts.projectRoles ?? [],
      primaryBuId: opts.buId,
      isActive: opts.isActive ?? true,
      financialAccess: opts.financialAccess ?? false,
      totpSecret,
      totpVerified: opts.totpVerified ?? true,
    },
    select: { id: true, email: true, name: true },
  });
  return user;
}

// ── Project factory ──

interface SeedProjectOpts {
  name?: string;
  projectCode?: string;
  accountId: string;
  owningBuId: string;
  createdBy: string;
  status?: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  contingencyPct?: number;
  totalWeeks?: number;
  assignments?: Array<{
    userId: string;
    projectRole: string;
    billRate?: number;
    costRate?: number;
  }>;
  /** If true, also creates one HourEntry per (assignment × week) with the planned hours. */
  seedHours?: { plannedPerWeek?: number; actualPerWeek?: number };
}

export async function seedProject(prisma: PrismaClient, opts: SeedProjectOpts) {
  const totalWeeks = opts.totalWeeks ?? 4;
  const startDate = opts.startDate ?? new Date("2026-03-01T00:00:00Z");
  const endDate = opts.endDate ?? new Date(startDate.getTime() + (totalWeeks - 1) * 7 * 86_400_000);

  const project = await prisma.project.create({
    data: {
      name: opts.name ?? `Project ${Math.random().toString(36).slice(2, 7)}`,
      projectCode: opts.projectCode ?? `P-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      accountId: opts.accountId,
      owningBuId: opts.owningBuId,
      createdById: opts.createdBy,
      status: opts.status ?? "active",
      startDate,
      endDate,
      contingencyPct: opts.contingencyPct ?? 0.15,
    },
  });

  if (opts.assignments?.length) {
    for (const a of opts.assignments) {
      const assignment = await prisma.resourceAssignment.create({
        data: {
          projectId: project.id,
          userId: a.userId,
          projectRole: a.projectRole,
          billRate: a.billRate ?? 175,
          costRate: a.costRate ?? 90,
          businessUnit: "TEST-BU",
        },
      });

      if (opts.seedHours) {
        // Create one HourEntry per week for this assignment, pre-populated.
        for (let w = 0; w < totalWeeks; w++) {
          await prisma.hourEntry.create({
            data: {
              assignmentId: assignment.id,
              projectWeek: w,
              weekStartDate: new Date(startDate.getTime() + w * 7 * 86_400_000),
              plannedHours: opts.seedHours.plannedPerWeek ?? 0,
              actualHours: opts.seedHours.actualPerWeek ?? 0,
              locked: false,
            },
          });
        }
      }
    }
  }

  return project;
}

// ── Authentication helper ──

/**
 * Logs an existing test user in and returns a supertest agent with the
 * session cookie attached. Goes through the real two-step flow:
 *
 *   1. POST /api/auth/login  (email + password) → mfa_required
 *   2. POST /api/auth/mfa/verify (TOTP code) → authenticated
 *
 * Throws if either step doesn't return 200. The agent is then ready to
 * issue authenticated requests.
 */
export async function authenticateAs(
  app: Parameters<typeof request>[0],
  email: string
): Promise<Agent> {
  const agent = request.agent(app);

  const loginRes = await agent.post("/api/auth/login").send({ email, password: TEST_PASSWORD });
  if (loginRes.status !== 200) {
    throw new Error(
      `authenticateAs(${email}): login failed with ${loginRes.status} ${JSON.stringify(loginRes.body)}`
    );
  }

  const code = currentTotpCode();
  const mfaRes = await agent.post("/api/auth/mfa/verify").send({ code });
  if (mfaRes.status !== 200) {
    throw new Error(
      `authenticateAs(${email}): MFA verify failed with ${mfaRes.status} ${JSON.stringify(mfaRes.body)}`
    );
  }

  return agent;
}

/**
 * Generates the current TOTP code from the shared test secret. Tests can
 * call this directly when they want to verify MFA flow without going
 * through `authenticateAs`.
 */
export function currentTotpCode(secret: string = TEST_TOTP_SECRET): string {
  const totp = new TOTP({
    secret: Secret.fromBase32(secret),
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  });
  return totp.generate();
}

// ── Common references ──

export async function getDefaultBu(prisma: PrismaClient) {
  const bu = await prisma.businessUnit.findUnique({ where: { code: "BU-A" } });
  if (!bu) throw new Error("Baseline BU-A missing — globalSetup didn't run?");
  return bu;
}

export async function getDefaultAccount(prisma: PrismaClient) {
  const account = await prisma.account.findUnique({ where: { code: "ACME" } });
  if (!account) throw new Error("Baseline account ACME missing — globalSetup didn't run?");
  return account;
}
