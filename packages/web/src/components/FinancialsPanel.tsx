import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { api } from "../lib/api";
import type { ProjectDetail, BurnSeries } from "../lib/types";
import { Card, CardBody, CardHeader, Spinner, Alert, EmptyState, Badge } from "./ui";
import { formatMoney, formatHours, formatPercent, formatDateShort } from "../lib/format";

/**
 * Financials panel — shown as a tab on the project detail page.
 *
 * Re-uses the same /burn endpoint but renders the fee/cost/margin cumulative
 * series rather than hours. Falls back to hours-only if the caller can't see
 * financials. Also shows per-resource breakdown (cost vs. fee) as a pie.
 *
 * Does NOT fetch /api/projects/:id itself — the parent page already holds
 * the ProjectDetail and passes it in. The burn query is its own thing and
 * lives here.
 */

export function FinancialsPanel({ detail }: { detail: ProjectDetail }) {
  const f = detail.financials;
  const canSeeFinancials = f.totalFee !== undefined;

  const burnQ = useQuery({
    queryKey: ["project", detail.project.id, "burn"],
    queryFn: () => api.get<BurnSeries>(`/api/projects/${detail.project.id}/burn`),
  });

  if (!canSeeFinancials) {
    return (
      <EmptyState
        title="Financials aren't visible to you"
        description="Ask your application admin to grant financial access, or reach out to the account manager."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Headline metrics ── */}
      <MetricsHeader detail={detail} />

      {/* ── Fee/Cost burn + margin trajectory ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <SectionTitle
                title="Fee & cost trajectory"
                subtitle="Cumulative quoted fee vs actual cost by week"
              />
            </CardHeader>
            <CardBody>
              {burnQ.isLoading && (
                <div className="flex justify-center py-12">
                  <Spinner color="indigo" />
                </div>
              )}
              {burnQ.error && <Alert tone="rose">Couldn&apos;t load burn data.</Alert>}
              {burnQ.data && (
                <FeeCostChart
                  burn={burnQ.data}
                  isFixedPrice={detail.project.pricingModel === "fixed_price"}
                />
              )}
            </CardBody>
          </Card>
        </div>

        <ResourceBreakdown detail={detail} />
      </div>

      {/* ── Resource-level fee/cost table ── */}
      <Card>
        <CardHeader>
          <SectionTitle
            title="Resource financials"
            subtitle="Planned vs actual fee and cost per resource"
          />
        </CardHeader>
        <ResourceFinancialsTable detail={detail} />
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Headline metrics — quick read of health
// ═══════════════════════════════════════════════════════════════

function MetricsHeader({ detail }: { detail: ProjectDetail }) {
  const f = detail.financials;
  const isFixedPrice = detail.project.pricingModel === "fixed_price";
  const fee = f.totalFee ?? 0;
  const actualFee = f.totalActualFee ?? 0;
  const cost = f.totalCost ?? 0;
  const actualCost = f.totalActualCost ?? 0;
  const margin = f.marginPct ?? 0;
  const actualMargin = f.actualMarginPct ?? 0;
  const marginDelta = actualMargin - margin;

  const feeProgress = fee > 0 ? (actualFee / fee) * 100 : 0;
  const costProgress = cost > 0 ? (actualCost / cost) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <MetricCard
        label={isFixedPrice ? "Contract value" : "Quoted fee"}
        value={formatMoney(fee)}
        hint={
          isFixedPrice
            ? "fixed price"
            : f.adjustedFee !== undefined
            ? `+ ${formatMoney(f.adjustedFee - fee)} contingency`
            : undefined
        }
      />
      {isFixedPrice ? (
        <MetricCard
          label="Projected cost"
          value={formatMoney(cost)}
          hint={`${fee > 0 ? ((cost / fee) * 100).toFixed(0) : 0}% of contract`}
        />
      ) : (
        <MetricCard
          label="Fee burned"
          value={formatMoney(actualFee)}
          hint={`${feeProgress.toFixed(0)}% of quote`}
          bar={{ pct: Math.min(100, feeProgress), tone: feeProgress > 100 ? "rose" : "indigo" }}
        />
      )}
      <MetricCard
        label="Cost burned"
        value={formatMoney(actualCost)}
        hint={`${costProgress.toFixed(0)}% of plan`}
        bar={{
          pct: Math.min(100, costProgress),
          tone: costProgress > 100 ? "rose" : costProgress > 80 ? "amber" : "emerald",
        }}
      />
      <MetricCard
        label="Margin"
        value={formatPercent(actualMargin)}
        hint={
          marginDelta !== 0 ? (
            <>
              {marginDelta > 0 ? "▲" : "▼"} {formatPercent(Math.abs(marginDelta))} vs plan
              <span className="text-gray-400"> ({formatPercent(margin)})</span>
            </>
          ) : (
            <>On plan ({formatPercent(margin)})</>
          )
        }
        tone={actualMargin >= 35 ? "emerald" : actualMargin >= 25 ? "amber" : "rose"}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Fee/cost cumulative line chart
// ═══════════════════════════════════════════════════════════════

function FeeCostChart({ burn, isFixedPrice }: { burn: BurnSeries; isFixedPrice: boolean }) {
  if (!burn.includesFinancials || burn.series.length === 0) {
    return (
      <EmptyState
        title="No financial data yet"
        description="Fee and cost lines appear once hours are logged against this project."
      />
    );
  }

  const rows = burn.series.map((p) => ({
    week: p.week + 1,
    weekLabel: `W${p.week + 1}`,
    dateLabel: formatDateShort(p.weekStart),
    plannedFee: p.plannedFeeCumulative ?? 0,
    actualFee: p.actualFeeCumulative ?? 0,
    plannedCost: p.plannedCostCumulative ?? 0,
    actualCost: p.actualCostCumulative ?? 0,
  }));

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="weekLabel" stroke="#9ca3af" style={{ fontSize: 11 }} tickLine={false} />
          <YAxis
            stroke="#9ca3af"
            style={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
            labelFormatter={(label, p) => `${label} · ${p?.[0]?.payload?.dateLabel ?? ""}`}
            formatter={(value: number) => formatMoney(value)}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {!isFixedPrice && (
            <Line
              type="monotone"
              dataKey="plannedFee"
              name="Planned fee"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={2}
              dot={false}
            />
          )}
          {!isFixedPrice && (
            <Line
              type="monotone"
              dataKey="actualFee"
              name="Actual fee"
              stroke="#4f46e5"
              strokeWidth={2.5}
              dot={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="plannedCost"
            name="Planned cost"
            stroke="#fca5a5"
            strokeDasharray="4 4"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="actualCost"
            name="Actual cost"
            stroke="#dc2626"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Cost-by-resource pie
// ═══════════════════════════════════════════════════════════════

const PIE_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e", "#8b5cf6", "#14b8a6", "#ec4899"];

function ResourceBreakdown({ detail }: { detail: ProjectDetail }) {
  const data = detail.assignments
    .map((a) => ({
      name: a.user.name,
      cost: a.actualCost ?? a.plannedCost ?? 0,
    }))
    .filter((a) => a.cost > 0)
    .sort((a, b) => b.cost - a.cost);

  const totalCost = data.reduce((s, d) => s + d.cost, 0);

  return (
    <Card>
      <CardHeader>
        <SectionTitle title="Cost by resource" subtitle="Where the budget is going" />
      </CardHeader>
      <CardBody>
        {data.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-10">No cost data yet.</div>
        ) : (
          <>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="cost"
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-1.5">
              {data.slice(0, 6).map((r, i) => {
                const pct = (r.cost / totalCost) * 100;
                return (
                  <div key={r.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-gray-700 truncate">{r.name}</span>
                    </div>
                    <div className="text-gray-500 tabular-nums flex-shrink-0 ml-2">
                      {formatMoney(r.cost)} ({pct.toFixed(0)}%)
                    </div>
                  </div>
                );
              })}
              {data.length > 6 && (
                <div className="text-xs text-gray-400 pt-1">
                  + {data.length - 6} more…
                </div>
              )}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Per-resource financials table
// ═══════════════════════════════════════════════════════════════

function ResourceFinancialsTable({ detail }: { detail: ProjectDetail }) {
  const isFixedPrice = detail.project.pricingModel === "fixed_price";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
          <tr>
            <th className="text-left px-6 py-3 font-medium">Resource</th>
            <th className="text-right px-6 py-3 font-medium">
              {isFixedPrice ? "Cost rate" : "Bill / Cost"}
            </th>
            <th className="text-right px-6 py-3 font-medium">Planned hrs</th>
            <th className="text-right px-6 py-3 font-medium">Actual hrs</th>
            {!isFixedPrice && <th className="text-right px-6 py-3 font-medium">Planned fee</th>}
            {!isFixedPrice && <th className="text-right px-6 py-3 font-medium">Actual fee</th>}
            <th className="text-right px-6 py-3 font-medium">Planned cost</th>
            <th className="text-right px-6 py-3 font-medium">Actual cost</th>
            {!isFixedPrice && <th className="text-right px-6 py-3 font-medium">Margin</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {detail.assignments.map((a) => {
            const planFee = a.plannedFee ?? 0;
            const planCost = a.plannedCost ?? 0;
            const actFee = a.actualFee ?? 0;
            const actCost = a.actualCost ?? 0;
            const actualMargin = actFee > 0 ? ((actFee - actCost) / actFee) * 100 : null;
            return (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-6 py-3">
                  <div className="font-medium text-gray-900">{a.user.name}</div>
                  <div className="text-[10px] text-gray-400">{a.projectRole}</div>
                </td>
                <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                  {isFixedPrice
                    ? a.costRate != null
                      ? `$${a.costRate}/h`
                      : "—"
                    : a.billRate != null && a.costRate != null
                    ? `$${a.billRate} / $${a.costRate}`
                    : "—"}
                </td>
                <td className="px-6 py-3 text-right text-gray-600 tabular-nums">
                  {formatHours(a.plannedHours)}h
                </td>
                <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                  {formatHours(a.actualHours)}h
                </td>
                {!isFixedPrice && (
                  <td className="px-6 py-3 text-right text-gray-600 tabular-nums">
                    {formatMoney(planFee)}
                  </td>
                )}
                {!isFixedPrice && (
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {formatMoney(actFee)}
                  </td>
                )}
                <td className="px-6 py-3 text-right text-gray-600 tabular-nums">
                  {formatMoney(planCost)}
                </td>
                <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                  {formatMoney(actCost)}
                </td>
                {!isFixedPrice && (
                  <td className="px-6 py-3 text-right">
                    {actualMargin != null ? (
                      <Badge tone={actualMargin >= 35 ? "emerald" : actualMargin >= 25 ? "amber" : "rose"}>
                        {formatPercent(actualMargin)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared sub-components
// ═══════════════════════════════════════════════════════════════

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "gray",
  bar,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: "gray" | "emerald" | "amber" | "rose";
  bar?: { pct: number; tone: "emerald" | "amber" | "rose" | "indigo" };
}) {
  const toneClass = {
    gray: "text-gray-900",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[tone];
  const barTone = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    indigo: "bg-indigo-500",
  };
  return (
    <Card>
      <CardBody>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${toneClass}`}>{value}</div>
        {bar && (
          <div className="w-full h-1.5 rounded-full bg-gray-100 mt-2 overflow-hidden">
            <div
              className={`h-full rounded-full ${barTone[bar.tone]} transition-all`}
              style={{ width: `${Math.min(100, bar.pct)}%` }}
            />
          </div>
        )}
        {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
      </CardBody>
    </Card>
  );
}
