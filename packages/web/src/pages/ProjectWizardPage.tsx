import React, { useState, useEffect, useId, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { Currency,
  AdminAccount,
  AdminBusinessUnit,
  AdminUser,
  PricingModel,
  ProjectDetail,
  HoursGrid,
} from "../lib/types";
import { useMe } from "../context/AuthContext";
import { CreatableSelect } from "../components/CreatableSelect";
import { CreateAccountModal, CreateBuModal } from "../components/EntityCreateModals";
import { InviteModal } from "../components/InviteModal";
import { canCreateAccounts, canCreateBusinessUnits, canInviteUsers, userAdminBuIds } from "../lib/capabilities";
import { Layout } from "../components/Layout";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  FormInput,
  FormTextarea,
  PageHeader,
  PromptModal,
  Spinner,
} from "../components/ui";
import { formatDate, formatHours, formatMoney, formatPercent } from "../lib/format";
import { ReviewerShareModal } from "../components/ReviewerShareModal";
import { CURRENCIES, effectiveCost, isCrossBu } from "../lib/constants";

/**
 * Project creation wizard.
 *
 * Five steps — all state lives in a single `WizardState` held at this
 * component so the step indicator can freely jump between previously-
 * completed steps:
 *
 *   1. Basics        — name, code, account, BU, dates, contingency, description
 *   2. Resources     — pick users, set their project role + bill/cost rates
 *   3. Hours         — per-assignment, per-week planned hours grid
 *   4. Financials    — preview of fee/cost/margin with contingency applied
 *   5. Review        — read-only summary + launch button
 *
 * Submits to POST /api/projects with the full payload (assignments +
 * plannedHours flattened). On success, navigates to the project detail page.
 */

// ═══════════════════════════════════════════════════════════════
// Shared wizard state
// ═══════════════════════════════════════════════════════════════

interface ResourceDraft {
  userId: string;
  name: string;     // denormalized for display (not sent to API)
  email: string;    // denormalized
  businessUnit: string; // denormalized (BU code)
  projectRole: string;
  billRate: number;
  costRate: number;     // effective cost (incl. cross-BU markup) — sent to API
  baselineCost: number; // person's standing rate before any markup
  costOverridden: boolean; // PM hand-edited the cost; don't auto-recompute it
}

interface WizardState {
  name: string;
  accountId: string;
  owningBuId: string;
  projectCode: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  contingencyPct: number; // 0..1 (e.g., 0.15)
  pricingModel: PricingModel;
  currency: Currency;
  fixedPrice: number; // contract value, used only when pricingModel is fixed_price
  description: string;
  resources: ResourceDraft[];
  /** Keyed by `${userId}|${projectWeek}` — trivial to serialize on submit. */
  plannedHours: Map<string, number>;
}

const STEPS = [
  { id: 1, label: "Basics" },
  { id: 2, label: "Resources" },
  { id: 3, label: "Hours" },
  { id: 4, label: "Financials" },
  { id: 5, label: "Review" },
];

// Computes weeks inclusive of end week, matching API's countProjectWeeks.
function countWeeks(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const MS = 7 * 24 * 60 * 60 * 1000;
  const s = new Date(startISO + "T00:00:00Z").getTime();
  const e = new Date(endISO + "T00:00:00Z").getTime();
  if (e < s) return 0;
  return Math.floor((e - s) / MS) + 1;
}

function weekStart(startISO: string, week: number): Date {
  const d = new Date(startISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + week * 7);
  return d;
}

// ═══════════════════════════════════════════════════════════════
// Main wizard page
// ═══════════════════════════════════════════════════════════════

