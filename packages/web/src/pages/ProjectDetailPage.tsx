import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { ProjectDetail, Me } from "../lib/types";
import { useMe } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import {
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Alert,
  Badge,
  Button,
  ConfirmModal,
  PromptModal,
  PageHeader,
  TabPanel,
  Tabs,
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
import { FinancialsPanel } from "../components/FinancialsPanel";
import { ShareProjectModal } from "../components/ShareProjectModal";
import { ReviewerShareModal } from "../components/ReviewerShareModal";

/**
 * Project detail — four-tab view: overview, hours, burn, financials.
 *
 * Overview is the default: metadata + summary financials + resource table.
 * Hours, burn, and financials are heavier panels loaded lazily via their
 * own queries when their tab activates.
 */

type Tab = "overview" | "hours" | "burn" | "financials";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "hours", label: "Hours grid" },
  { id: "burn", label: "Burn chart" },
  { id: "financials", label: "Financials" },
];

export function ProjectDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [shareOpen, setShareOpen] = useState(false);
  const me = useMe();
  // Sharing is sourced from the BUL/AA-gated BU list, so only those roles
  // get the management control (matches TC 4.10/5.22's BUL framing).
  const canShare = me.roles.includes("BUL") || me.roles.includes("AA");

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
            {canShare && p.status !== "archived" && p.status !== "draft" && (
              <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}>
                Manage sharing
              </Button>
            )}
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

      {canShare && (
        <ShareProjectModal
          projectId={id}
          owningBuId={p.owningBu.id}
          sharedWithBus={p.sharedWithBus}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}

      {data.capabilities.isDraft && <DraftWorkflowPanel data={data} me={me} />}

      {/* ── Summary metrics ── */}
      <SummaryMetrics data={data} />

      {/* ── Tabs ── */}
      <Tabs tabs={TABS} active={tab} onChange={setTab} className="mt-6" />

      <div className="mt-6">
        <TabPanel id="overview" active={tab === "overview"}>
          <OverviewTab data={data} />
        </TabPanel>
        <TabPanel id="hours" active={tab === "hours"}>
          <HoursGridPanel projectId={p.id} />
        </TabPanel>
        <TabPanel id="burn" active={tab === "burn"}>
          <BurnChartPanel projectId={p.id} />
        </TabPanel>
        <TabPanel id="financials" active={tab === "financials"}>
          <FinancialsPanel detail={data} />
        </TabPanel>
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Draft workflow panel (banner + approve / reject / resubmit / share)
// ═══════════════════════════════════════════════════════════════

function DraftWorkflowPanel({ data, me }: { data: ProjectDetail; me: Me }) {
  const qc = useQueryClient();
  const p = data.project;
  const caps = data.capabilities;
  const isOwner = me.id === p.createdBy.id;

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reviewerOpen, setReviewerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project", p.id] });
    qc.invalidateQueries({ queryKey: ["drafts"] });
  };
  const onErr = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "Something went wrong");

  const approveMut = useMutation({
    mutationFn: () => api.post(`/api/projects/${p.id}/approve`),
    onSuccess: () => {
      setApproveOpen(false);
      setError(null);
      invalidate();
    },
    onError: onErr,
  });
  const rejectMut = useMutation({
    mutationFn: (reason?: string) => api.post(`/api/projects/${p.id}/reject`, { reason }),
    onSuccess: () => {
      setRejectOpen(false);
      setError(null);
      invalidate();
    },
    onError: onErr,
  });
  const resubmitMut = useMutation({
    mutationFn: () => api.post(`/api/projects/${p.id}/resubmit`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: onErr,
  });

  return (
    <div className="mb-6 space-y-4">
      {p.rejectionNote && (
        <Alert tone="amber" title="Changes requested">
          {p.rejectionNote}
          {isOwner && " — make your changes, then resubmit for review."}
        </Alert>
      )}

      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-gray-900">Draft project</div>
              <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
                This proposal doesn&apos;t affect cost or revenue yet.{" "}
                {caps.canApproveDraft
                  ? "Approve it to make it active and commit the planned hours."
                  : "An AA or the owning BU's leader approves it to make it active."}
              </p>
              {p.reviewers.length > 0 && (
                <div className="text-xs text-gray-500 mt-2">
                  Reviewers: {p.reviewers.map((r) => r.name).join(", ")}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {caps.canManageReviewers && (
                <Button variant="secondary" size="sm" onClick={() => setReviewerOpen(true)}>
                  Share
                </Button>
              )}
              {isOwner && p.rejectionNote && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => resubmitMut.mutate()}
                  loading={resubmitMut.isPending}
                >
                  Resubmit
                </Button>
              )}
              {caps.canApproveDraft && (
                <>
                  <Button variant="danger" size="sm" onClick={() => setRejectOpen(true)}>
                    Reject
                  </Button>
                  <Button size="sm" onClick={() => setApproveOpen(true)}>
                    Approve
                  </Button>
                </>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-3">
              <Alert tone="rose">{error}</Alert>
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmModal
        open={approveOpen}
        title="Approve this draft?"
        message="This activates the project and commits its planned hours — it will start counting toward cost, revenue, and capacity."
        confirmLabel="Approve"
        onConfirm={() => approveMut.mutate()}
        onCancel={() => setApproveOpen(false)}
        loading={approveMut.isPending}
      />
      <PromptModal
        open={rejectOpen}
        title="Request changes"
        message="Optionally tell the owner what to change. The draft stays a draft so they can revise and resubmit."
        placeholder="e.g. Trim the contingency to 12%"
        submitLabel="Send back"
        onSubmit={(v) => rejectMut.mutate(v.trim() || undefined)}
        onCancel={() => setRejectOpen(false)}
        loading={rejectMut.isPending}
      />
      <ReviewerShareModal
        projectId={p.id}
        reviewers={p.reviewers}
        open={reviewerOpen}
        onClose={() => setReviewerOpen(false)}
      />
    </div>
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
                    {a.businessUnit && a.businessUnit !== project.owningBu.code && (
                      <Badge tone="amber" className="ml-1">
                        cross-BU
                      </Badge>
                    )}
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
