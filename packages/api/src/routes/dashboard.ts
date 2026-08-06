import { Router, Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { getDashboardSections, canViewFinancials } from "../lib/permissions";
import { buildProjectAccessFilter } from "../services/projectAccess";
import { computeProjectFinancials, TARGET_MARGIN_PCT } from "../services/financialCalc";
import { serializeForUser } from "../services/financialSerializer";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/dashboard
 *
 * Returns an adaptive payload: only the sections relevant to the caller's
 * role union are populated. Everything financial is still routed through the
 * serialiser so even if a new section is added carelessly, restricted fields
 * don't leak.
 *
 * Sections (order matches getDashboardSections):
 *   bu_health         — BUL: revenue / margin / headcount vs targets
 *   account_overview  — AC:  managed accounts + project rollups
 *   platform_admin    — AA:  user/domain/BU/account/audit counts
 *   project_health    — PM:  their active projects with burn status
 *   my_hours          — IC:  their current-week status per project
 */
router.get("/", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const sections = getDashboardSections(user);

  const payload: Record<string, any> = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      primaryBuId: user.primaryBuId,
    },
    sections,
  };

  // ── my_hours (IC) ──
  if (sections.includes("my_hours")) {
    payload.myHours = await buildMyHoursSection(user);
  }

  // ── project_health (PM) ──
  if (sections.includes("project_health")) {
    payload.projectHealth = await buildProjectHealthSection(user);
  }

  // ── account_overview (AC) ──
  if (sections.includes("account_overview")) {
    payload.accountOverview = await buildAccountOverviewSection(user);
  }

  // ── bu_health (BUL) ──
  if (sections.includes("bu_health")) {
    payload.buHealth = await buildBuHealthSection(user);
  }

  // ── platform_admin (AA) ──
  if (sections.includes("platform_admin")) {
    payload.platformAdmin = await buildPlatformAdminSection();
  }

  res.json(payload);
});

// ═══════════════════════════════════════════════════════════════
// Section builders
// ═══════════════════════════════════════════════════════════════

async function buildMyHoursSection(user: any) {
  // Active assignments for the caller, with latest-week entry state.
  const assignments = await prisma.resourceAssignment.findMany({
    where: { userId: user.id, project: { status: { in: ["active", "on_hold"] } } },
    include: {
      project: {
        select: { id: true, name: true, projectCode: true, startDate: true, endDate: true, status: true },
      },
      hourEntries: { orderBy: { projectWeek: "asc" } },
    },
  });

  const today = new Date();
  return assignments.map((a) => {
    const entries = a.hourEntries;

    // Current project-week = floor((today - start) / 7 days)
    const startMs = new Date(a.project.startDate).getTime();
    const weekIdx = Math.max(0, Math.floor((today.getTime() - startMs) / (7 * 86_400_000)));

    const thisWeek = entries.find((e) => e.projectWeek === weekIdx);
    const unfilledWeeks = entries.filter(
      (e) => !e.locked && e.plannedHours != null && Number(e.plannedHours) > 0 && e.actualHours == null
    ).length;

    const totalPlanned = entries.reduce((s, e) => s + (e.plannedHours != null ? Number(e.plannedHours) : 0), 0);
    const totalActual = entries.reduce((s, e) => s + (e.actualHours != null ? Number(e.actualHours) : 0), 0);

    return {
      projectId: a.project.id,
      projectName: a.project.name,
      projectCode: a.project.projectCode,
      projectStatus: a.project.status,
      projectRole: a.projectRole,
      currentWeek: weekIdx,
      currentWeekPlanned: thisWeek?.plannedHours != null ? Number(thisWeek.plannedHours) : null,
      currentWeekActual: thisWeek?.actualHours != null ? Number(thisWeek.actualHours) : null,
      currentWeekLocked: thisWeek?.locked ?? false,
      unfilledWeeks,
      totalPlanned: round2(totalPlanned),
      totalActual: round2(totalActual),
    };
  });
}