export function ProjectWizardPage() {
  const navigate = useNavigate();
  const me = useMe();
  const { id: editId } = useParams<{ id?: string }>();
  const isEdit = Boolean(editId);

  // Reference data fetches for dropdowns.
  const accountsQ = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: () => api.get<{ accounts: AdminAccount[] }>("/api/admin/accounts"),
  });
  const busQ = useQuery({
    queryKey: ["admin", "bus"],
    queryFn: () => api.get<{ businessUnits: AdminBusinessUnit[] }>("/api/admin/bus"),
  });
  const usersQ = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<{ users: AdminUser[] }>("/api/admin/users"),
  });
  // Edit mode: load the draft + its hours grid to hydrate the wizard.
  const draftQ = useQuery({
    queryKey: ["project", editId],
    queryFn: () => api.get<ProjectDetail>(`/api/projects/${editId}`),
    enabled: isEdit,
  });
  const hoursQ = useQuery({
    queryKey: ["project", editId, "hours"],
    queryFn: () => api.get<HoursGrid>(`/api/projects/${editId}/hours`),
    enabled: isEdit,
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [state, setState] = useState<WizardState>({
    name: "",
    accountId: "",
    owningBuId: me.primaryBu?.id ?? "",
    projectCode: "",
    startDate: "",
    endDate: "",
    contingencyPct: 0.15,
    pricingModel: "time_and_materials",
    currency: "USD",
    fixedPrice: 0,
    description: "",
    resources: [],
    plannedHours: new Map(),
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  // After "Save as draft" succeeds we hold the new draft's id to open the
  // share dialog; closing it navigates to the draft.
  const [draftToShare, setDraftToShare] = useState<string | null>(null);
  const [editLoaded, setEditLoaded] = useState(false);

  // In edit mode, hydrate the wizard once from the draft + its hours grid.
  useEffect(() => {
    if (!isEdit || editLoaded || !draftQ.data || !hoursQ.data) return;
    const p = draftQ.data.project;
    const resources: ResourceDraft[] = hoursQ.data.assignments.map((a) => ({
      userId: a.userId,
      name: a.user.name,
      email: a.user.email,
      businessUnit: a.businessUnit,
      projectRole: a.projectRole,
      billRate: a.billRate ?? 175,
      costRate: a.costRate ?? 0,
      baselineCost: a.costRate ?? 0,
      costOverridden: true, // preserve the saved cost; don't auto-recompute markup
    }));
    const planned = new Map<string, number>();
    for (const a of hoursQ.data.assignments) {
      for (const e of a.entries) {
        if (e.plannedHours != null && e.plannedHours > 0) {
          planned.set(`${a.userId}|${e.week}`, e.plannedHours);
        }
      }
    }
    setState({
      name: p.name,
      accountId: p.account.id,
      owningBuId: p.owningBu.id,
      projectCode: p.projectCode,
      startDate: p.startDate.slice(0, 10),
      endDate: p.endDate.slice(0, 10),
      contingencyPct: p.contingencyPct,
      pricingModel: p.pricingModel,
      currency: p.currency,
      fixedPrice: p.fixedPrice ?? 0,
      description: p.description ?? "",
      resources,
      plannedHours: planned,
    });
    setEditLoaded(true);
  }, [isEdit, editLoaded, draftQ.data, hoursQ.data]);

  // Only an AA, or the BUL of the owning BU, may launch a project directly.
  // Everyone else (PMs) saves a draft for approval.
  const canLaunchDirectly =
    me.roles.includes("AA") ||
    (me.roles.includes("BUL") && me.primaryBu?.id === state.owningBuId);

  const totalWeeks = countWeeks(state.startDate, state.endDate);

  const buildPayload = (saveAsDraft: boolean) => {
    const isFixedPrice = state.pricingModel === "fixed_price";
    return {
      name: state.name,
      accountId: state.accountId,
      owningBuId: state.owningBuId,
      projectCode: state.projectCode,
      startDate: state.startDate,
      endDate: state.endDate,
      contingencyPct: state.contingencyPct,
      pricingModel: state.pricingModel,
      currency: state.currency,
      ...(isFixedPrice ? { fixedPrice: state.fixedPrice } : {}),
      description: state.description || undefined,
      assignments: state.resources.map((r) => ({
        userId: r.userId,
        projectRole: r.projectRole,
        billRate: isFixedPrice ? undefined : r.billRate,
        costRate: r.costRate,
      })),
      plannedHours: Array.from(state.plannedHours.entries())
        .map(([key, hours]) => {
          const [userId, weekStr] = key.split("|");
          return { userId, projectWeek: Number(weekStr), plannedHours: hours };
        })
        .filter((e) => e.plannedHours > 0),
      saveAsDraft,
    };
  };

  const createMutation = useMutation({
    mutationFn: async (saveAsDraft: boolean) =>
      api.post<{ projectId: string; projectCode: string; status: string }>(
        "/api/projects",
        buildPayload(saveAsDraft)
      ),
    onSuccess: (res, saveAsDraft) => {
      if (saveAsDraft) {
        // Prompt to share the new draft; navigation happens when the dialog closes.
        setDraftToShare(res.projectId);
      } else {
        navigate(`/projects/${res.projectId}`);
      }
    },
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to create project");
    },
  });

  // Edit mode: replace the draft's whole plan, then return to its detail page.
  const editMutation = useMutation({
    mutationFn: async () =>
      api.put<{ projectId: string; status: string }>(`/api/projects/${editId}`, buildPayload(true)),
    onSuccess: (res) => navigate(`/projects/${res.projectId}`),
    onError: (err) => {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to save changes");
    },
  });

  // Step validation — controls whether Continue is enabled.
  const stepValid = (step: number): boolean => {
    switch (step) {
      case 1:
        return (
          state.name.trim().length > 0 &&
          /^[A-Z0-9-]+$/.test(state.projectCode) &&
          state.accountId !== "" &&
          state.owningBuId !== "" &&
          totalWeeks > 0 &&
          (state.pricingModel !== "fixed_price" || state.fixedPrice > 0)
        );
      case 2:
        return (
          state.resources.length > 0 &&
          state.resources.every(
            (r) =>
              r.projectRole.trim().length > 0 &&
              (state.pricingModel === "fixed_price" || r.billRate >= 0) &&
              r.costRate >= 0
          )
        );
      case 3:
      case 4:
        return true; // both are preview-only
      case 5:
        return stepValid(1) && stepValid(2);
      default:
        return false;
    }
  };

  const isLoading =
    accountsQ.isLoading ||
    busQ.isLoading ||
    usersQ.isLoading ||
    (isEdit && !editLoaded);
  const loadError = accountsQ.error || busQ.error || usersQ.error || draftQ.error || hoursQ.error;

  return (
    <Layout>
      <PageHeader
        title={isEdit ? "Edit draft" : "New project"}
        subtitle={
          isEdit
            ? "Revise the scope, resources, and planned hours. Saving updates the draft."
            : "Define the scope, resources, and planned hours."
        }
        actions={
          <Button variant="secondary" size="sm" onClick={() => navigate("/projects")}>
            Cancel
          </Button>
        }
      />

      <StepIndicator current={currentStep} onStepClick={setCurrentStep} valid={stepValid} />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="md" color="indigo" />
        </div>
      )}

      {loadError && (
        <Alert tone="rose" title="Couldn't load reference data">
          Accounts, business units, or users failed to load.
        </Alert>
      )}

      {!isLoading && !loadError && (
        <>
          {submitError && (
            <div className="mb-4">
              <Alert tone="rose">{submitError}</Alert>
            </div>
          )}

          {currentStep === 1 && (
            <Step1Basics
              state={state}
              setState={setState}
              totalWeeks={totalWeeks}
              accounts={accountsQ.data?.accounts ?? []}
              businessUnits={busQ.data?.businessUnits ?? []}
              lockCode={isEdit}
            />
          )}
          {currentStep === 2 && (
            <Step2Resources
              state={state}
              setState={setState}
              users={usersQ.data?.users ?? []}
              bus={busQ.data?.businessUnits ?? []}
            />
          )}
          {currentStep === 3 && (
            <Step3Hours state={state} setState={setState} totalWeeks={totalWeeks} />
          )}
          {currentStep === 4 && (
            <Step4Financials state={state} totalWeeks={totalWeeks} />
          )}
          {currentStep === 5 && (
            <Step5Review
              state={state}
              totalWeeks={totalWeeks}
              accounts={accountsQ.data?.accounts ?? []}
              businessUnits={busQ.data?.businessUnits ?? []}
            />
          )}

          {/* ── Nav footer ── */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
            <Button
              variant="secondary"
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1}
            >
              Back
            </Button>
            {currentStep < 5 ? (
              <Button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={!stepValid(currentStep)}
              >
                Continue
              </Button>
            ) : isEdit ? (
              <Button
                onClick={() => editMutation.mutate()}
                loading={editMutation.isPending}
                disabled={!stepValid(5) || editMutation.isPending}
              >
                Save changes
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant={canLaunchDirectly ? "secondary" : "primary"}
                  onClick={() => createMutation.mutate(true)}
                  loading={createMutation.isPending && createMutation.variables === true}
                  disabled={!stepValid(5) || createMutation.isPending}
                >
                  Save as draft
                </Button>
                {canLaunchDirectly && (
                  <Button
                    onClick={() => createMutation.mutate(false)}
                    loading={createMutation.isPending && createMutation.variables === false}
                    disabled={!stepValid(5) || createMutation.isPending}
                  >
                    Launch project
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {draftToShare && (
        <ReviewerShareModal
          projectId={draftToShare}
          reviewers={[]}
          open={true}
          onClose={() => {
            const id = draftToShare;
            setDraftToShare(null);
            navigate(`/projects/${id}`);
          }}
          title="Draft saved — share it for review"
          intro="Your draft is saved (it doesn't affect cost or revenue yet). Add the colleagues who should review it — they'll find it under “Shared with me” in Drafts, and you can also manage reviewers later from the draft page. An AA or your BU's leader approves it to make it active."
          doneLabel="Done"
        />
      )}
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step indicator
// ═══════════════════════════════════════════════════════════════

function StepIndicator({
  current,
  onStepClick,
  valid,
}: {
  current: number;
  onStepClick: (step: number) => void;
  valid: (step: number) => boolean;
}) {
  return (
    <ol
      aria-label="Project creation steps"
      className="flex items-center gap-1 mb-8 list-none p-0"
    >
      {STEPS.map((step, i) => {
        const num = step.id;
        const isActive = num === current;
        const isDone = num < current;
        // Can revisit completed steps; can't jump forward.
        const clickable = num < current || (num === current + 1 && valid(current));
        const status = isDone ? "completed" : isActive ? "current" : "upcoming";
        return (
          <li key={step.id} className="flex items-center flex-1">
            <button
              onClick={() => clickable && onStepClick(num)}
              disabled={!clickable}
              aria-current={isActive ? "step" : undefined}
              aria-label={`Step ${num} of ${STEPS.length}: ${step.label} (${status})`}
              className={`flex items-center gap-2 w-full py-2 px-3 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                isActive
                  ? "bg-indigo-50 border border-indigo-200"
                  : isDone
                  ? "bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 cursor-pointer"
                  : "bg-gray-50 border border-gray-100"
              }`}
            >
              <div
                aria-hidden="true"
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : isDone
                    ? "bg-emerald-500 text-white"
                    : "bg-gray-200 text-gray-400"
                }`}
              >
                {isDone ? (
                  <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              <div
                aria-hidden="true"
                className={`text-xs font-semibold truncate ${
                  isActive ? "text-indigo-700" : isDone ? "text-emerald-700" : "text-gray-400"
                }`}
              >
                {step.label}
              </div>
            </button>
            {i < STEPS.length - 1 && (
              <div aria-hidden="true" className={`w-4 h-px flex-shrink-0 mx-1 ${isDone ? "bg-emerald-300" : "bg-gray-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 1 — Basics
// ═══════════════════════════════════════════════════════════════

function Step1Basics({
  state,
  setState,
  totalWeeks,
  accounts,
  businessUnits,
  lockCode = false,
}: {
  state: WizardState;
  setState: (s: WizardState) => void;
  totalWeeks: number;
  accounts: AdminAccount[];
  businessUnits: AdminBusinessUnit[];
  lockCode?: boolean;
}) {
  const me = useMe();
  const activeAccounts = accounts.filter((a) => a.isActive);
  const activeBus = businessUnits.filter((b) => b.isActive);

  // Auto-fill project code from name if user hasn't hand-typed one yet. Skipped
  // when editing — an existing draft's code is fixed.
  useEffect(() => {
    if (lockCode) return;
    if (!state.projectCode && state.name.length >= 3) {
      const auto =
        state.name
          .replace(/[^A-Z0-9]/gi, "")
          .substring(0, 3)
          .toUpperCase() +
        "-" +
        String(Math.floor(Math.random() * 9000) + 1000);
      setState({ ...state, projectCode: auto });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.name]);

  return (
    <Card>
      <CardBody>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <FormInput
            label="Project name *"
            value={state.name}
            onChange={(v) => setState({ ...state, name: v })}
            placeholder="e.g. Brand Refresh 2026"
            autoFocus
          />
          <FormInput
            label="Project code *"
            value={state.projectCode}
            onChange={(v) =>
              setState({ ...state, projectCode: v.toUpperCase().replace(/[^A-Z0-9-]/g, "") })
            }
            placeholder="e.g. BRF-2026"
            disabled={lockCode}
            hint={lockCode ? "Fixed after creation." : "Uppercase letters, digits, and hyphens."}
            error={
              state.projectCode && !/^[A-Z0-9-]+$/.test(state.projectCode)
                ? "Only A-Z, 0-9, and hyphens allowed"
                : undefined
            }
          />

          <Field label="Account *">
            <CreatableSelect
              value={state.accountId}
              onChange={(v) => setState({ ...state, accountId: v })}
              options={activeAccounts.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` }))}
              placeholder="Select an account"
              canCreate={canCreateAccounts(me)}
              createLabel="New account…"
              renderCreateModal={(close) => (
                <CreateAccountModal
                  onClose={close}
                  onCreated={(account) => setState({ ...state, accountId: account.id })}
                />
              )}
            />
          </Field>
          <Field label="Owning business unit *">
            <CreatableSelect
              value={state.owningBuId}
              onChange={(v) => {
                const newOwningBuCode = businessUnits.find((b) => b.id === v)?.code ?? "";
                setState({
                  ...state,
                  owningBuId: v,
                  // Re-apply (or drop) the cross-BU markup for resources the PM
                  // hasn't hand-edited, now that the owning BU has changed.
                  resources: state.resources.map((r) =>
                    r.costOverridden
                      ? r
                      : { ...r, costRate: effectiveCost(r.baselineCost, r.businessUnit, newOwningBuCode) }
                  ),
                });
              }}
              options={activeBus.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))}
              placeholder="Select a BU"
              canCreate={canCreateBusinessUnits(me)}
              createLabel="New business unit…"
              renderCreateModal={(close) => (
                <CreateBuModal
                  onClose={close}
                  onCreated={(bu) => setState({ ...state, owningBuId: bu.id })}
                />
              )}
            />
          </Field>

          <FormInput
            label="Start date *"
            type="date"
            value={state.startDate}
            onChange={(v) => setState({ ...state, startDate: v })}
          />
          <FormInput
            label="End date *"
            type="date"
            value={state.endDate}
            onChange={(v) => setState({ ...state, endDate: v })}
            hint={
              totalWeeks > 0
                ? `${totalWeeks} week${totalWeeks === 1 ? "" : "s"}`
                : "Pick a valid end date"
            }
            error={
              state.startDate && state.endDate && totalWeeks === 0
                ? "End date must be on or after start date"
                : undefined
            }
          />

          <Field label="Pricing model">
            <div className="flex gap-2">
              {(["time_and_materials", "fixed_price"] as const).map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setState({ ...state, pricingModel: pm })}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    state.pricingModel === pm
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {pm === "fixed_price" ? "Fixed price" : "Time & materials"}
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {state.pricingModel === "fixed_price"
                ? "A single contract value; resources have no bill rate."
                : "Revenue is billed per hour at each resource's rate."}
            </div>
          </Field>

          <Field label="Currency">
            <select
              value={state.currency}
              onChange={(e) => setState({ ...state, currency: e.target.value as Currency })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              {CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </select>
            <div className="text-xs text-gray-400 mt-1">
              All rates, fees, and the contract value on this project are in this currency.
            </div>
          </Field>

          {state.pricingModel === "fixed_price" ? (
            <FormInput
              label="Contract value *"
              type="number"
              value={state.fixedPrice ? String(state.fixedPrice) : ""}
              onChange={(v) => setState({ ...state, fixedPrice: Number(v) || 0 })}
              hint="Total fixed price for the engagement"
              error={state.fixedPrice <= 0 ? "Enter a contract value greater than 0" : undefined}
            />
          ) : (
            <Field label="Contingency">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.05}
                  value={state.contingencyPct}
                  onChange={(e) => setState({ ...state, contingencyPct: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-14 text-right text-sm text-gray-700 tabular-nums font-medium">
                  {formatPercent(state.contingencyPct * 100, 0)}
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Applied to fee at completion; typical range 10–20%.
              </div>
            </Field>
          )}
        </div>

        <FormTextarea
          label="Description"
          value={state.description}
          onChange={(v) => setState({ ...state, description: v })}
          placeholder="Optional project scope summary"
          rows={3}
        />
      </CardBody>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 2 — Resources
// ═══════════════════════════════════════════════════════════════

function Step2Resources({
  state,
  setState,
  users,
  bus,
}: {
  state: WizardState;
  setState: (s: WizardState) => void;
  users: AdminUser[];
  bus: AdminBusinessUnit[];
}) {
  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState("");
  const me = useMe();
  const qc = useQueryClient();
  const [invitingUser, setInvitingUser] = useState(false);
  const inviteReach = userAdminBuIds(me);

  // BU code of the project's owning BU — used to flag/markup cross-BU resources.
  const owningBuCode = bus.find((b) => b.id === state.owningBuId)?.code ?? "";

  // users array is sorted by name on the API side already.
  const selectedIds = new Set(state.resources.map((r) => r.userId));
  const visibleUsers = users.filter((u) => {
    // Inactive (deactivated) and invited (pending) users are both assignable to
    // drafts, so don't filter on status here — only BU + search.
    if (buFilter && u.primaryBu) {
      const buId = bus.find((b) => b.code === u.primaryBu!.code)?.id;
      if (buId !== buFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const addResource = (u: AdminUser) => {
    if (selectedIds.has(u.id)) return;
    const buCode = u.primaryBu?.code ?? "";
    const owningBuCode = bus.find((b) => b.id === state.owningBuId)?.code ?? "";
    const baseline = u.costRate ?? 0;
    const newResource: ResourceDraft = {
      userId: u.id,
      name: u.name,
      email: u.email,
      businessUnit: buCode,
      projectRole: u.projectRoles[0] ?? "",
      billRate: 175,
      costRate: effectiveCost(baseline, buCode, owningBuCode),
      baselineCost: baseline,
      costOverridden: false,
    };
    setState({ ...state, resources: [...state.resources, newResource] });
  };

  const updateResource = (userId: string, patch: Partial<ResourceDraft>) => {
    setState({
      ...state,
      resources: state.resources.map((r) => (r.userId === userId ? { ...r, ...patch } : r)),
    });
  };

  const removeResource = (userId: string) => {
    const next = new Map(state.plannedHours);
    for (const key of Array.from(next.keys())) {
      if (key.startsWith(userId + "|")) next.delete(key);
    }
    setState({
      ...state,
      resources: state.resources.filter((r) => r.userId !== userId),
      plannedHours: next,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── User directory ── */}
      {invitingUser && (
        <InviteModal
          businessUnits={bus}
          allowedBuIds={inviteReach === "all" ? null : inviteReach}
          allowAa={me.roles.includes("AA")}
          onClose={() => setInvitingUser(false)}
          onInvited={() => qc.invalidateQueries({ queryKey: ["admin", "users"] })}
        />
      )}
      <Card>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Team directory</h2>
          <p className="text-xs text-gray-500 mt-0.5">Click a person to add them as a resource.</p>
        </div>
        <div className="p-4 flex gap-2 border-b border-gray-100">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
          />
          <SelectField
            value={buFilter}
            onChange={setBuFilter}
            options={bus.map((b) => ({ value: b.id, label: b.code }))}
            placeholder="All BUs"
          />
          {canInviteUsers(me) && (
            <Button variant="secondary" size="sm" onClick={() => setInvitingUser(true)}>
              Invite someone…
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
          {visibleUsers.length === 0 ? (
            <div className="py-10 text-center text-xs text-gray-400">
              No matches
              {canInviteUsers(me) && (
                <div className="mt-2">
                  <Button variant="secondary" size="sm" onClick={() => setInvitingUser(true)}>
                    Invite someone…
                  </Button>
                </div>
              )}
            </div>
          ) : (
            visibleUsers.map((u) => {
              const picked = selectedIds.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => !picked && addResource(u)}
                  disabled={picked}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${
                    picked ? "bg-indigo-50/40 text-gray-400" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate flex items-center gap-1.5">
                      {u.name}
                      {u.status === "pending" && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 px-1 py-0.5 rounded">
                          invited
                        </span>
                      )}
                      {u.status === "deactivated" && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 px-1 py-0.5 rounded">
                          inactive
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {u.email}
                      {u.projectRoles.length > 0 && <> · {u.projectRoles.slice(0, 2).join(", ")}</>}
                    </div>
                  </div>
                  {u.primaryBu && <Badge>{u.primaryBu.code}</Badge>}
                  {picked && (
                    <span className="ml-2 text-[10px] font-semibold text-indigo-500">ADDED</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </Card>

      {/* ── Selected team ── */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Project team <span className="text-gray-400 font-normal">({state.resources.length})</span>
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Set the role and rates for each resource.</p>
        </div>
        {state.resources.length === 0 ? (
          <div className="py-12 text-center text-xs text-gray-400">
            No resources yet. Pick someone from the directory.
          </div>
        ) : (
          <div className="max-h-[32rem] overflow-y-auto divide-y divide-gray-100">
            {state.resources.map((r) => (
              <div key={r.userId} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{r.name}</div>
                    <div className="text-[10px] text-gray-400">{r.email} · {r.businessUnit}</div>
                  </div>
                  <button
                    onClick={() => removeResource(r.userId)}
                    className="text-xs text-rose-500 hover:text-rose-700"
                  >
                    Remove
                  </button>
                </div>
                <div
                  className={`grid gap-2 ${
                    state.pricingModel === "fixed_price" ? "grid-cols-2" : "grid-cols-3"
                  }`}
                >
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-gray-400 block mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      value={r.projectRole}
                      onChange={(e) => updateResource(r.userId, { projectRole: e.target.value })}
                      placeholder="e.g. iOS Dev"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
                    />
                  </div>
                  {state.pricingModel !== "fixed_price" && (
                    <div>
                      <label className="text-[10px] font-semibold uppercase text-gray-400 block mb-1">
                        Bill $/h
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={r.billRate}
                        onChange={(e) =>
                          updateResource(r.userId, { billRate: Number(e.target.value) })
                        }
                        className="w-full px-2 py-1.5 text-xs text-right tabular-nums border border-gray-200 rounded focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
                      />
                    </div>
                  )}
                  <div>
                    <label className="text-[10px] font-semibold uppercase text-gray-400 block mb-1">
                      Cost $/h
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={r.costRate}
                      onChange={(e) =>
                        updateResource(r.userId, {
                          costRate: Number(e.target.value),
                          costOverridden: true,
                        })
                      }
                      className="w-full px-2 py-1.5 text-xs text-right tabular-nums border border-gray-200 rounded focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
                    />
                    {isCrossBu(r.businessUnit, owningBuCode) && (
                      <div className="text-[10px] text-amber-600 mt-1 leading-tight">
                        {r.costOverridden ? "cross-BU resource" : "incl. 18% cross-BU markup"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 3 — Planned hours grid
// ═══════════════════════════════════════════════════════════════

function Step3Hours({
  state,
  setState,
  totalWeeks,
}: {
  state: WizardState;
  setState: (s: WizardState) => void;
  totalWeeks: number;
}) {
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i);
  // Which resource is currently being prompted for a spread-evenly value.
  // Holds the resource's draft (not just the id) so the modal can show
  // their name in the title.
  const [spreadTarget, setSpreadTarget] = useState<ResourceDraft | null>(null);

  const setCell = (userId: string, week: number, value: number) => {
    const key = `${userId}|${week}`;
    const next = new Map(state.plannedHours);
    if (value > 0) next.set(key, value);
    else next.delete(key);
    setState({ ...state, plannedHours: next });
  };

  // Pre-compute per-resource totals once per plannedHours change.
  // Without this, every keystroke (each setCell) reruns rowTotal for every
  // resource, which scales as O(resources × weeks). The Map iteration here
  // is O(non-empty cells) which is much smaller.
  const rowTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const [key, hours] of state.plannedHours) {
      const userId = key.split("|")[0];
      totals.set(userId, (totals.get(userId) ?? 0) + hours);
    }
    return totals;
  }, [state.plannedHours]);

  const rowTotal = (userId: string): number => rowTotals.get(userId) ?? 0;

  const fillWeeklyForResource = (userId: string, hoursPerWeek: number) => {
    const next = new Map(state.plannedHours);
    for (let w = 0; w < totalWeeks; w++) {
      const key = `${userId}|${w}`;
      if (hoursPerWeek > 0) next.set(key, hoursPerWeek);
      else next.delete(key);
    }
    setState({ ...state, plannedHours: next });
  };

  return (
    <Card>
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">Planned hours</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Enter planned hours per resource per week. Use the ⚡ button to spread a value evenly
          across every week for a resource.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left font-medium text-gray-500 border-b border-gray-200 min-w-[200px]">
                Resource
              </th>
              {weeks.map((w) => (
                <th
                  key={w}
                  className="px-2 py-2 text-center font-medium text-gray-500 border-b border-gray-200 min-w-[60px]"
                >
                  <div className="text-[10px] text-gray-400">W{w + 1}</div>
                  <div className="text-[10px] text-gray-500">
                    {state.startDate &&
                      weekStart(state.startDate, w).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                  </div>
                </th>
              ))}
              <th className="px-4 py-2 text-right font-medium text-gray-500 border-b border-gray-200 min-w-[72px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {state.resources.map((r) => (
              <tr key={r.userId} className="border-t border-gray-100">
                <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r border-gray-100">
                  <div className="text-sm font-medium text-gray-900">{r.name}</div>
                  <div className="text-[10px] text-gray-400">{r.projectRole}</div>
                  <button
                    onClick={() => setSpreadTarget(r)}
                    className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium mt-1"
                  >
                    ⚡ Spread evenly
                  </button>
                </td>
                {weeks.map((w) => {
                  const key = `${r.userId}|${w}`;
                  const value = state.plannedHours.get(key) ?? 0;
                  return (
                    <td key={w} className="px-1 py-1 text-center">
                      <input
                        type="number"
                        min={0}
                        max={168}
                        step={1}
                        value={value || ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setCell(r.userId, w, Number.isFinite(n) && n >= 0 ? n : 0);
                        }}
                        className="w-14 px-1 py-1 text-xs text-center tabular-nums border border-gray-200 rounded focus:outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-100"
                        placeholder="—"
                      />
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-right text-sm font-semibold text-gray-900 tabular-nums">
                  {formatHours(rowTotal(r.userId))}h
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PromptModal
        open={spreadTarget !== null}
        title={spreadTarget ? `Hours per week for ${spreadTarget.name}` : ""}
        message="This value will be applied to every week, overwriting any existing planned hours for this resource."
        placeholder="20"
        initialValue="20"
        submitLabel="Apply to all weeks"
        inputType="number"
        inputMode="decimal"
        validator={(v) => {
          if (v === "") return null;
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0 || n > 168) return "Enter a number between 0 and 168";
          return null;
        }}
        onCancel={() => setSpreadTarget(null)}
        onSubmit={(v) => {
          const n = Number(v);
          if (Number.isFinite(n) && n >= 0 && n <= 168 && spreadTarget) {
            fillWeeklyForResource(spreadTarget.userId, n);
          }
          setSpreadTarget(null);
        }}
      />
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 4 — Financial preview
// ═══════════════════════════════════════════════════════════════

function Step4Financials({
  state,
  totalWeeks,
}: {
  state: WizardState;
  totalWeeks: number;
}) {
  // Memoize per-resource summaries and grand totals. They depend only on
  // the wizard's resource roster, contingency, and plannedHours map — so
  // navigating between steps or re-rendering for unrelated reasons no
  // longer re-runs this loop.
  const isFixedPrice = state.pricingModel === "fixed_price";
  const { perResource, totalHours, totalFee, totalCost, contingencyAmt, revenue, margin } =
    useMemo(() => {
      const pr = state.resources.map((r) => {
        let hours = 0;
        for (let w = 0; w < totalWeeks; w++) {
          hours += state.plannedHours.get(`${r.userId}|${w}`) ?? 0;
        }
        return {
          ...r,
          plannedHours: hours,
          plannedFee: hours * r.billRate,
          plannedCost: hours * r.costRate,
        };
      });
      const th = pr.reduce((s, r) => s + r.plannedHours, 0);
      const tf = pr.reduce((s, r) => s + r.plannedFee, 0);
      const tc = pr.reduce((s, r) => s + r.plannedCost, 0);
      const rev = isFixedPrice ? state.fixedPrice : tf;
      return {
        perResource: pr,
        totalHours: th,
        totalFee: tf,
        totalCost: tc,
        contingencyAmt: isFixedPrice ? 0 : tf * state.contingencyPct,
        revenue: rev,
        margin: rev > 0 ? ((rev - tc) / rev) * 100 : 0,
      };
    }, [
      state.resources,
      state.plannedHours,
      state.contingencyPct,
      state.pricingModel,
      state.fixedPrice,
      isFixedPrice,
      totalWeeks,
    ]);

  return (
    <Card>
      <CardBody>
        <h2 className="text-base font-semibold text-gray-900 mb-1">Financial preview</h2>
        <p className="text-xs text-gray-500 mb-6">
          Based on your planned hours and rates. These numbers are computed live — the final
          project will use the same figures server-side.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <MetricBig
            label="Total hours"
            value={formatHours(totalHours)}
            hint={`${state.resources.length} resource${state.resources.length === 1 ? "" : "s"}`}
          />
          <MetricBig
            label={isFixedPrice ? "Contract value" : "Quoted fee"}
            value={formatMoney(isFixedPrice ? revenue : totalFee, state.currency)}
            hint={isFixedPrice ? "fixed price" : `+ ${formatMoney(contingencyAmt, state.currency)} contingency`}
          />
          <MetricBig label="Cost" value={formatMoney(totalCost, state.currency)} />
          <MetricBig
            label="Margin"
            value={formatPercent(margin)}
            tone={margin >= 35 ? "emerald" : margin >= 25 ? "amber" : "rose"}
            hint={
              margin >= 35
                ? "Healthy"
                : margin >= 25
                ? "Acceptable"
                : "Below threshold"
            }
          />
        </div>

        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Resource</th>
                <th className="text-left px-4 py-2 font-medium">Role</th>
                <th className="text-right px-4 py-2 font-medium">Rate</th>
                <th className="text-right px-4 py-2 font-medium">Hours</th>
                {!isFixedPrice && <th className="text-right px-4 py-2 font-medium">Fee</th>}
                <th className="text-right px-4 py-2 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {perResource.map((r) => (
                <tr key={r.userId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{r.name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.projectRole}</td>
                  <td className="px-4 py-2 text-right text-gray-600 tabular-nums">
                    {isFixedPrice ? `$${r.costRate}/h` : `$${r.billRate} / $${r.costRate}`}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                    {formatHours(r.plannedHours)}h
                  </td>
                  {!isFixedPrice && (
                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                      {formatMoney(r.plannedFee, state.currency)}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right text-gray-500 tabular-nums">
                    {formatMoney(r.plannedCost, state.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 text-xs font-semibold">
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-gray-500 uppercase tracking-wider">
                  Total
                </td>
                <td className="px-4 py-2 text-right text-gray-900 tabular-nums">
                  {formatHours(totalHours)}h
                </td>
                <td className="px-4 py-2 text-right text-gray-900 tabular-nums">
                  {formatMoney(totalFee, state.currency)}
                </td>
                <td className="px-4 py-2 text-right text-gray-900 tabular-nums">
                  {formatMoney(totalCost, state.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {totalHours === 0 && (
          <div className="mt-4">
            <Alert tone="amber">
              No planned hours entered — projects can still be created but the burn chart and
              financial rollups will be empty until someone fills in hours.
            </Alert>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step 5 — Review
// ═══════════════════════════════════════════════════════════════

function Step5Review({
  state,
  totalWeeks,
  accounts,
  businessUnits,
}: {
  state: WizardState;
  totalWeeks: number;
  accounts: AdminAccount[];
  businessUnits: AdminBusinessUnit[];
}) {
  const account = accounts.find((a) => a.id === state.accountId);
  const bu = businessUnits.find((b) => b.id === state.owningBuId);

  return (
    <div className="space-y-4">
      <Card>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Review</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Double-check everything before launching the project.
          </p>
        </div>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <ReviewField label="Project" value={state.name} />
            <ReviewField label="Project code" value={state.projectCode} />
            <ReviewField label="Account" value={account ? `${account.name} (${account.code})` : "—"} />
            <ReviewField label="Owning BU" value={bu ? `${bu.code} · ${bu.name}` : "—"} />
            <ReviewField
              label="Duration"
              value={
                state.startDate && state.endDate
                  ? `${formatDate(state.startDate)} – ${formatDate(state.endDate)} · ${totalWeeks} weeks`
                  : "—"
              }
            />
            {state.pricingModel === "fixed_price" ? (
              <ReviewField label="Pricing" value={`Fixed price · ${formatMoney(state.fixedPrice, state.currency)}`} />
            ) : (
              <ReviewField label="Contingency" value={formatPercent(state.contingencyPct * 100, 0)} />
            )}
          </div>
          {state.description && (
            <div className="mt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                Description
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-line">{state.description}</p>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Team</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {state.resources.length} resource{state.resources.length === 1 ? "" : "s"} assigned
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {state.resources.map((r) => {
            let hours = 0;
            for (let w = 0; w < totalWeeks; w++) hours += state.plannedHours.get(`${r.userId}|${w}`) ?? 0;
            return (
              <div key={r.userId} className="flex items-center justify-between px-6 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">{r.name}</div>
                  <div className="text-[10px] text-gray-400">
                    {`${r.projectRole}${
                      state.pricingModel !== "fixed_price" ? ` · Bill $${r.billRate}/h` : ""
                    } · Cost $${r.costRate}/h`}
                  </div>
                </div>
                <div className="text-sm text-gray-600 tabular-nums">{formatHours(hours)}h</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Shared sub-components
// ═══════════════════════════════════════════════════════════════

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  // Generate a stable id and inject it into the child IF the child is a
  // single React element (the common case — a SelectField or input). For
  // children that are wrapper divs (e.g. the contingency slider), we fall
  // back to leaving the label unassociated. Both branches are still better
  // than nothing for screen readers because the label visually labels what's
  // beneath it.
  const id = useId();
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id })
    : children;
  const hasSingleElementChild = React.isValidElement(children);
  return (
    <div className="mb-4">
      <label
        htmlFor={hasSingleElementChild ? id : undefined}
        className="block text-sm font-medium text-gray-700 mb-1.5"
      >
        {label}
      </label>
      {child}
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 bg-white"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MetricBig({
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

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-sm text-gray-800 mt-0.5">{value}</div>
    </div>
  );
}
