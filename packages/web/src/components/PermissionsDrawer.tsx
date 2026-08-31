import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type {
  AdminAccount,
  AdminBusinessUnit,
  AdminUser,
  GrantPermission,
  GrantScopeType,
  ProjectListItem,
  UserPermissions,
} from "../lib/types";
import { Alert, Button, Spinner } from "./ui";

/**
 * Full-height drawer for a user's permission grid.
 *
 * Columns are the five permissions; rows are the scope tree
 * (Everything → business units → accounts → unfoldable project rows).
 * Every cell renders *effective vs explicit* state: a solid toggle is an
 * explicit grant you can flip; a dimmed check is inherited — from a role
 * preset or from a broader tick — with a hint saying why, and isn't
 * clickable (so the stored grants stay minimal). Parent-row ticks store one
 * inheritance grant, not N rows: new projects created tomorrow are covered
 * automatically.
 *
 * Editing ceiling (mirrors the server, which enforces it regardless):
 * AA edits everything; a BUL editor only their BU rows and those BUs'
 * project rows. Account and platform rows stay read-only for them, and
 * manage_users only exists at business-unit scope.
 */

const PERMS: { key: GrantPermission; label: string }[] = [
  { key: "view_financials", label: "View financials" },
  { key: "view_bill_rates", label: "View bill rates" },
  { key: "manage_projects", label: "Manage projects" },
  { key: "approve_drafts", label: "Approve drafts" },
  { key: "manage_users", label: "Manage users" },
];

interface GridRow {
  scopeType: GrantScopeType;
  scopeId: string | null;
  label: string;
  sublabel?: string;
  indent?: boolean;
  owningBuId?: string;
  accountId?: string;
}

function keyOf(perm: GrantPermission, scopeType: GrantScopeType, scopeId: string | null) {
  return `${perm}|${scopeType}|${scopeId ?? ""}`;
}

function parseKey(key: string): { permission: GrantPermission; scopeType: GrantScopeType; scopeId: string | null } {
  const [permission, scopeType, scopeId] = key.split("|");
  return {
    permission: permission as GrantPermission,
    scopeType: scopeType as GrantScopeType,
    scopeId: scopeId === "" ? null : scopeId,
  };
}

