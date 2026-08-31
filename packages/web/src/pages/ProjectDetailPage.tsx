import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type {
  AdminBusinessUnit, AssignmentRow, AdminUser, ProjectDetail, Me } from "../lib/types";
import { useMe } from "../context/AuthContext";
import { CreatableSelect } from "../components/CreatableSelect";
import { InviteModal } from "../components/InviteModal";
import { canInviteUsers, userAdminBuIds } from "../lib/capabilities";
import { convert, round2 } from "../lib/currency";
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
  FormInput,
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
import { TARGET_MARGIN_PCT } from "../lib/constants";
import { HoursGridPanel } from "../components/HoursGridPanel";
import { BurnChartPanel } from "../components/BurnChartPanel";
import { DriftPanel } from "../components/DriftPanel";
import { BillingPanel } from "../components/BillingPanel";
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

type Tab = "overview" | "hours" | "burn" | "billing" | "financials" | "drift";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "hours", label: "Hours grid" },
  { id: "burn", label: "Burn chart" },
  { id: "billing", label: "Billing" },
  { id: "financials", label: "Financials" },
  { id: "drift", label: "Baseline drift" },
];

export function ProjectDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("overview");
  const [shareOpen, setShareOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
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
  // Hide the Financials tab entirely for users without financial access (the
  // API omits fee figures for them) rather than showing an empty-state prompt.
  const hasFinancials = data.financials.totalFee !== undefined;
  const visibleTabs = TABS.filter(
    (t) =>
      (t.id !== "financials" || hasFinancials) &&
      // Billing (the offer schedule) requires bill-rate visibility.
      (t.id !== "billing" || data.capabilities.canViewBilling) &&
      // Drift only makes sense once an Initial Plan baseline exists.
      (t.id !== "drift" || p.baseline != null)
  );
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
            {data.capabilities.canManage && (p.status === "active" || p.status === "on_hold") && (
              <Button variant="secondary" size="sm" onClick={() => setEditProjectOpen(true)}>
                Edit project
              </Button>
            )}
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

      {editProjectOpen && (
        <EditProjectModal project={p} onClose={() => setEditProjectOpen(false)} />
      )}

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
        {p.baseline && (
          <div className="text-xs text-gray-500">
            Initial plan · {formatDate(p.baseline.capturedAt)}
          </div>
        )}
        {p.pricingModel === "fixed_price" && <Badge tone="sky">Fixed price</Badge>}
        {p.status === "complete" && (
          <Badge tone="amber">Plan locked for evaluation</Badge>
        )}
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
      <Tabs tabs={visibleTabs} active={tab} onChange={setTab} className="mt-6" />

      <div className="mt-6">
        <TabPanel id="overview" active={tab === "overview"}>
          <OverviewTab data={data} />
        </TabPanel>
        <TabPanel id="hours" active={tab === "hours"}>
          <HoursGridPanel
            projectId={p.id}
            readOnly={!me.roles.some((r) => ["PM", "BUL", "AC", "AA"].includes(r))}
          />
        </TabPanel>
        <TabPanel id="burn" active={tab === "burn"}>
          <BurnChartPanel projectId={p.id} />
        </TabPanel>
        {data.capabilities.canViewBilling && (
          <TabPanel id="billing" active={tab === "billing"}>
            <BillingPanel projectId={p.id} />
          </TabPanel>
        )}
        {p.baseline && (
          <TabPanel id="drift" active={tab === "drift"}>
            <DriftPanel projectId={p.id} />
          </TabPanel>
        )}
        {hasFinancials && (
          <TabPanel id="financials" active={tab === "financials"}>
            <FinancialsPanel detail={data} />
          </TabPanel>
        )}
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Draft workflow panel (banner + approve / reject / resubmit / share)
// ═══════════════════════════════════════════════════════════════

function DraftWorkflowPanel({ data, me }: { data: ProjectDetail; me: Me }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = data.project;
  const caps = data.capabilities;
  const fin = data.approvalFinancials;
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
              {(isOwner || caps.canManage) && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/projects/${p.id}/edit`)}
                >
                  Edit
                </Button>
              )}
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

          {caps.canApproveDraft && fin && (
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-gray-500">Planned fee</span>{" "}
                  <span className="font-medium text-gray-800">{formatMoney(fin.adjustedFee, data.project.currency)}</span>
                  {(fin.contingencyAmt ?? 0) > 0 && (
                    <span className="text-xs text-gray-400">
                      {" "}
                      (incl. {formatPercent(fin.contingencyPct * 100, 0)} contingency)
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-gray-500">Planned cost</span>{" "}
                  <span className="font-medium text-gray-800">{formatMoney(fin.plannedCost, data.project.currency)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-500">Planned margin</span>
                  <Badge tone={fin.belowTarget ? "amber" : "emerald"}>
                    {formatPercent(fin.marginPct)}
                  </Badge>
                </div>
              </div>
              {fin.belowTarget && (
                <p className="mt-2 text-xs text-amber-700">
                  Below the {fin.targetMarginPct ?? TARGET_MARGIN_PCT}% target margin — approval will ask you to
                  confirm.
                </p>
              )}
            </div>
          )}

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
        tone={fin?.belowTarget ? "danger" : "primary"}
        message={
          fin?.belowTarget ? (
            <>
              Planned margin is <strong>{formatPercent(fin.marginPct)}</strong> — below the{" "}
              {fin?.targetMarginPct ?? TARGET_MARGIN_PCT}% target. Approving activates the project and commits its
              planned hours at this margin.
            </>
          ) : (
            "This activates the project and commits its planned hours — it will start counting toward cost, revenue, and capacity."
          )
        }
        confirmLabel={fin?.belowTarget ? "Approve anyway" : "Approve"}
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
                value={formatMoney(f.totalFee, data.project.currency)}
                hint={f.adjustedFee !== undefined ? `+ contingency ${formatMoney(f.adjustedFee, data.project.currency)}` : undefined}
              />
              {f.totalCost !== undefined && (
                <Metric
                  label="Cost"
                  value={formatMoney(f.totalCost, data.project.currency)}
                  hint={
                    f.totalActualCost !== undefined
                      ? `Actual ${formatMoney(f.totalActualCost, data.project.currency)}`
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
  const qc = useQueryClient();
  const caps = data.capabilities;
  const canEditTeam =
    caps.canManage && data.project.status !== "complete" && data.project.status !== "archived";
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<AssignmentRow | null>(null);
  const [removing, setRemoving] = useState<AssignmentRow | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const removeMut = useMutation({
    mutationFn: (assignmentId: string) =>
      api.delete(`/api/projects/${data.project.id}/assignments/${assignmentId}`),
    onSuccess: () => {
      setRemoving(null);
      setTeamError(null);
      qc.invalidateQueries({ queryKey: ["project", data.project.id] });
    },
    onError: (e: unknown) => {
      setRemoving(null);
      setTeamError(e instanceof Error ? e.message : "Couldn't remove this person.");
    },
  });
  const { assignments, project } = data;
  const isFixedPrice = project.pricingModel === "fixed_price";

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
            {canEditTeam && (
              <Button size="sm" onClick={() => setAddPersonOpen(true)}>
                Add person
              </Button>
            )}
          </div>
        </CardHeader>
        {teamError && (
          <div className="px-6 pt-4">
            <Alert tone="rose">{teamError}</Alert>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Name</th>
                <th className="text-left px-6 py-3 font-medium">Role</th>
                <th className="text-left px-6 py-3 font-medium">BU</th>
                {!isFixedPrice && assignments.some((a) => a.billRate !== undefined) && (
                  <th className="text-right px-6 py-3 font-medium">Bill /h</th>
                )}
                {assignments.some((a) => a.costRate !== undefined) && (
                  <th className="text-right px-6 py-3 font-medium">Cost /h</th>
                )}
                <th className="text-right px-6 py-3 font-medium">Planned</th>
                <th className="text-right px-6 py-3 font-medium">Actual</th>
                {!isFixedPrice && assignments.some((a) => a.plannedFee !== undefined) && (
                  <th className="text-right px-6 py-3 font-medium">Fee</th>
                )}
                {canEditTeam && <th className="px-6 py-3" />}
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
                  {!isFixedPrice && assignments.some((x) => x.billRate !== undefined) && (
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {a.billRate != null ? formatMoney(a.billRate, data.project.currency) : "—"}
                    </td>
                  )}
                  {assignments.some((x) => x.costRate !== undefined) && (
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {a.costRate != null ? formatMoney(a.costRate, data.project.currency) : "—"}
                    </td>
                  )}
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {formatHours(a.plannedHours)}h
                  </td>
                  <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                    {formatHours(a.actualHours)}h
                  </td>
                  {!isFixedPrice && assignments.some((x) => x.plannedFee !== undefined) && (
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {a.plannedFee != null ? formatMoney(a.plannedFee, data.project.currency) : "—"}
                    </td>
                  )}
                  {canEditTeam && (
                    <td className="px-6 py-3 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setEditingAssignment(a)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRemoving(a)}>
                        Remove
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {(addPersonOpen || editingAssignment) && (
        <TeamMemberModal
          project={data.project}
          existing={editingAssignment}
          onClose={() => {
            setAddPersonOpen(false);
            setEditingAssignment(null);
          }}
        />
      )}
      <ConfirmModal
        open={removing != null}
        title="Remove from the team?"
        tone="danger"
        message={
          removing ? (
            <>
              Remove <strong>{removing.user.name}</strong> and their remaining planned hours from
              this project? People with logged hours can&rsquo;t be removed — their history stays.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Remove"
        onConfirm={() => removing && removeMut.mutate(removing.id)}
        onCancel={() => setRemoving(null)}
        loading={removeMut.isPending}
      />
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

// ═══════════════════════════════════════════════════════════════
// Edit an in-flight project (name / description / end date / money knobs).
// The Initial Plan baseline is never touched — changes show up as drift.
// ═══════════════════════════════════════════════════════════════

function EditProjectModal({
  project,
  onClose,
}: {
  project: ProjectDetail["project"];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isFixed = project.pricingModel === "fixed_price";
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [endDate, setEndDate] = useState(project.endDate.slice(0, 10));
  const [contingency, setContingency] = useState(String(Math.round(project.contingencyPct * 100)));
  const [fixedPrice, setFixedPrice] = useState(
    project.fixedPrice != null ? String(project.fixedPrice) : ""
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (name !== project.name) body.name = name;
      if (description !== (project.description ?? "")) body.description = description || null;
      if (endDate !== project.endDate.slice(0, 10)) body.endDate = endDate;
      if (!isFixed) {
        const pct = Number(contingency) / 100;
        if (!Number.isNaN(pct) && Math.abs(pct - project.contingencyPct) > 1e-9) {
          body.contingencyPct = pct;
        }
      } else {
        const fp = Number(fixedPrice);
        if (!Number.isNaN(fp) && fp !== (project.fixedPrice ?? 0)) body.fixedPrice = fp;
      }
      if (Object.keys(body).length === 0) return Promise.resolve(null);
      return api.patch(`/api/projects/${project.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save changes."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Edit project</h2>
        <p className="text-xs text-gray-500 mb-5">
          Changes apply to the live plan and roll into every metric immediately. The Initial Plan
          baseline stays fixed — differences appear on the Baseline drift tab.
        </p>

        {error && (
          <div className="mb-4">
            <Alert tone="rose">{error}</Alert>
          </div>
        )}

        <div className="space-y-4">
          <FormInput label="Project name" value={name} onChange={setName} />
          <FormInput
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="Optional"
          />
          <FormInput
            label="End date"
            type="date"
            value={endDate}
            onChange={setEndDate}
            hint="Extending adds empty plan weeks for everyone; shortening requires the dropped weeks to be empty and unlocked. The start date is locked once active."
          />
          {isFixed ? (
            <FormInput
              label={`Contract value (${project.currency})`}
              type="number"
              value={fixedPrice}
              onChange={setFixedPrice}
            />
          ) : (
            <FormInput
              label="Contingency (%)"
              type="number"
              value={contingency}
              onChange={setContingency}
              hint="Applied on top of the planned fee in offers and financials."
            />
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Add a person to the team, or edit an existing assignment's role/rates.
// ═══════════════════════════════════════════════════════════════

function TeamMemberModal({
  project,
  existing,
  onClose,
}: {
  project: ProjectDetail["project"];
  existing: AssignmentRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isFixed = project.pricingModel === "fixed_price";
  const [userId, setUserId] = useState(existing?.userId ?? "");
  const [projectRole, setProjectRole] = useState(existing?.projectRole ?? "");
  const [billRate, setBillRate] = useState(
    existing?.billRate != null ? String(existing.billRate) : ""
  );
  const [costRate, setCostRate] = useState(
    existing?.costRate != null ? String(existing.costRate) : ""
  );
  const [error, setError] = useState<string | null>(null);

  const meForInvite = useMe();
  const inviteReach = userAdminBuIds(meForInvite);
  const invitesBusQ = useQuery({
    queryKey: ["admin", "bus"],
    queryFn: () => api.get<{ businessUnits: AdminBusinessUnit[] }>("/api/admin/bus"),
    enabled: canInviteUsers(meForInvite),
  });
  const usersQ = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<{ users: AdminUser[] }>("/api/admin/users"),
    enabled: existing == null,
  });
  const candidates = (usersQ.data?.users ?? []).filter((u) => u.status !== "deactivated");

  const mutation = useMutation({
    mutationFn: () => {
      if (existing) {
        const body: Record<string, unknown> = { projectRole };
        if (!isFixed && billRate !== "") body.billRate = Number(billRate);
        if (costRate !== "") body.costRate = Number(costRate);
        return api.patch(`/api/projects/${project.id}/assignments/${existing.id}`, body);
      }
      const body: Record<string, unknown> = {
        userId,
        projectRole,
        costRate: Number(costRate || 0),
      };
      if (!isFixed) body.billRate = Number(billRate || 0);
      return api.post(`/api/projects/${project.id}/assignments`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", project.id] });
      onClose();
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save."),
  });

  const selected = candidates.find((u) => u.id === userId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {existing ? `Edit ${existing.user.name}` : "Add person"}
        </h2>
        <p className="text-xs text-gray-500 mb-5">
          {existing
            ? "Rate changes reprice this project's history and future — margins recompute from the current rates."
            : "New people get empty plan weeks across the timeline; set their hours in the Hours grid afterwards."}
        </p>

        {error && (
          <div className="mb-4">
            <Alert tone="rose">{error}</Alert>
          </div>
        )}

        <div className="space-y-4">
          {!existing && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">Person</div>
              <CreatableSelect
                value={userId}
                onChange={(v) => {
                  setUserId(v);
                  const u = candidates.find((x) => x.id === v);
                  if (u && !projectRole && u.projectRoles.length > 0) {
                    setProjectRole(u.projectRoles[0]);
                  }
                  // Prefill the standing cost, converted into this project's
                  // currency (editable before saving).
                  if (u?.costRate != null && costRate.trim() === "") {
                    setCostRate(
                      String(
                        round2(
                          convert(u.costRate, u.costRateCurrency ?? "USD", project.currency)
                        )
                      )
                    );
                  }
                }}
                options={candidates.map((u) => ({
                  value: u.id,
                  label: `${u.name} (${u.primaryBu?.code ?? "—"}${u.status === "pending" ? " · invited" : ""})`,
                }))}
                placeholder="Select a person…"
                canCreate={canInviteUsers(meForInvite)}
                createLabel="Invite new user…"
                renderCreateModal={(close) => (
                  <InviteModal
                    businessUnits={invitesBusQ.data?.businessUnits ?? []}
                    allowedBuIds={inviteReach === "all" ? null : inviteReach}
                    allowAa={meForInvite.roles.includes("AA")}
                    onClose={close}
                    onInvited={(res) => {
                      qc.invalidateQueries({ queryKey: ["admin", "users"] });
                      setUserId(res.userId);
                    }}
                  />
                )}
              />
              {selected?.status === "pending" && (
                <p className="mt-1 text-xs text-amber-600">
                  Invited but not yet active — they can be planned now and will see the project
                  once they accept.
                </p>
              )}
            </div>
          )}
          <FormInput
            label="Project role"
            value={projectRole}
            onChange={setProjectRole}
            placeholder="e.g. Backend Dev"
          />
          {!isFixed && (
            <FormInput
              label={`Bill rate (${project.currency}/h)`}
              type="number"
              value={billRate}
              onChange={setBillRate}
            />
          )}
          <FormInput
            label={`Cost rate (${project.currency}/h)`}
            type="number"
            value={costRate}
            onChange={setCostRate}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={(!existing && !userId) || !projectRole}
          >
            {existing ? "Save changes" : "Add to team"}
          </Button>
        </div>
      </div>
    </div>
  );
}
