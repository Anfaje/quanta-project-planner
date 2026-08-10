import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HoursGridPanel } from "../components/HoursGridPanel";
import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "../lib/api";
import type { Dashboard, BuHealthTrajectoryPoint } from "../lib/types";
import { useMe } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import { Card, CardBody, CardHeader, Badge, Spinner, Alert, EmptyState } from "../components/ui";
import {
  formatMoney,
  formatHours,
  formatPercent,
  formatPercentSigned,
  formatRelative,
  statusColorClasses,
} from "../lib/format";

/**
 * Dashboard — adaptive. The API computes getDashboardSections(user) and
 * returns only the sections the caller's role union unlocks. This component
 * iterates the returned `sections` array in order to preserve the API's
 * chosen priority (BUL health above project health above my hours, etc.).
 */

export function DashboardPage() {
  const me = useMe();
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<Dashboard>("/api/dashboard"),
  });

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Hello, {me.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Here&apos;s your Quanta overview for today.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="md" color="indigo" />
        </div>
      )}

      {error && (
        <Alert tone="rose" title="Couldn't load your dashboard">
          Try refreshing the page. If the problem continues, check that the API is reachable.
        </Alert>
      )}

      {data && (
        <div className="space-y-6">
          {data.sections.map((section) => {
            switch (section) {
              case "bu_health":
                return data.buHealth ? (
                  <BuHealthSection key={section} data={data.buHealth} />
                ) : null;
              case "account_overview":
                return data.accountOverview ? (
                  <AccountOverviewSection key={section} data={data.accountOverview} />
                ) : null;
              case "project_health":
                return data.projectHealth ? (
                  <ProjectHealthSection key={section} rows={data.projectHealth} />
                ) : null;
              case "my_hours":
                return data.myHours ? <MyHoursSection key={section} rows={data.myHours} /> : null;
              case "platform_admin":
                return data.platformAdmin ? (
                  <PlatformAdminSection key={section} data={data.platformAdmin} />
                ) : null;
              default:
                return null;
            }
          })}
        </div>
      )}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section: my_hours  — IC view
// ═══════════════════════════════════════════════════════════════

