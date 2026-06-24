import PDFDocument from "pdfkit";
import type { AuthUser } from "../types";
import { getExportColumns } from "./financialSerializer";
import { computeProjectFinancials } from "./financialCalc";
import type { ResourceContext } from "../types";

/**
 * PDF export builder for project detail.
 *
 * Columns included follow getExportColumns(user, ctx). IC gets hours-only.
 * PM gets hours + bill rate + quoted fee. AC/BUL/AA (with flag) get everything.
 */

interface AssignmentRow {
  userName: string;
  projectRole: string;
  businessUnit: string;
  billRate: number;
  costRate: number;
  plannedHours: number;
  actualHours: number;
}

interface ProjectHeader {
  name: string;
  projectCode: string;
  accountName: string;
  owningBuName: string;
  startDate: string;
  endDate: string;
  status: string;
  contingencyPct: number;
  pricingModel: string;
  fixedPrice: number | null;
}

export async function buildProjectPdf(
  header: ProjectHeader,
  assignments: Array<{
    userName: string;
    projectRole: string;
    businessUnit: string;
    billRate: number;
    costRate: number;
    entries: Array<{ plannedHours: number | null; actualHours: number | null }>;
  }>,
  user: AuthUser,
  ctx: ResourceContext
): Promise<Buffer> {
  const cols = getExportColumns(user, ctx);

  const rows: AssignmentRow[] = assignments.map((a) => {
    const plannedHours = a.entries.reduce((s, e) => s + (e.plannedHours ?? 0), 0);
    const actualHours = a.entries.reduce((s, e) => s + (e.actualHours ?? 0), 0);
    return {
      userName: a.userName,
      projectRole: a.projectRole,
      businessUnit: a.businessUnit,
      billRate: a.billRate,
      costRate: a.costRate,
      plannedHours: round2(plannedHours),
      actualHours: round2(actualHours),
    };
  });

  const fin = computeProjectFinancials(
    assignments.map((a) => ({ billRate: a.billRate, costRate: a.costRate, entries: a.entries })),
    header.contingencyPct,
    { pricingModel: header.pricingModel, fixedPrice: header.fixedPrice }
  );

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // ── Title block ──
      doc.fontSize(18).fillColor("#111827").text("Quanta Project Report", { align: "left" });
      doc.moveDown(0.2);
      doc.fontSize(14).fillColor("#374151").text(`${header.name} · ${header.projectCode}`);
      doc.moveDown(0.5);

      doc.fontSize(9).fillColor("#6b7280");
      doc.text(`Account:          ${header.accountName}`);
      doc.text(`Owning BU:        ${header.owningBuName}`);
      doc.text(`Status:           ${header.status}`);
      doc.text(`Period:           ${header.startDate} → ${header.endDate}`);
      doc.text(`Contingency:      ${(header.contingencyPct * 100).toFixed(1)}%`);
      doc.moveDown(0.5);

      // ── Financial summary (if visible) ──
      doc.fontSize(12).fillColor("#111827").text("Summary");
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor("#374151");
      doc.text(`Total planned hours:      ${fin.totalPlannedHours}`);
      doc.text(`Total actual hours:       ${fin.totalActualHours}`);
      doc.text(`EAC hours:                ${fin.eacHours}`);

      if (cols.includeBillRate) {
        doc.text(`Quoted fee:               $${formatMoney(fin.totalFee)}`);
        doc.text(`Actual fee to date:       $${formatMoney(fin.totalActualFee)}`);
      }
      if (cols.includeFinancials) {
        doc.text(`Projected cost:           $${formatMoney(fin.totalCost)}`);
        doc.text(`Actual cost to date:      $${formatMoney(fin.totalActualCost)}`);
        doc.text(`Contingency amount:       $${formatMoney(fin.contingencyAmt)}`);
        doc.text(`Adjusted fee:             $${formatMoney(fin.adjustedFee)}`);
        doc.text(`Projected margin:         ${fin.marginPct}%`);
        doc.text(`Actual margin to date:    ${fin.actualMarginPct}%`);
      }
      doc.moveDown(0.8);

      // ── Resource table ──
      doc.fontSize(12).fillColor("#111827").text("Resources");
      doc.moveDown(0.2);

      // Build column definitions based on visibility.
      const cellW = buildColumns(cols);
      drawRow(doc, cellW.map((c) => c.label), cellW, true);
      for (const row of rows) {
        const cells = cellW.map((c) => c.value(row));
        drawRow(doc, cells, cellW, false);
      }

      doc.moveDown(1);
      doc.fontSize(8).fillColor("#9ca3af").text(
        `Generated ${new Date().toISOString()} · Quanta confidential`,
        { align: "right" }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

interface ColumnDef {
  label: string;
  width: number;
  value: (row: AssignmentRow) => string;
  align?: "left" | "right";
}

function buildColumns(cols: ReturnType<typeof getExportColumns>): ColumnDef[] {
  const base: ColumnDef[] = [
    { label: "Name", width: 110, value: (r) => r.userName },
    { label: "Role", width: 90, value: (r) => r.projectRole },
    { label: "BU", width: 80, value: (r) => r.businessUnit },
    { label: "Planned", width: 55, value: (r) => r.plannedHours.toString(), align: "right" },
    { label: "Actual", width: 55, value: (r) => r.actualHours.toString(), align: "right" },
  ];
  if (cols.includeBillRate) {
    base.push({
      label: "Bill $/h",
      width: 55,
      value: (r) => r.billRate.toFixed(2),
      align: "right",
    });
  }
  if (cols.includeCostRate) {
    base.push({
      label: "Cost $/h",
      width: 55,
      value: (r) => r.costRate.toFixed(2),
      align: "right",
    });
  }
  return base;
}

function drawRow(doc: PDFKit.PDFDocument, cells: string[], cols: ColumnDef[], header: boolean) {
  const rowHeight = 16;
  const startY = doc.y;
  let x = 40;

  if (header) {
    doc.rect(x, startY - 2, cols.reduce((s, c) => s + c.width, 0), rowHeight).fill("#f3f4f6");
    doc.fillColor("#111827");
  } else {
    doc.fillColor("#374151");
  }

  doc.fontSize(8);
  cells.forEach((text, i) => {
    const col = cols[i];
    doc.text(text, x + 4, startY + 2, {
      width: col.width - 8,
      align: col.align ?? "left",
    });
    x += col.width;
  });

  doc.y = startY + rowHeight;
  doc.fillColor("#000000");
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
