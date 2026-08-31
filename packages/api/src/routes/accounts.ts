import { Router, Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import type { Currency } from "@prisma/client";
import { isCurrency, fxFactor } from "../services/currency";

/**
 * Account summaries — revenue, cost, profit, margin, and project counts per
 * client account, in three time scopes: lifetime, year-to-date, and rolling
 * 12 months.
 *
 * Scoping by role (first match wins):
 *   - AA with financial access → the whole book of work.
 *   - BUL → only projects their BU owns: their BU's *slice* of each account
 *     (labelled in the response) — other BUs' work on the same client is
 *     deliberately excluded, matching the financial-visibility model.
 *   - AC → all projects on their managed accounts.
 *
 * Revenue recognition:
 *   - T&M: actual hours × bill rate, bucketed by hour-entry week-start date.
 *   - Fixed price: percentage-of-completion — cumulative recognized revenue
 *     R(t) = contract × min(actual hours ≤ t ÷ total planned hours, 1);
 *     a window's revenue is R(window end) − R(window start). Capped at the
 *     contract value; a plan of zero hours recognizes fully on first actuals.
 *   - Cost is always actual hours × cost rate, both pricing models.
 */
const router = Router();
router.use(requireAuth);

type Scope = "lifetime" | "ytd" | "rolling12";

function windowFor(scope: Scope): { start: Date | null; end: Date } {
  const now = new Date();
  if (scope === "ytd") {
    return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end: now };
  }
  if (scope === "rolling12") {
    return { start: new Date(now.getTime() - 365 * 86_400_000), end: now };
  }
  return { start: null, end: now };
}