function MyHoursSection({ rows }: { rows: NonNullable<Dashboard["myHours"]> }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionTitle
            title="My hours"
            subtitle="Your current week across active projects"
          />
        </CardHeader>
        <CardBody>
          <EmptyState
            title="No active assignments"
            description="Once you're assigned to a project it'll show up here with your weekly tally."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <SectionTitle title="My hours" subtitle="Your current week across active projects" />
      </CardHeader>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => {
          const progress =
            r.currentWeekPlanned != null && r.currentWeekPlanned > 0
              ? Math.min(100, ((r.currentWeekActual ?? 0) / r.currentWeekPlanned) * 100)
              : 0;
          return (
            <div key={r.projectId}>
              <button
                type="button"
                onClick={() => toggle(r.projectId)}
                aria-expanded={open.has(r.projectId)}
                className="w-full flex items-center px-6 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <span
                  aria-hidden="true"
                  className={`mr-3 text-[10px] text-gray-400 transition-transform ${
                    open.has(r.projectId) ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-gray-900 truncate">{r.projectName}</div>
                  <Badge tone="gray">{r.projectCode}</Badge>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Week {r.currentWeek + 1} · {r.projectRole}
                  {r.unfilledWeeks > 0 && (
                    <span className="ml-2 text-amber-600 font-medium">
                      {r.unfilledWeeks} week{r.unfilledWeeks === 1 ? "" : "s"} to fill
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {formatHours(r.currentWeekActual)}
                    <span className="text-gray-400 font-normal"> / {formatHours(r.currentWeekPlanned)}h</span>
                  </div>
                  <div className="w-36 h-1.5 rounded-full bg-gray-100 mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                {r.currentWeekLocked && <Badge tone="gray">Locked</Badge>}
              </div>
              </button>
              {open.has(r.projectId) && (
                <div className="px-6 pb-5 pt-1 border-t border-gray-50 bg-gray-50/40">
                  <div className="flex justify-end my-2">
                    <Link
                      to={`/projects/${r.projectId}`}
                      className="text-xs text-indigo-600 hover:text-indigo-700"
                    >
                      Open project →
                    </Link>
                  </div>
                  <HoursGridPanel projectId={r.projectId} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section: project_health — PM view
// ═══════════════════════════════════════════════════════════════

function ProjectHealthSection({ rows }: { rows: NonNullable<Dashboard["projectHealth"]> }) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionTitle title="Project health" subtitle="Active projects and their burn state" />
        </CardHeader>
        <CardBody>
          <EmptyState
            title="No active projects"
            description="Projects in your scope will appear here once they're created."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <SectionTitle title="Project health" subtitle="Active projects and their burn state" />
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Project</th>
              <th className="text-left px-6 py-3 font-medium">Account</th>
              <th className="text-right px-6 py-3 font-medium">Planned / EAC</th>
              <th className="text-right px-6 py-3 font-medium">Trend</th>
              <th className="text-right px-6 py-3 font-medium">Margin</th>
              <th className="text-right px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const showMargin = r.marginPct != null;
              const marginTone =
                r.marginPct == null
                  ? "gray"
                  : r.marginPct >= 40
                  ? "emerald"
                  : r.marginPct >= 30
                  ? "amber"
                  : "rose";
              const overrunTone = r.overrunPct > 10 ? "rose" : r.overrunPct > 0 ? "amber" : "emerald";
              return (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <Link to={`/projects/${r.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
                      {r.name}
                    </Link>
                    <div className="text-xs text-gray-400">{r.projectCode}</div>
                    {r.hoursDriftPct != null && Math.abs(r.hoursDriftPct) >= 5 && (
                      <Badge tone="amber" className="mt-1">
                        {r.hoursDriftPct > 0 ? "+" : ""}
                        {r.hoursDriftPct.toFixed(0)}% vs plan
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-3 text-gray-600">{r.account.name}</td>
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {formatHours(r.totalPlannedHours)} / {formatHours(r.eacHours)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Badge tone={overrunTone}>{formatPercentSigned(r.overrunPct)}</Badge>
                  </td>
                  <td className="px-6 py-3 text-right">
                    {showMargin ? (
                      <Badge tone={marginTone}>{formatPercent(r.marginPct)}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-medium border rounded-full ${statusColorClasses(
                        r.status
                      )}`}
                    >
                      {r.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section: account_overview — AC view
// ═══════════════════════════════════════════════════════════════

function AccountOverviewSection({ data }: { data: NonNullable<Dashboard["accountOverview"]> }) {
  if (data.accounts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionTitle title="Accounts" subtitle="Your managed accounts" />
        </CardHeader>
        <CardBody>
          <EmptyState
            title="No managed accounts"
            description="An Application Admin can assign you to accounts."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.accounts.map((acct) => {
        const totalFee = acct.projects.reduce((s, p) => s + (p.totalFee ?? 0), 0);
        const totalCost = acct.projects.reduce((s, p) => s + (p.totalCost ?? 0), 0);
        const margin = totalFee > 0 ? ((totalFee - totalCost) / totalFee) * 100 : null;
        return (
          <Card key={acct.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-base font-semibold text-gray-900">{acct.name}</div>
                    <Badge>{acct.code}</Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {acct.projectCount} active project{acct.projectCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <MetricInline label="Fee" value={formatMoney(totalFee)} />
                  <MetricInline label="Cost" value={formatMoney(totalCost)} />
                  <MetricInline
                    label="Margin"
                    value={margin != null ? formatPercent(margin) : "—"}
                    tone={margin == null ? "gray" : margin >= 35 ? "emerald" : "amber"}
                  />
                </div>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-100">
              {acct.projects.map((p) => (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-800">{p.name}</div>
                    <div className="text-xs text-gray-400">{p.projectCode}</div>
                  </div>
                  <div className="flex items-center gap-6 text-right text-sm tabular-nums">
                    <span className="text-gray-600">{formatMoney(p.totalFee)}</span>
                    <span className="text-gray-500">{formatHours(p.totalActualHours)}h</span>
                    {p.marginPct != null && <Badge tone={p.marginPct >= 35 ? "emerald" : "amber"}>
                      {formatPercent(p.marginPct)}
                    </Badge>}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section: bu_health — BUL view
// ═══════════════════════════════════════════════════════════════

function BuHealthSection({ data }: { data: NonNullable<Dashboard["buHealth"]> }) {
  const bu = data.businessUnit;
  return (
    <Card>
      <CardHeader>
        <SectionTitle
          title={bu ? `${bu.name} · BU health` : "BU health"}
          subtitle="Revenue, margin, and capacity for the current year"
        />
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {data.revenueYtd !== undefined && (
            <Metric
              label="Revenue YTD"
              value={formatMoney(data.revenueYtd)}
              hint={
                data.revenueAttainmentPct != null
                  ? `${formatPercent(data.revenueAttainmentPct)} of target`
                  : undefined
              }
            />
          )}
          {data.actualMarginPct !== undefined && (
            <Metric
              label="Actual margin"
              value={formatPercent(data.actualMarginPct)}
              hint={
                data.marginTargetPct != null
                  ? `Target: ${formatPercent(data.marginTargetPct)}`
                  : undefined
              }
              tone={
                data.marginTargetPct != null && data.actualMarginPct >= data.marginTargetPct
                  ? "emerald"
                  : "amber"
              }
            />
          )}
          <Metric
            label="Headcount"
            value={
              data.headcount.target
                ? `${data.headcount.active} / ${data.headcount.target}`
                : `${data.headcount.active}`
            }
            hint={data.headcount.target ? "Active vs. target" : "Active staff"}
          />
          <Metric
            label="At-risk projects"
            value={`${data.atRiskProjectCount}`}
            hint={`of ${data.totalProjects}`}
            tone={data.atRiskProjectCount === 0 ? "emerald" : "amber"}
          />
        </div>

        {data.trajectory && data.trajectory.length > 0 && (
          <BuTrajectory points={data.trajectory} />
        )}
      </CardBody>
    </Card>
  );
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function monthLabel(key: string): string {
  const m = Number(key.split("-")[1]);
  return MONTH_ABBR[m - 1] ?? key;
}

/**
 * Monthly trajectory charts for the BU. Revenue/profit (money) and headcount
 * are different scales, so they get separate charts. Target series render as
 * dashed pace lines. The money chart only appears when the API included
 * financial fields (i.e. the viewer has financial visibility).
 */
function BuTrajectory({ points }: { points: BuHealthTrajectoryPoint[] }) {
  const data = points.map((p) => ({ ...p, label: monthLabel(p.month) }));
  const hasMoney = points[0]?.revenue !== undefined;
  const compactMoney = (v: number) =>
    Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`;

  return (
    <div className="mt-8 space-y-8">
      {hasMoney && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Revenue &amp; profit by month
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={compactMoney} width={48} />
              <Tooltip formatter={(v: number | string) => formatMoney(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#4f46e5" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="profit" name="Profit" stroke="#059669" strokeWidth={2} dot={false} />
              <Line
                type="monotone"
                dataKey="revenueTarget"
                name="Revenue target"
                stroke="#c7cdd4"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
          Headcount by month
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef0f2" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" allowDecimals={false} width={32} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="headcount" name="Contributors" stroke="#4f46e5" strokeWidth={2} dot={{ r: 2 }} />
            <Line
              type="monotone"
              dataKey="headcountTarget"
              name="Target"
              stroke="#c7cdd4"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Section: platform_admin — AA view
// ═══════════════════════════════════════════════════════════════

function PlatformAdminSection({ data }: { data: NonNullable<Dashboard["platformAdmin"]> }) {
  return (
    <Card>
      <CardHeader>
        <SectionTitle title="Platform" subtitle="System-wide health and recent changes" />
      </CardHeader>
      <CardBody>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Metric label="Active users" value={`${data.activeUserCount}`} hint={`of ${data.userCount}`} />
          <Metric label="Business units" value={`${data.buCount}`} />
          <Metric label="Accounts" value={`${data.accountCount}`} />
          <Metric label="Allowed domains" value={`${data.domainCount}`} />
          <Metric label="Recent changes" value={`${data.recentAudit.length}`} hint="Last 10 audit entries" />
        </div>

        {data.recentAudit.length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Recent audit
            </div>
            <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
              {data.recentAudit.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-4 py-2 text-xs">
                  <div>
                    <span className="text-gray-400">{a.entityType}</span>{" "}
                    <span className="text-gray-700 font-mono">{a.field}</span>{" "}
                    {a.oldValue != null && (
                      <>
                        <span className="text-gray-400">{truncate(a.oldValue, 30)}</span>
                        <span className="text-gray-400"> → </span>
                      </>
                    )}
                    <span className="text-gray-700">{truncate(a.newValue ?? "null", 30)}</span>
                  </div>
                  <div className="text-gray-400 flex-shrink-0 ml-4">
                    {a.changedBy?.name ?? "—"} · {formatRelative(a.changedAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Shared sub-components ──

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
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
  tone?: "gray" | "emerald" | "amber" | "rose" | "indigo";
}) {
  const toneClass = {
    gray: "text-gray-900",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    indigo: "text-indigo-700",
  }[tone];
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

function MetricInline({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "emerald" | "amber";
}) {
  const toneClass = {
    gray: "text-gray-900",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
  }[tone];
  return (
    <div className="text-right">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
