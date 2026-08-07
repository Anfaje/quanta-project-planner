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
 * GET /api/accounts/summary — revenue/cost/profit/margin per account across
 * lifetime / ytd / rolling-12 scopes, with role-based slicing.
 *
 * Fixtures (built per test):
 *   - "recent" T&M project: default BU, account A, 2 weeks starting 14 days
 *     ago, 10 actual h/week at 200/100 → revenue 4000, cost 2000. Falls
 *     inside rolling-12 always.
 *   - "old" T&M project: OTHER BU, account A, 2 weeks in Feb 2024, same
 *     rates → +4000/+2000, lifetime only.
 *   - fixed-price project: default BU, account B, contract 10000, planned
 *     100h, 25 actual h in the recent window → percentage-of-completion
 *     recognizes 2500; cost 2500.
 *
 * (YTD is asserted structurally, not by exact value — near a year boundary
 * the "recent" weeks can legitimately fall in the prior year.)
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

const DAY = 86_400_000;

async function buildBook() {
  const bu = await getDefaultBu(prisma);
  const accountA = await getDefaultAccount(prisma);
  const accountB = await prisma.account.create({
    data: { name: "Second Client", code: `SEC-${Math.random().toString(36).slice(2, 6).toUpperCase()}` },
  });
  const otherBu = await prisma.businessUnit.upsert({
    where: { code: "ZZ-OTH-SUM" },
    update: {},
    create: { code: "ZZ-OTH-SUM", name: "Other BU (summary)" },
  });
  const aa = await prisma.user.findUnique({ where: { email: `aa@${TEST_DOMAIN}` } });
  const worker = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });

  await seedProject(prisma, {
    accountId: accountA.id,
    owningBuId: bu.id,
    createdBy: aa!.id,
    startDate: new Date(Date.now() - 14 * DAY),
    totalWeeks: 2,
    assignments: [{ userId: worker.id, projectRole: "Dev", billRate: 200, costRate: 100 }],
    seedHours: { plannedPerWeek: 10, actualPerWeek: 10 },
  });
  await seedProject(prisma, {
    accountId: accountA.id,
    owningBuId: otherBu.id,
    createdBy: aa!.id,
    startDate: new Date("2024-02-04T00:00:00Z"),
    totalWeeks: 2,
    assignments: [{ userId: worker.id, projectRole: "Dev", billRate: 200, costRate: 100 }],
    seedHours: { plannedPerWeek: 10, actualPerWeek: 10 },
  });
  await seedProject(prisma, {
    accountId: accountB.id,
    owningBuId: bu.id,
    createdBy: aa!.id,
    startDate: new Date(Date.now() - 14 * DAY),
    totalWeeks: 2,
    pricingModel: "fixed_price",
    fixedPrice: 10000,
    assignments: [{ userId: worker.id, projectRole: "Dev", costRate: 100 }],
    seedHours: { plannedPerWeek: 50, actualPerWeek: 12.5 },
  });

  return { bu, accountA, accountB, otherBu };
}

const row = (body: any, id: string) => body.accounts.find((a: { id: string }) => a.id === id);

describe("GET /api/accounts/summary", () => {
  it("AA sees the whole book, with fixed-price recognized by percentage-of-completion", async () => {
    const { accountA, accountB } = await buildBook();
    const agent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);

    const lifetime = await agent.get("/api/accounts/summary?scope=lifetime").expect(200);
    expect(lifetime.body.slice).toBeNull();
    const aLife = row(lifetime.body, accountA.id);
    expect(aLife.revenue).toBe(8000);
    expect(aLife.cost).toBe(4000);
    expect(aLife.profit).toBe(4000);
    expect(aLife.marginPct).toBe(50);
    expect(aLife.projects).toBe(2);
    const bLife = row(lifetime.body, accountB.id);
    expect(bLife.revenue).toBe(2500); // 10000 × 25h ÷ 100h planned
    expect(bLife.cost).toBe(2500);
    expect(lifetime.body.totals.revenue).toBe(10500);

    const rolling = await agent.get("/api/accounts/summary?scope=rolling12").expect(200);
    const aRoll = row(rolling.body, accountA.id);
    expect(aRoll.revenue).toBe(4000); // the 2024 project drops out
    expect(aRoll.projects).toBe(1);
    expect(row(rolling.body, accountB.id).revenue).toBe(2500);

    // YTD: structurally sane (exact value is year-boundary dependent).
    const ytd = await agent.get("/api/accounts/summary?scope=ytd").expect(200);
    expect(ytd.body.scope).toBe("ytd");
    const aYtd = row(ytd.body, accountA.id);
    expect(aYtd.revenue).toBeGreaterThanOrEqual(0);
    expect(aYtd.revenue).toBeLessThanOrEqual(aLife.revenue);
  });

  it("BUL gets their own BU's slice, labelled", async () => {
    const { bu, accountA, accountB } = await buildBook();
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const agent = await authenticateAs(app, bul.email);

    const res = await agent.get("/api/accounts/summary?scope=lifetime").expect(200);
    expect(res.body.slice).toEqual({ buCode: bu.code });
    // Account A shows only the default-BU project (4000), not the other BU's 4000.
    expect(row(res.body, accountA.id).revenue).toBe(4000);
    expect(row(res.body, accountA.id).projects).toBe(1);
    expect(row(res.body, accountB.id).revenue).toBe(2500);
  });

  it("AC sees managed accounts only (whole-account)", async () => {
    const { bu, accountA, accountB } = await buildBook();
    const ac = await seedUser(prisma, { buId: bu.id, roles: ["AC"] });
    await prisma.accountManager.create({ data: { userId: ac.id, accountId: accountB.id } });
    const agent = await authenticateAs(app, ac.email);

    const res = await agent.get("/api/accounts/summary?scope=lifetime").expect(200);
    expect(row(res.body, accountB.id).revenue).toBe(2500);
    expect(row(res.body, accountA.id)).toBeUndefined();
  });

  it("403 for callers without an account-summary mandate", async () => {
    const bu = await getDefaultBu(prisma);
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const agent = await authenticateAs(app, ic.email);
    await agent.get("/api/accounts/summary").expect(403);
  });
});