async function buildProjectHealthSection(user: any) {
  // Projects the user can see (via any role), focused on active ones.
  const accessFilter = buildProjectAccessFilter(user);
  const projects = await prisma.project.findMany({
    where: { AND: [accessFilter, { status: { in: ["active", "on_hold"] } }] },
    include: {
      account: { select: { id: true, name: true, code: true } },
      owningBu: { select: { id: true, code: true, name: true } },
      shares: { select: { sharedWithBuId: true } },
      assignments: { include: { hourEntries: true } },
    },
    orderBy: { startDate: "desc" },
    take: 50,
  });

  return projects.map((p) => {
    const ctx = {
      projectId: p.id,
      projectAccountId: p.accountId,
      projectOwningBuId: p.owningBuId,
      projectSharedBuIds: p.shares.map((s) => s.sharedWithBuId),
    };
    const fin = computeProjectFinancials(
      p.assignments.map((a) => ({
        billRate: a.billRate,
        costRate: a.costRate,
        entries: a.hourEntries,
      })),
      p.contingencyPct,
      { pricingModel: p.pricingModel, fixedPrice: p.fixedPrice }
    );
    // EAC vs planned — a simple health signal anyone can see.
    const overrun = fin.totalPlannedHours > 0
      ? round2(((fin.eacHours - fin.totalPlannedHours) / fin.totalPlannedHours) * 100)
      : 0;

    return serializeForUser(
      {
        id: p.id,
        name: p.name,
        projectCode: p.projectCode,
        status: p.status,
        account: p.account,
        owningBu: p.owningBu,
        startDate: p.startDate,
        endDate: p.endDate,
        resourceCount: p.assignments.length,
        totalPlannedHours: fin.totalPlannedHours,
        totalActualHours: fin.totalActualHours,
        eacHours: fin.eacHours,
        overrunPct: overrun,
        totalFee: fin.totalFee,
        totalCost: fin.totalCost,
        marginPct: fin.marginPct,
        actualMarginPct: fin.actualMarginPct,
        adjustedFee: fin.adjustedFee,
      },
      user,
      ctx
    );
  });
}

async function buildAccountOverviewSection(user: any) {
  if (user.managedAccountIds.length === 0) return { accounts: [] };

  const accounts = await prisma.account.findMany({
    where: { id: { in: user.managedAccountIds } },
    include: {
      projects: {
        where: { status: { in: ["active", "on_hold"] } },
        include: {
          shares: { select: { sharedWithBuId: true } },
          assignments: { include: { hourEntries: true } },
        },
      },
    },
  });

  return {
    accounts: accounts.map((acct) => {
      const projectRows = acct.projects.map((p) => {
        const ctx = {
          projectId: p.id,
          projectAccountId: p.accountId,
          projectOwningBuId: p.owningBuId,
          projectSharedBuIds: p.shares.map((s) => s.sharedWithBuId),
        };
        const fin = computeProjectFinancials(
          p.assignments.map((a) => ({
            billRate: a.billRate,
            costRate: a.costRate,
            entries: a.hourEntries,
          })),
          p.contingencyPct,
          { pricingModel: p.pricingModel, fixedPrice: p.fixedPrice }
        );
        return serializeForUser(
          {
            id: p.id,
            name: p.name,
            projectCode: p.projectCode,
            status: p.status,
            totalFee: fin.totalFee,
            totalCost: fin.totalCost,
            marginPct: fin.marginPct,
            actualMarginPct: fin.actualMarginPct,
            totalPlannedHours: fin.totalPlannedHours,
            totalActualHours: fin.totalActualHours,
          },
          user,
          ctx
        );
      });
      return {
        id: acct.id,
        name: acct.name,
        code: acct.code,
        projectCount: acct.projects.length,
        projects: projectRows,
      };
    }),
  };
}

/**
 * Monthly trajectory for a BU's current calendar year. Buckets actual hours
 * into the month of each entry's week-start date, summing revenue
 * (hours × bill rate) and cost (hours × cost rate), and collecting distinct
 * contributors per month as a headcount proxy. Monthly targets are the annual
 * config values / 12 — a flat pace line until a month-by-month plan exists.
 * Financial fields are included only when the viewer can see financials.
 */
function computeMonthlyTrajectory(
  projects: Array<{
    assignments: Array<{
      billRate: unknown;
      costRate: unknown;
      userId: string;
      hourEntries: Array<{ weekStartDate: Date; actualHours: unknown }>;
    }>;
  }>,
  opts: {
    year: number;
    revenueTarget: number;
    marginTarget: number;
    headcountTarget: number;
    showFinancials: boolean;
  }
) {
  const months = Array.from({ length: 12 }, (_, m) => ({
    key: `${opts.year}-${String(m + 1).padStart(2, "0")}`,
    revenue: 0,
    cost: 0,
    contributors: new Set<string>(),
  }));

  for (const p of projects) {
    for (const a of p.assignments) {
      const bill = Number(a.billRate);
      const cost = Number(a.costRate);
      for (const e of a.hourEntries) {
        const d = new Date(e.weekStartDate);
        if (d.getUTCFullYear() !== opts.year) continue;
        const actual = e.actualHours == null ? 0 : Number(e.actualHours);
        if (actual <= 0) continue;
        const slot = months[d.getUTCMonth()];
        slot.revenue += actual * bill;
        slot.cost += actual * cost;
        slot.contributors.add(a.userId);
      }
    }
  }

  const revTarget = opts.revenueTarget > 0 ? opts.revenueTarget / 12 : null;
  const profitTarget =
    opts.revenueTarget > 0 ? (opts.revenueTarget * opts.marginTarget) / 12 : null;
  const hcTarget = opts.headcountTarget > 0 ? opts.headcountTarget : null;

  return months.map((m) => ({
    month: m.key,
    headcount: m.contributors.size,
    headcountTarget: hcTarget,
    ...(opts.showFinancials
      ? {
          revenue: round2(m.revenue),
          profit: round2(m.revenue - m.cost),
          revenueTarget: revTarget != null ? round2(revTarget) : null,
          profitTarget: profitTarget != null ? round2(profitTarget) : null,
        }
      : {}),
  }));
}

