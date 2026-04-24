import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { HoursGrid, HoursEntry } from "../lib/types";
import { Button, Spinner, Alert, Badge } from "./ui";
import { formatHours, formatDate } from "../lib/format";

/**
 * Hours grid.
 *
 * Weekly granularity — one row per assignment, one column per week.
 * Locked weeks render read-only with a padlock ribbon across the column
 * header. Unlocked cells are inline-editable (planned on top, actual below);
 * changes collect into a pending batch and flush on blur/Save button.
 *
 * Server-side permission rules are mirrored here for UX (disabling inputs
 * the caller can't change), but the API remains the source of truth.
 */

interface Props {
  projectId: string;
}

type PendingCell = {
  assignmentId: string;
  projectWeek: number;
  plannedHours?: number | null;
  actualHours?: number | null;
};

// We keep a pending-edits map keyed by "assignmentId|week|field" so multiple
// edits to the same cell accumulate cleanly and flush together.

export function HoursGridPanel({ projectId }: Props) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["project", projectId, "hours"],
    queryFn: () => api.get<HoursGrid>(`/api/projects/${projectId}/hours`),
  });

  const [pending, setPending] = useState<Map<string, PendingCell>>(new Map());
  const [toast, setToast] = useState<{ tone: "emerald" | "rose"; text: string } | null>(null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Array.from(pending.values());
      if (updates.length === 0) return;
      await api.put(`/api/projects/${projectId}/hours`, { updates });
    },
    onSuccess: () => {
      setPending(new Map());
      setToast({ tone: "emerald", text: "Hours saved" });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err) => {
      setToast({
        tone: "rose",
        text: err instanceof ApiError ? err.message : "Failed to save",
      });
    },
  });

  const lockMutation = useMutation({
    mutationFn: (week: number) =>
      api.post(`/api/projects/${projectId}/weeks/${week}/lock`),
    onSuccess: (_data, week) => {
      setToast({ tone: "emerald", text: `Week ${week + 1} locked` });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err) => {
      setToast({
        tone: "rose",
        text: err instanceof ApiError ? err.message : "Lock failed",
      });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: ({ week, reason }: { week: number; reason?: string }) =>
      api.post(`/api/projects/${projectId}/weeks/${week}/unlock`, reason ? { reason } : {}),
    onSuccess: (_data, { week }) => {
      setToast({ tone: "emerald", text: `Week ${week + 1} unlocked` });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err) => {
      setToast({
        tone: "rose",
        text: err instanceof ApiError ? err.message : "Unlock failed",
      });
    },
  });

  const fillMutation = useMutation({
    mutationFn: (week: number) =>
      api.post<{ entriesAffected: number }>(
        `/api/projects/${projectId}/weeks/${week}/fill-remaining`
      ),
    onSuccess: (res, week) => {
      setToast({
        tone: "emerald",
        text:
          res.entriesAffected > 0
            ? `Filled ${res.entriesAffected} cell${res.entriesAffected === 1 ? "" : "s"} for week ${
                week + 1
              }`
            : `Nothing to fill for week ${week + 1}`,
      });
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
    onError: (err) => {
      setToast({
        tone: "rose",
        text: err instanceof ApiError ? err.message : "Fill failed",
      });
    },
  });

  // ── Rendering ──

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="md" color="indigo" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert tone="rose">Couldn&apos;t load hours grid.</Alert>;
  }

  const { weeks, assignments, capabilities } = data;
  const canEdit = capabilities.canEditOwnActuals || capabilities.canManagePlan;

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-gray-500">
          {assignments.length} resource{assignments.length === 1 ? "" : "s"} · {weeks.length} week
          {weeks.length === 1 ? "" : "s"}
          {pending.size > 0 && (
            <span className="ml-3 text-indigo-600 font-medium">
              {pending.size} pending change{pending.size === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {pending.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPending(new Map())}
                disabled={saveMutation.isPending}
              >
                Discard
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={pending.size === 0}
              loading={saveMutation.isPending}
            >
              Save changes
            </Button>
          </div>
        )}
      </div>

      {toast && (
        <div className="mb-3">
          <Alert tone={toast.tone}>{toast.text}</Alert>
        </div>
      )}

      {/* ── Grid ── */}
      <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left font-medium text-gray-500 border-b border-gray-200 min-w-[220px]">
                Resource
              </th>
              {weeks.map((w) => (
                <th
                  key={w.week}
                  className={`px-2 py-2 text-center font-medium border-b border-gray-200 min-w-[72px] ${
                    w.locked ? "bg-gray-50" : "bg-white"
                  }`}
                >
                  <div className="text-[10px] text-gray-400">W{w.week + 1}</div>
                  <div className="text-[10px] text-gray-500">{formatDate(w.weekStartDate)}</div>
                  {w.locked ? (
                    <Badge tone="gray" className="mt-1">
                      🔒 Locked
                    </Badge>
                  ) : (
                    capabilities.canLockWeeks && (
                      <WeekActionsMenu
                        week={w.week}
                        canFill={capabilities.canEditOwnActuals || capabilities.canManagePlan}
                        onLock={() => lockMutation.mutate(w.week)}
                        onFill={() => fillMutation.mutate(w.week)}
                      />
                    )
                  )}
                  {w.locked && capabilities.canLockWeeks && (
                    <UnlockButton
                      onUnlock={(reason) => unlockMutation.mutate({ week: w.week, reason })}
                      loading={unlockMutation.isPending}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const canEditActualsForRow = capabilities.canManagePlan || capabilities.canEditOwnActuals;
              return (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r border-gray-100">
                    <div className="text-sm font-medium text-gray-900">{a.user.name}</div>
                    <div className="text-[10px] text-gray-400">{a.projectRole}</div>
                    {a.billRate != null && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        Bill ${a.billRate}/h
                        {a.costRate != null && ` · Cost $${a.costRate}/h`}
                      </div>
                    )}
                  </td>
                  {weeks.map((w) => {
                    const entry = a.entries.find((e) => e.week === w.week);
                    return (
                      <HoursCell
                        key={w.week}
                        assignmentId={a.id}
                        week={w.week}
                        entry={entry}
                        locked={w.locked}
                        canEditPlanned={capabilities.canManagePlan && !w.locked}
                        canEditActual={canEditActualsForRow && !w.locked}
                        pending={pending}
                        setPending={setPending}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Cell — inline-editable planned + actual for one (assignment, week)
// ═══════════════════════════════════════════════════════════════

function HoursCell({
  assignmentId,
  week,
  entry,
  locked,
  canEditPlanned,
  canEditActual,
  pending,
  setPending,
}: {
  assignmentId: string;
  week: number;
  entry: HoursEntry | undefined;
  locked: boolean;
  canEditPlanned: boolean;
  canEditActual: boolean;
  pending: Map<string, PendingCell>;
  setPending: (m: Map<string, PendingCell>) => void;
}) {
  // Pending overrides win for display so the user sees their in-flight edits.
  const key = `${assignmentId}|${week}`;
  const pendingCell = pending.get(key);

  const plannedValue =
    pendingCell && "plannedHours" in pendingCell ? pendingCell.plannedHours : entry?.plannedHours ?? null;
  const actualValue =
    pendingCell && "actualHours" in pendingCell ? pendingCell.actualHours : entry?.actualHours ?? null;

  const setPendingField = (field: "plannedHours" | "actualHours", value: number | null) => {
    const next = new Map(pending);
    const existing = next.get(key) ?? { assignmentId, projectWeek: week };
    next.set(key, { ...existing, [field]: value });
    setPending(next);
  };

  const bgClass = locked ? "bg-gray-50" : pendingCell ? "bg-indigo-50/40" : "bg-white";

  return (
    <td className={`px-1.5 py-1 text-center border-l border-gray-50 ${bgClass}`}>
      <EditableValue
        value={plannedValue}
        disabled={!canEditPlanned}
        placeholder="—"
        toneClass="text-gray-600"
        onSave={(v) => setPendingField("plannedHours", v)}
      />
      <div className="h-px bg-gray-100 my-0.5" />
      <EditableValue
        value={actualValue}
        disabled={!canEditActual}
        placeholder="—"
        toneClass="text-indigo-700 font-semibold"
        onSave={(v) => setPendingField("actualHours", v)}
      />
    </td>
  );
}

function EditableValue({
  value,
  disabled,
  placeholder,
  toneClass,
  onSave,
}: {
  value: number | null | undefined;
  disabled: boolean;
  placeholder: string;
  toneClass: string;
  onSave: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const display = useMemo(
    () => (value == null || value === 0 ? placeholder : formatHours(value)),
    [value, placeholder]
  );

  if (disabled) {
    return <span className={`text-xs tabular-nums ${toneClass}`}>{display}</span>;
  }

  if (editing) {
    return (
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        autoFocus
        className="w-12 px-1 py-0 text-xs text-center border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300 tabular-nums"
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setEditing(false);
            setDraft("");
          }
        }}
        onBlur={() => {
          setEditing(false);
          const trimmed = draft.trim();
          if (trimmed === "") {
            onSave(null);
          } else {
            const n = Number(trimmed);
            if (Number.isFinite(n) && n >= 0 && n <= 168) onSave(n);
          }
          setDraft("");
        }}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setEditing(true);
        setDraft(value != null ? String(value) : "");
      }}
      className={`w-full text-xs tabular-nums hover:bg-indigo-50 rounded px-1 ${toneClass}`}
    >
      {display}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// Per-week action menus
// ═══════════════════════════════════════════════════════════════

function WeekActionsMenu({
  canFill,
  onLock,
  onFill,
}: {
  week: number;
  canFill: boolean;
  onLock: () => void;
  onFill: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] text-gray-400 hover:text-indigo-600 font-medium mt-1"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[140px]"
          onMouseLeave={() => setOpen(false)}
        >
          {canFill && (
            <button
              onClick={() => {
                setOpen(false);
                onFill();
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
            >
              Fill remaining
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              onLock();
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
          >
            Lock week
          </button>
        </div>
      )}
    </div>
  );
}

function UnlockButton({
  onUnlock,
  loading,
}: {
  onUnlock: (reason?: string) => void;
  loading: boolean;
}) {
  return (
    <button
      onClick={() => {
        const reason = window.prompt("Why are you unlocking this week? (optional)") ?? undefined;
        // null is "cancel" from prompt — don't unlock.
        if (reason === undefined) return;
        onUnlock(reason || undefined);
      }}
      disabled={loading}
      className="block mt-1 text-[10px] text-gray-400 hover:text-indigo-600 font-medium"
    >
      Unlock
    </button>
  );
}
