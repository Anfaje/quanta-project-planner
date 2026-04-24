import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import type { ProjectDetail } from "../lib/types";
import { Layout } from "../components/Layout";
import {
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Alert,
  Badge,
  Button,
  PageHeader,
} from "../components/ui";
import {
  formatMoney,
  formatHours,
  formatPercent,
  formatDate,
  statusColorClasses,
} from "../lib/format";
import { HoursGridPanel } from "../components/HoursGridPanel";
import { BurnChartPanel } from "../components/BurnChartPanel";

/**
 * Project detail — three-tab view: overview, hours, burn.
 *
 * Overview is the default: metadata + summary financials + resource table.
 * Hours and burn are heavier panels loaded lazily via their own queries.
 */

type Tab = "overview" | "hours" | "burn";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "hours", label: "Hours grid" },
  { id: "burn", label: "Burn chart" },
];

export function ProjectDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get<ProjectDetail>(`/api/projects/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-24">
          <Spinner size="lg" color="indigo" />
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <Alert tone="rose" title="Couldn't load project">
          The project may not exist, or you may not have access to it.
        </Alert>
        <Link to="/projects" className="text-sm text-indigo-600 hover:text-indigo-700 mt-4 inline-block">
          ← Back to projects
        </Link>
      </Layout>
    );
  }

  const p = data.project;
  const exportCsv = () => api.download(`/api/projects/${p.id}/export.csv`);
  const exportPdf = () => api.download(`/api/projects/${p.id}/export.pdf`);

  return (
    <Layout>
      <div className="mb-2">
        <Link to="/projects" className="text-xs text-gray-400 hover:text-indigo-600">
          ← Projects
        </Link>
      </div>

      <PageHeader
        title={p.name}
        subtitle={`${p.projectCode} · ${p.account.name} · ${p.owningBu.name}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv}>
              Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={exportPdf}>
              Export PDF
            </Button>
          </>
        }
      />

      {/* ── Meta strip ── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <span
          className={`inline-flex px-2 py-0.5 text-xs font-medium border rounded-full ${statusColorClasses(
            p.status
          )}`}
        >
          {p.status.replace("_", " ")}
        </span>
        <div className="text-xs text-gray-500">
          {formatDate(p.startDate)} – {formatDate(p.endDate)} · {p.totalWeeks} weeks
        </div>
        {p.sharedWithBus.length > 0 && (
          <div className="text-xs text-gray-500">
            Shared with {p.sharedWithBus.map((b) => b.code).join(", ")}
          </div>
        )}
        <div className="text-xs text-gray-500">
          Contingency {formatPercent(p.contingencyPct * 100)}
        </div>
      </div>

      {/* ── Summary metrics ── */}
      <SummaryMetrics data={data} />

      {/* ── Tabs ── */}
      <div className="mt-6 border-b border-gray-200 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "hours" && <HoursGridPanel projectId={p.id} />}
        {tab === "burn" && <BurnChartPanel projectId={p.id} />}
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Overview tab
// ═══════════════════════════════════════════════════════════════

function SummaryMetrics({ data }: { data: ProjectDetail }) {
  const f = data.financials;
  const hasFinancials = f.totalFee !== undefined;

  return (
    <Card>
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <Metric
            label="Hours"
            value={`${formatHours(f.totalActualHours)} / ${formatHours(f.totalPlannedHours)}`}
            hint={`EAC ${formatHours(f.eacHours)}h`}
          />
          {hasFinancials && (
            <>
              <Metric
                label="Quoted fee"
                value={formatMoney(f.totalFee)}
                hint={f.adjustedFee !== undefined ? `+ contingency ${formatMoney(f.adjustedFee)}` : undefined}
              />
              {f.totalCost !== undefined && (
                <Metric
                  label="Cost"
                  value={formatMoney(f.totalCost)}
                  hint={
                    f.totalActualCost !== undefined
                      ? `Actual ${formatMoney(f.totalActualCost)}`
                      : undefined
                  }
                />
              )}
              {f.marginPct !== undefined && (
                <Metric
                  label="Margin"
                  value={formatPercent(f.marginPct)}
                  hint={
                    f.actualMarginPct !== undefined
                      ? `Actual ${formatPercent(f.actualMarginPct)}`
                      : undefined
                  }
                  tone={f.marginPct >= 35 ? "emerald" : f.marginPct >= 25 ? "amber" : "rose"}
                />
              )}
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function OverviewTab({ data }: { data: ProjectDetail }) {
  const { assignments, project } = data;

  return (
    <div className="space-y-6">
      {project.description && (
        <Card>
          <CardBody>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              About
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-line">{project.description}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Resources</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {assignments.length} resource{assignments.length === 1 ? "" : "s"} assigned
              </p>
            </div>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Name</th>
                <th className="text-left px-6 py-3 font-medium">Role</th>
                <th className="text-left px-6 py-3 font-medium">BU</th>
                {assignments.some((a) => a.billRate !== undefined) && (
                  <th className="text-right px-6 py-3 font-medium">Bill $/h</th>
                )}
                {assignments.some((a) => a.costRate !== undefined) && (
                  <th className="text-right px-6 py-3 font-medium">Cost $/h</th>
                )}
                <th className="text-right px-6 py-3 font-medium">Planned</th>
                <th className="text-right px-6 py-3 font-medium">Actual</th>
                {assignments.some((a) => a.plannedFee !== undefined) && (
                  <th className="text-right px-6 py-3 font-medium">Fee</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <div className="text-sm font-medium text-gray-900">{a.user.name}</div>
                    <div className="text-xs text-gray-400">{a.user.email}</div>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{a.projectRole}</td>
                  <td className="px-6 py-3">
                    <Badge>{a.businessUnit}</Badge>
                  </td>
                  {assignments.some((x) => x.billRate !== undefined) && (
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {a.billRate != null ? `$${a.billRate}` : "—"}
                    </td>
                  )}
                  {assignments.some((x) => x.costRate !== undefined) && (
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {a.costRate != null ? `$${a.costRate}` : "—"}
                    </td>
                  )}
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {formatHours(a.plannedHours)}h
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {formatHours(a.actualHours)}h
                  </td>
                  {assignments.some((x) => x.plannedFee !== undefined) && (
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {a.plannedFee != null ? formatMoney(a.plannedFee) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "gray",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "gray" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    gray: "text-gray-900",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[tone];
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}
