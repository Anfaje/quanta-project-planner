import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { ProjectListItem, ProjectStatus } from "../lib/types";
import { useMe } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import { Card, Spinner, Alert, EmptyState, Badge, PageHeader, Button } from "../components/ui";
import {
  formatMoney,
  formatHours,
  formatPercent,
  formatDate,
  statusColorClasses,
} from "../lib/format";
import { TARGET_MARGIN_PCT } from "../lib/constants";

/**
 * Projects list.
 *
 * Scoped server-side by buildProjectAccessFilter — the response already
 * contains only projects the caller can see. The status filter is an
 * additional query param; we pass repeated ?status= values.
 */

const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "complete", label: "Complete" },
  { value: "archived", label: "Archived" },
];

export function ProjectsListPage() {
  const me = useMe();
  const navigate = useNavigate();
  const canCreate = me.roles.some((r) => ["PM", "BUL", "AA"].includes(r));

  const [selected, setSelected] = useState<Set<ProjectStatus>>(
    new Set(["active", "on_hold"])
  );

  const params = new URLSearchParams();
  for (const s of selected) params.append("status", s);
  const qs = params.toString();

  const { data, isLoading, error } = useQuery({
    queryKey: ["projects", Array.from(selected).sort().join(",")],
    queryFn: () =>
      api.get<{ projects: ProjectListItem[] }>(`/api/projects${qs ? "?" + qs : ""}`),
  });

  const toggle = (s: ProjectStatus) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <Layout>
      <PageHeader
        title="Projects"
        subtitle="Everything in your scope"
        actions={
          canCreate ? (
            <>
              <Button variant="secondary" onClick={() => navigate("/projects/drafts")}>
                Drafts
              </Button>
              <Button onClick={() => navigate("/projects/new")}>New project</Button>
            </>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-2">
          Status
        </span>
        {STATUSES.map((s) => {
          const active = selected.has(s.value);
          return (
            <button
              key={s.value}
              onClick={() => toggle(s.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                active
                  ? statusColorClasses(s.value)
                  : "bg-white text-gray-400 border-gray-200 hover:text-gray-600"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="md" color="indigo" />
        </div>
      )}

      {error && <Alert tone="rose" title="Couldn't load projects">{String(error)}</Alert>}

      {data && data.projects.length === 0 && (
        <Card>
          <EmptyState
            title="No projects match"
            description="Try adjusting the status filters above."
          />
        </Card>
      )}

      {data && data.projects.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Project</th>
                  <th className="text-left px-6 py-3 font-medium">Account</th>
                  <th className="text-left px-6 py-3 font-medium">BU</th>
                  <th className="text-left px-6 py-3 font-medium">Dates</th>
                  <th className="text-right px-6 py-3 font-medium">Team</th>
                  <th className="text-right px-6 py-3 font-medium">Hours</th>
                  <th className="text-right px-6 py-3 font-medium">Fee</th>
                  <th className="text-right px-6 py-3 font-medium">Margin</th>
                  <th className="text-right px-6 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.projects.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <Link
                        to={`/projects/${p.id}`}
                        className="font-medium text-gray-900 hover:text-indigo-600"
                      >
                        {p.name}
                      </Link>
                      <div className="text-xs text-gray-400">{p.projectCode}</div>
                      {p.hoursDriftPct != null && Math.abs(p.hoursDriftPct) >= 5 && (
                        <Badge tone="amber" className="mt-1">
                          {p.hoursDriftPct > 0 ? "+" : ""}
                          {p.hoursDriftPct.toFixed(0)}% vs plan
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{p.account.name}</td>
                    <td className="px-6 py-3 text-gray-600">
                      <Badge>{p.owningBu.code}</Badge>
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-500">
                      {formatDate(p.startDate)} – {formatDate(p.endDate)}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {p.resourceCount}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {p.totalActualHours != null
                        ? `${formatHours(p.totalActualHours)} / ${formatHours(p.totalPlannedHours)}`
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {p.totalFee != null ? formatMoney(p.totalFee, p.currency) : "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {p.marginPct != null ? (
                        <Badge tone={p.marginPct >= TARGET_MARGIN_PCT ? "emerald" : "amber"}>
                          {formatPercent(p.marginPct)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium border rounded-full ${statusColorClasses(
                          p.status
                        )}`}
                      >
                        {p.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Layout>
  );
}