router.get("/summary", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const requested = String(req.query.scope ?? "lifetime");
  const scope: Scope = (["lifetime", "ytd", "rolling12"] as const).includes(requested as Scope)
    ? (requested as Scope)
    : "lifetime";

  // Display currency — per-project amounts convert at the rate level.
  const display: Currency = isCurrency(req.query.currency) ? req.query.currency : "USD";

  const isAa = user.roles.includes(Role.AA);
  const isBul = user.roles.includes(Role.BUL);
  const isAc = user.roles.includes(Role.AC);

  let where: Record<string, unknown>;
  let slice: { buCode: string } | null = null;
  type AccountLite = { id: string; name: string; code: string };
  let baseAccounts: AccountLite[] = [];

  // Bases are an OR-union: role paths plus view_financials grants. A grant at
  // account scope shows that account whole; at BU scope, that BU's slice.
  const finGrants = (user.grants ?? []).filter((g) => g.permission === "view_financials");
  const grantPlatform = finGrants.some((g) => g.scopeType === "platform");
  const grantBuIds = [
    ...new Set(
      finGrants
        .filter((g) => g.scopeType === "business_unit" && g.scopeId != null)
        .map((g) => g.scopeId as string)
    ),
  ];
  const grantAccountIds = [
    ...new Set(
      finGrants
        .filter((g) => g.scopeType === "account" && g.scopeId != null)
        .map((g) => g.scopeId as string)
    ),
  ];
  const grantProjectIds = [
    ...new Set(
      finGrants
        .filter((g) => g.scopeType === "project" && g.scopeId != null)
        .map((g) => g.scopeId as string)
    ),
  ];

  if ((isAa && user.financialAccess) || grantPlatform) {
    where = {};
    baseAccounts = await prisma.account.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    });
  } else {
    const orClauses: Record<string, unknown>[] = [];
    if (isBul) {
      orClauses.push({ owningBuId: user.primaryBuId });
    }
    if (isAc && user.managedAccountIds.length > 0) {
      orClauses.push({ accountId: { in: user.managedAccountIds } });
    }
    if (grantBuIds.length > 0) {
      orClauses.push({ owningBuId: { in: grantBuIds } });
      orClauses.push({ shares: { some: { sharedWithBuId: { in: grantBuIds } } } });
    }
    if (grantAccountIds.length > 0) {
      orClauses.push({ accountId: { in: grantAccountIds } });
    }
    if (grantProjectIds.length > 0) {
      orClauses.push({ id: { in: grantProjectIds } });
    }
    if (orClauses.length === 0) {
      return res.status(403).json({
        error:
          "Account summaries require AA (with financial access), BUL, AC, or a finance-visibility grant",
      });
    }
    where = { OR: orClauses };

    // Slice label only when the numbers are exactly one BU's slice.
    const sliceBuIds = new Set<string>([
      ...(isBul ? [user.primaryBuId] : []),
      ...grantBuIds,
    ]);
    const accountWide =
      (isAc && user.managedAccountIds.length > 0) ||
      grantAccountIds.length > 0 ||
      grantProjectIds.length > 0;
    if (!accountWide && sliceBuIds.size === 1) {
      const bu = await prisma.businessUnit.findUnique({
        where: { id: [...sliceBuIds][0] },
        select: { code: true },
      });
      slice = { buCode: bu?.code ?? "" };
    }

    if (isAc && user.managedAccountIds.length > 0) {
      baseAccounts = await prisma.account.findMany({
        where: { id: { in: user.managedAccountIds } },
        select: { id: true, name: true, code: true },
      });
    }
    if (grantAccountIds.length > 0) {
      const extra = await prisma.account.findMany({
        where: { id: { in: grantAccountIds } },
        select: { id: true, name: true, code: true },
      });
      baseAccounts = [...baseAccounts, ...extra];
    }
  }

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      pricingModel: true,
      fixedPrice: true,
      currency: true,
      account: { select: { id: true, name: true, code: true } },
      assignments: {
        select: {
          billRate: true,
          costRate: true,
          hourEntries: {
            select: { weekStartDate: true, plannedHours: true, actualHours: true },
          },
        },
      },
    },
  });

  const { start, end } = windowFor(scope);

  type Agg = {
    account: AccountLite;
    revenue: number;
    cost: number;
    projects: number;
    activeProjects: number;
  };
  const byAccount = new Map<string, Agg>();
  const aggFor = (account: AccountLite): Agg => {
    let a = byAccount.get(account.id);
    if (!a) {
      a = { account, revenue: 0, cost: 0, projects: 0, activeProjects: 0 };
      byAccount.set(account.id, a);
    }
    return a;
  };
  for (const acc of baseAccounts) aggFor(acc);

  for (const p of projects) {
    const fx = fxFactor(p.currency, display);
    let winRevenue = 0;
    let winCost = 0;
    let plannedTotal = 0;
    let actualBeforeStart = 0;
    let actualThroughEnd = 0;

    for (const a of p.assignments) {
      const bill = a.billRate != null ? Number(a.billRate) * fx : 0;
      const cost = a.costRate != null ? Number(a.costRate) * fx : 0;
      for (const e of a.hourEntries) {
        plannedTotal += e.plannedHours != null ? Number(e.plannedHours) : 0;
        const actual = e.actualHours != null ? Number(e.actualHours) : 0;
        if (actual === 0) continue;
        const d = new Date(e.weekStartDate);
        if (d <= end) actualThroughEnd += actual;
        if (start !== null && d < start) actualBeforeStart += actual;
        const inWindow = (start === null || d >= start) && d <= end;
        if (inWindow) {
          winCost += actual * cost;
          if (p.pricingModel !== "fixed_price") winRevenue += actual * bill;
        }
      }
    }

    if (p.pricingModel === "fixed_price") {
      const contract = p.fixedPrice != null ? Number(p.fixedPrice) * fx : 0;
      const recognized = (hours: number) =>
        plannedTotal > 0
          ? contract * Math.min(hours / plannedTotal, 1)
          : hours > 0
            ? contract
            : 0;
      winRevenue = recognized(actualThroughEnd) - recognized(start === null ? 0 : actualBeforeStart);
    }

    const overlapsWindow = start === null || (p.startDate <= end && p.endDate >= start);
    const agg = aggFor(p.account);
    agg.revenue += winRevenue;
    agg.cost += winCost;
    if (overlapsWindow) agg.projects += 1;
    if (p.status === "active") agg.activeProjects += 1;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const accounts = Array.from(byAccount.values())
    .map((a) => {
      const profit = a.revenue - a.cost;
      return {
        id: a.account.id,
        name: a.account.name,
        code: a.account.code,
        projects: a.projects,
        activeProjects: a.activeProjects,
        revenue: r2(a.revenue),
        cost: r2(a.cost),
        profit: r2(profit),
        marginPct: a.revenue > 0 ? r2((profit / a.revenue) * 100) : null,
      };
    })
    .sort((x, y) => y.revenue - x.revenue);

  const sum = (f: (a: (typeof accounts)[number]) => number) =>
    r2(accounts.reduce((t, a) => t + f(a), 0));
  const totalRevenue = sum((a) => a.revenue);
  const totalCost = sum((a) => a.cost);
  const totals = {
    revenue: totalRevenue,
    cost: totalCost,
    profit: r2(totalRevenue - totalCost),
    marginPct: totalRevenue > 0 ? r2(((totalRevenue - totalCost) / totalRevenue) * 100) : null,
    projects: accounts.reduce((t, a) => t + a.projects, 0),
    activeProjects: accounts.reduce((t, a) => t + a.activeProjects, 0),
  };

  res.json({ scope, displayCurrency: display, slice, accounts, totals });
});

export default router;