export function PermissionsDrawer({
  user,
  businessUnits,
  accounts,
  meIsAa,
  reachBuIds,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  businessUnits: AdminBusinessUnit[];
  accounts: AdminAccount[];
  meIsAa: boolean;
  reachBuIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Set<string> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const permsQ = useQuery({
    queryKey: ["admin", "user-perms", user.id],
    queryFn: () => api.get<UserPermissions>(`/api/admin/users/${user.id}/permissions`),
  });
  const projectsQ = useQuery({
    queryKey: ["projects", "grant-rows"],
    queryFn: () => api.get<{ projects: ProjectListItem[] }>("/api/projects"),
  });

  const serverSel = useMemo(() => {
    const set = new Set<string>();
    for (const g of permsQ.data?.grants ?? []) {
      set.add(keyOf(g.permission, g.scopeType, g.scopeId));
    }
    return set;
  }, [permsQ.data]);

  const sel = edited ?? serverSel;
  const dirty =
    edited != null &&
    (edited.size !== serverSel.size || [...edited].some((k) => !serverSel.has(k)));

  const projectsByAccount = useMemo(() => {
    const map = new Map<string, ProjectListItem[]>();
    for (const p of projectsQ.data?.projects ?? []) {
      const list = map.get(p.account.id) ?? [];
      list.push(p);
      map.set(p.account.id, list);
    }
    return map;
  }, [projectsQ.data]);

  const projectBuById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projectsQ.data?.projects ?? []) map.set(p.id, p.owningBu.id);
    return map;
  }, [projectsQ.data]);

  const target = permsQ.data;

  /** Why a non-explicit check appears in this cell, or null if none. */
  function inheritReason(perm: GrantPermission, row: GridRow): string | null {
    // Broader explicit ticks first.
    if (row.scopeType !== "platform" && sel.has(keyOf(perm, "platform", null))) {
      return "via Everything";
    }
    if (row.scopeType === "project") {
      if (row.owningBuId && sel.has(keyOf(perm, "business_unit", row.owningBuId))) {
        return "via its business unit";
      }
      if (row.accountId && sel.has(keyOf(perm, "account", row.accountId))) {
        return "via its account";
      }
    }
    // Role presets.
    if (!target) return null;
    const roles = target.roles as string[];
    if (row.scopeType === "platform" && roles.includes("AA")) {
      if (target.financialAccess && (perm === "view_financials" || perm === "view_bill_rates")) {
        return "via AA + financial access";
      }
      if (perm === "approve_drafts") return "via AA role";
    }
    if (
      row.scopeType === "business_unit" &&
      roles.includes("BUL") &&
      row.scopeId === target.primaryBuId
    ) {
      return "via BUL role";
    }
    if (
      row.scopeType === "account" &&
      roles.includes("AC") &&
      row.scopeId != null &&
      target.managedAccountIds.includes(row.scopeId) &&
      perm !== "approve_drafts" &&
      perm !== "manage_users"
    ) {
      return "via AC role";
    }
    if (row.scopeType === "project") {
      if (roles.includes("BUL") && row.owningBuId === target.primaryBuId) return "via BUL role";
      if (
        roles.includes("AC") &&
        row.accountId != null &&
        target.managedAccountIds.includes(row.accountId) &&
        perm !== "approve_drafts" &&
        perm !== "manage_users"
      ) {
        return "via AC role";
      }
    }
    return null;
  }

  /** Cells that don't exist in the model at all. */
  function cellDisabled(perm: GrantPermission, row: GridRow): string | null {
    if (perm !== "manage_users") return null;
    if (row.scopeType === "platform") {
      return "Platform-wide user admin is the AA role itself, never a grant";
    }
    if (row.scopeType !== "business_unit") {
      return "User admin exists only at business-unit scope";
    }
    return null;
  }

  function cellEditable(perm: GrantPermission, row: GridRow): boolean {
    if (cellDisabled(perm, row)) return false;
    if (meIsAa) return true;
    if (row.scopeType === "business_unit") {
      return row.scopeId != null && reachBuIds.includes(row.scopeId);
    }
    if (row.scopeType === "project") {
      return row.owningBuId != null && reachBuIds.includes(row.owningBuId);
    }
    return false; // platform + account rows are AA-only
  }

  function toggle(perm: GrantPermission, row: GridRow) {
    const key = keyOf(perm, row.scopeType, row.scopeId);
    const next = new Set(sel);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setEdited(next);
    setSaveError(null);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const grants = [...sel].map(parseKey).filter((g) => {
        if (meIsAa) return true;
        // Non-AA editors only submit their in-reach slice; the server's
        // replace-within-reach leaves everything else untouched.
        if (g.scopeType === "business_unit") {
          return g.scopeId != null && reachBuIds.includes(g.scopeId);
        }
        if (g.scopeType === "project") {
          const buId = g.scopeId != null ? projectBuById.get(g.scopeId) : undefined;
          return buId != null && reachBuIds.includes(buId);
        }
        return false;
      });
      return api.put<UserPermissions>(`/api/admin/users/${user.id}/permissions`, { grants });
    },
    onSuccess: () => {
      setEdited(null);
      qc.invalidateQueries({ queryKey: ["admin", "user-perms", user.id] });
      onSaved();
    },
    onError: (err: Error) => setSaveError(err.message || "Could not save permissions"),
  });

  const rows: (GridRow | { section: string })[] = useMemo(() => {
    const out: (GridRow | { section: string })[] = [];
    out.push({ scopeType: "platform", scopeId: null, label: "Everything", sublabel: "whole platform" });
    out.push({ section: "Business units" });
    for (const bu of businessUnits) {
      out.push({ scopeType: "business_unit", scopeId: bu.id, label: bu.code, sublabel: bu.name });
    }
    out.push({ section: "Accounts" });
    for (const account of accounts) {
      out.push({ scopeType: "account", scopeId: account.id, label: account.code, sublabel: account.name });
      if (unfolded.has(account.id)) {
        for (const p of projectsByAccount.get(account.id) ?? []) {
          out.push({
            scopeType: "project",
            scopeId: p.id,
            label: p.projectCode,
            sublabel: p.name,
            indent: true,
            owningBuId: p.owningBu.id,
            accountId: account.id,
          });
        }
      }
    }
    return out;
  }, [businessUnits, accounts, unfolded, projectsByAccount]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Permissions for ${user.name}`}>
      <div className="absolute inset-0 bg-gray-900/40" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Permissions — {user.name}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Roles stay as presets; toggles below add scoped grants on top. Grants only widen access —
              they never take anything away.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {permsQ.isLoading || projectsQ.isLoading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
              <Spinner /> Loading permissions…
            </div>
          ) : permsQ.error ? (
            <Alert tone="rose">Could not load this user's permissions.</Alert>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="w-64 pb-2 text-left font-medium text-gray-500">Scope</th>
                  {PERMS.map((p) => (
                    <th key={p.key} className="pb-2 text-center text-xs font-medium text-gray-500">
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  if ("section" in row) {
                    return (
                      <tr key={`s-${row.section}`}>
                        <td colSpan={6} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {row.section}
                        </td>
                      </tr>
                    );
                  }
                  const rowKey = `${row.scopeType}:${row.scopeId ?? "platform"}:${i}`;
                  const isAccount = row.scopeType === "account";
                  const projectCount = isAccount ? (projectsByAccount.get(row.scopeId!) ?? []).length : 0;
                  return (
                    <tr key={rowKey} className="border-t border-gray-100">
                      <td className={`py-1.5 pr-2 ${row.indent ? "pl-6" : ""}`}>
                        <div className="flex items-center gap-1.5">
                          {isAccount && (
                            <button
                              type="button"
                              aria-label={unfolded.has(row.scopeId!) ? "Hide projects" : "Show projects"}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                              disabled={projectCount === 0}
                              onClick={() => {
                                const next = new Set(unfolded);
                                if (next.has(row.scopeId!)) next.delete(row.scopeId!);
                                else next.add(row.scopeId!);
                                setUnfolded(next);
                              }}
                            >
                              {unfolded.has(row.scopeId!) ? "▾" : "▸"}
                            </button>
                          )}
                          <span className="font-medium text-gray-800">{row.label}</span>
                          {row.sublabel && <span className="truncate text-xs text-gray-400">{row.sublabel}</span>}
                          {isAccount && projectCount > 0 && !unfolded.has(row.scopeId!) && (
                            <span className="text-xs text-gray-300">({projectCount})</span>
                          )}
                        </div>
                      </td>
                      {PERMS.map((perm) => {
                        const disabled = cellDisabled(perm.key, row);
                        const explicit = sel.has(keyOf(perm.key, row.scopeType, row.scopeId));
                        const reason = explicit ? null : inheritReason(perm.key, row);
                        const editable = cellEditable(perm.key, row) && !reason;
                        let cls = "mx-auto flex h-6 w-6 items-center justify-center rounded border text-xs ";
                        let content: string = "";
                        let title = "";
                        if (disabled) {
                          cls += "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300";
                          content = "–";
                          title = disabled;
                        } else if (explicit) {
                          cls += editable
                            ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-500"
                            : "border-indigo-200 bg-indigo-100 text-indigo-500 cursor-not-allowed";
                          content = "✓";
                          title = editable ? "Explicit grant — click to remove" : "Explicit grant (outside your editing reach)";
                        } else if (reason) {
                          cls += "cursor-default border-gray-200 bg-gray-100 text-gray-400";
                          content = "✓";
                          title = `Inherited ${reason}`;
                        } else if (editable) {
                          cls += "border-gray-300 bg-white hover:border-indigo-400";
                          title = "Click to grant";
                        } else {
                          cls += "cursor-not-allowed border-gray-200 bg-gray-50";
                          title = meIsAa ? "" : "Outside your editing reach";
                        }
                        return (
                          <td key={perm.key} className="py-1.5 text-center">
                            <button
                              type="button"
                              className={cls}
                              title={title}
                              disabled={!editable && !(explicit && editable)}
                              onClick={editable ? () => toggle(perm.key, row) : undefined}
                              aria-label={`${perm.label} at ${row.label}`}
                            >
                              {content}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-gray-200 px-6 py-3">
          {saveError && (
            <div className="mb-2">
              <Alert tone="rose">{saveError}</Alert>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-gray-400">
              Dimmed checks are inherited from a role or a broader tick. PMs always manage and price the
              projects they're assigned to; everyone logs their own hours.
              {!meIsAa && " You can edit rows for your own business unit and its projects."}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!dirty || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