async function buildBuHealthSection(user: any) {
  const buId = user.primaryBuId;

  // Fetch the BU first so we can key the config lookup by its code.
  const bu = await prisma.businessUnit.findUnique({
    where: { id: buId },
    select: { id: true, code: true, name: true },
  });
  const buCode = bu?.code ?? "";

  const [config, projects, activeHeadcount] = await Promise.all([
    prisma.globalConfig.findMany({
      where: {
        key: {
          in: [
            `yearly_revenue_target_${buCode}`,
            "yearly_margin_target",
            `headcount_target_${buCode}`,
          ],
        },
      },
    }),
    prisma.project.findMany({
      where: {
        OR: [{ owningBuId: buId }, { shares: { some: { sharedWithBuId: buId } } }],
        status: { in: ["active", "on_hold", "complete"] },
      },
      include: {
        shares: { select: { sharedWithBuId: true } },
        assignments: { include: { hourEntries: true } },
      },
    }),
    prisma.user.count({ where: { primaryBuId: buId, isActive: true } }),
  ]);

  const ctx = { projectOwningBuId: buId, projectSharedBuIds: [] };
  const showFinancials = canViewFinancials(user, ctx);

  // Aggregate YTD actual fee + cost across all projects in the BU.
  let ytdRevenue = 0;
  let ytdCost = 0;
  let totalFee = 0;
  let totalCost = 0;
  let atRiskCount = 0;

  for (const p of projects) {
    const fin = computeProjectFinancials(
      p.assignments.map((a) => ({
        billRate: a.billRate,
        costRate: a.costRate,
        entries: a.hourEntries,
      })),
      p.contingencyPct,
      { pricingModel: p.pricingModel, fixedPrice: p.fixedPrice }
    );
    ytdRevenue += fin.totalActualFee;
    ytdCost += fin.totalActualCost;
    totalFee += fin.totalFee;
    totalCost += fin.totalCost;
    // "At risk" = projected margin < 35%
    if (fin.marginPct > 0 && fin.marginPct < TARGET_MARGIN_PCT) atRiskCount += 1;
  }

  const configMap: Record<string, string> = {};
  for (const c of config) configMap[c.key] = c.value;
  const revenueTarget = Number(configMap[`yearly_revenue_target_${buCode}`] ?? "0");
  const marginTarget = Number(configMap["yearly_margin_target"] ?? "0.40");
  const headcountTarget = Number(configMap[`headcount_target_${buCode}`] ?? "0");

  const result: Record<string, any> = {
    businessUnit: bu,
    headcount: { active: activeHeadcount, target: headcountTarget || null },
    atRiskProjectCount: atRiskCount,
    totalProjects: projects.length,
  };

  // Monthly trajectory for the current calendar year, derived from the same
  // project/hour data already loaded. Revenue/profit are actuals bucketed by
  // the month each week falls in; headcount is the count of distinct
  // contributors who logged hours that month. Monthly targets are a flat
  // pro-rata of the annual config values (a reasonable pace line until a
  // month-by-month plan exists). Financial series are omitted for viewers
  // without financial visibility — headcount still shows.
  result.trajectory = computeMonthlyTrajectory(projects, {
    year: new Date().getUTCFullYear(),
    revenueTarget,
    marginTarget,
    headcountTarget,
    showFinancials,
  });

  if (showFinancials) {
    result.revenueYtd = round2(ytdRevenue);
    result.revenueTarget = revenueTarget || null;
    result.revenueAttainmentPct = revenueTarget > 0 ? round2((ytdRevenue / revenueTarget) * 100) : null;
    result.actualMarginPct = ytdRevenue > 0 ? round2(((ytdRevenue - ytdCost) / ytdRevenue) * 100) : 0;
    result.projectedMarginPct = totalFee > 0 ? round2(((totalFee - totalCost) / totalFee) * 100) : 0;
    result.marginTargetPct = round2(marginTarget * 100);
  }

  return result;
}

async function buildPlatformAdminSection() {
  const [userCount, activeUserCount, domainCount, buCount, accountCount, recentAudit] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.domainWhitelist.count(),
      prisma.businessUnit.count({ where: { isActive: true } }),
      prisma.account.count({ where: { isActive: true } }),
      prisma.auditLog.findMany({
        orderBy: { changedAt: "desc" },
        take: 10,
        include: { changedByUser: { select: { id: true, name: true, email: true } } },
      }),
    ]);

  return {
    userCount,
    activeUserCount,
    domainCount,
    buCount,
    accountCount,
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      entityType: a.entityType,
      entityId: a.entityId,
      field: a.field,
      oldValue: a.oldValue,
      newValue: a.newValue,
      changedAt: a.changedAt,
      changedBy: a.changedByUser,
    })),
  };
}

// ── Internal helpers ──

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export default router;
