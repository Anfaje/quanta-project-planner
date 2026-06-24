import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { canAccessProject } from "../lib/permissions";
import { loadProjectContext } from "../services/projectAccess";
import { getExportColumns } from "../services/financialSerializer";
import { buildProjectPdf } from "../services/pdfExport";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/projects/:id/export.csv
 *
 * Flat row per (assignment × week). Columns included depend on caller's
 * financial visibility for this project.
 */
router.get("/projects/:id/export.csv", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds })) {
    return res.status(403).json({ error: "No access to this project" });
  }

  const cols = getExportColumns(user, ctx.ctx);

  const project = await prisma.project.findUnique({
    where: { id: ctx.id },
    include: {
      account: { select: { code: true, name: true } },
      owningBu: { select: { code: true } },
      assignments: {
        include: {
          user: { select: { name: true, email: true } },
          hourEntries: { orderBy: { projectWeek: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  // Column set
  const headers = [
    "project_code",
    "project_name",
    "account_code",
    "owning_bu",
    "resource_name",
    "resource_email",
    "project_role",
    "business_unit",
    "week",
    "week_start_date",
    "planned_hours",
    "actual_hours",
    "locked",
  ];
  if (cols.includeBillRate) headers.push("bill_rate", "planned_fee", "actual_fee");
  if (cols.includeCostRate) headers.push("cost_rate", "planned_cost", "actual_cost");

  const rows: Record<string, any>[] = [];
  for (const a of project.assignments) {
    for (const e of a.hourEntries) {
      const planned = e.plannedHours != null ? Number(e.plannedHours) : null;
      const actual = e.actualHours != null ? Number(e.actualHours) : null;
      const bill = Number(a.billRate);
      const cost = Number(a.costRate);

      const row: Record<string, any> = {
        project_code: project.projectCode,
        project_name: project.name,
        account_code: project.account.code,
        owning_bu: project.owningBu.code,
        resource_name: a.user.name,
        resource_email: a.user.email,
        project_role: a.projectRole,
        business_unit: a.businessUnit,
        week: e.projectWeek,
        week_start_date: e.weekStartDate.toISOString().slice(0, 10),
        planned_hours: planned ?? "",
        actual_hours: actual ?? "",
        locked: e.locked ? "true" : "false",
      };
      if (cols.includeBillRate) {
        row.bill_rate = bill.toFixed(2);
        row.planned_fee = planned != null ? (planned * bill).toFixed(2) : "";
        row.actual_fee = actual != null ? (actual * bill).toFixed(2) : "";
      }
      if (cols.includeCostRate) {
        row.cost_rate = cost.toFixed(2);
        row.planned_cost = planned != null ? (planned * cost).toFixed(2) : "";
        row.actual_cost = actual != null ? (actual * cost).toFixed(2) : "";
      }
      rows.push(row);
    }
  }

  const csv = toCsv(rows, headers);
  const filename = `${project.projectCode}_hours.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

/**
 * GET /api/projects/:id/export.pdf
 *
 * One-page(ish) project summary + resource table. Financial fields scoped.
 */
router.get("/projects/:id/export.pdf", async (req: Request, res: Response) => {
  const user = req.authUser!;
  const ctx = await loadProjectContext(prisma, req.params.id);
  if (!ctx) return res.status(404).json({ error: "Project not found" });

  if (!canAccessProject(user, { ...ctx.ctx, assignedUserIds: ctx.assignedUserIds })) {
    return res.status(403).json({ error: "No access to this project" });
  }

  const project = await prisma.project.findUnique({
    where: { id: ctx.id },
    include: {
      account: { select: { name: true } },
      owningBu: { select: { name: true } },
      assignments: {
        include: {
          user: { select: { name: true } },
          hourEntries: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  const pdf = await buildProjectPdf(
    {
      name: project.name,
      projectCode: project.projectCode,
      accountName: project.account.name,
      owningBuName: project.owningBu.name,
      startDate: project.startDate.toISOString().slice(0, 10),
      endDate: project.endDate.toISOString().slice(0, 10),
      status: project.status,
      contingencyPct: Number(project.contingencyPct),
      pricingModel: project.pricingModel,
      fixedPrice: project.fixedPrice != null ? Number(project.fixedPrice) : null,
    },
    project.assignments.map((a) => ({
      userName: a.user.name,
      projectRole: a.projectRole,
      businessUnit: a.businessUnit,
      billRate: a.billRate != null ? Number(a.billRate) : 0,
      costRate: Number(a.costRate),
      entries: a.hourEntries.map((e) => ({
        plannedHours: e.plannedHours != null ? Number(e.plannedHours) : null,
        actualHours: e.actualHours != null ? Number(e.actualHours) : null,
      })),
    })),
    user,
    ctx.ctx
  );

  const filename = `${project.projectCode}_report.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(pdf);
});

// ── CSV serializer ──

function toCsv(rows: Record<string, any>[], columns: string[]): string {
  const escape = (v: any): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const header = columns.join(",");
  const lines = rows.map((row) => columns.map((c) => escape(row[c])).join(","));
  // Prepend UTF-8 BOM so Excel opens it with accented characters intact.
  return "\uFEFF" + [header, ...lines].join("\n");
}

export default router;
