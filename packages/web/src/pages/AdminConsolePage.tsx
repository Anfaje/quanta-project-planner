import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type {
  AdminAccount,
  AdminBusinessUnit,
  AdminDomain,
  AdminUser,
  InviteCreatedResponse,
  Role,
} from "../lib/types";
import { useMe } from "../context/AuthContext";
import { Layout } from "../components/Layout";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmModal,
  FormInput,
  Modal,
  PageHeader,
  PromptModal,
  Spinner,
  TabPanel,
  Tabs,
} from "../components/ui";
import { formatDate, formatRelative, roleLabel } from "../lib/format";

/**
 * Admin console.
 *
 * Four tabs. Each tab exercises a separate set of admin endpoints; an AA has
 * full access, a BUL sees users + BUs only. The server enforces the rules;
 * we mirror them for tab visibility.
 *
 * Layout is table-based rather than card-grid because admin work is mostly
 * scanning lists and issuing one-off actions — density beats whitespace.
 */

type TabId = "users" | "bus" | "accounts" | "domains";

export function AdminConsolePage() {
  const me = useMe();
  const isAA = me.roles.includes("AA");
  const isBUL = me.roles.includes("BUL");

  // Compute accessible tabs based on role. BUL can see users + BUs.
  const tabs = useMemo(() => {
    const t: { id: TabId; label: string }[] = [];
    if (isAA || isBUL) t.push({ id: "users", label: "Users" });
    if (isAA || isBUL) t.push({ id: "bus", label: "Business units" });
    if (isAA) t.push({ id: "accounts", label: "Accounts" });
    if (isAA) t.push({ id: "domains", label: "Domains" });
    return t;
  }, [isAA, isBUL]);

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0]?.id ?? "users");

  return (
    <Layout>
      <PageHeader
        title="Admin console"
        subtitle="Manage users, business units, accounts, and authentication settings."
      />

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} className="mb-6" />

      <TabPanel id="users" active={activeTab === "users"}>
        <UsersTab canEditAll={isAA} buLeadOf={!isAA && isBUL ? (me.primaryBu?.code ?? null) : null} myId={me.id} />
      </TabPanel>
      <TabPanel id="bus" active={activeTab === "bus"}>
        <BusinessUnitsTab canWrite={isAA} />
      </TabPanel>
      <TabPanel id="accounts" active={activeTab === "accounts"}>
        <AccountsTab />
      </TabPanel>
      <TabPanel id="domains" active={activeTab === "domains"}>
        <DomainsTab />
      </TabPanel>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════
// Users tab
// ═══════════════════════════════════════════════════════════════

function UsersTab({
  canEditAll,
  buLeadOf,
  myId,
}: {
  canEditAll: boolean;
  buLeadOf: string | null; // BU code the caller leads (non-AA BUL), else null
  myId: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<{ users: AdminUser[] }>("/api/admin/users"),
  });

  const busQ = useQuery({
    queryKey: ["admin", "bus"],
    queryFn: () => api.get<{ businessUnits: AdminBusinessUnit[] }>("/api/admin/bus"),
  });
  const accountsQ = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: () => api.get<{ accounts: AdminAccount[] }>("/api/admin/accounts"),
    enabled: canEditAll || buLeadOf != null, // AA: account assignment; BUL: modal reference data
  });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [inviting, setInviting] = useState(false);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.users;
    return data.users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roles.some((r) => r.toLowerCase().includes(q))
    );
  }, [data, search]);

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/users/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const reactivateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/users/${id}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/users/${id}`),
    onSuccess: () => {
      setDeleting(null);
      setDeleteErr(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => setDeleteErr(err instanceof ApiError ? err.message : "Could not delete user"),
  });

  const [costEditing, setCostEditing] = useState<AdminUser | null>(null);
  const costRateMutation = useMutation({
    mutationFn: (args: { id: string; costRate: number | null }) =>
      api.put(`/api/admin/users/${args.id}/cost-rate`, { costRate: args.costRate }),
    onSuccess: () => {
      setCostEditing(null);
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or role"
          className="max-w-md flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
        />
        <Button onClick={() => setInviting(true)}>Invite user</Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="md" color="indigo" />
        </div>
      )}

      {error && <Alert tone="rose">Couldn&apos;t load users.</Alert>}

      {data && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Roles</th>
                  <th className="text-left px-6 py-3 font-medium">BU</th>
                  <th className="text-left px-6 py-3 font-medium">Accounts</th>
                  <th className="text-right px-6 py-3 font-medium">Cost $/h</th>
                  <th className="text-right px-6 py-3 font-medium">Projects</th>
                  <th className="text-right px-6 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((u) => {
                  const rowEditable =
                    canEditAll ||
                    (buLeadOf != null &&
                      u.primaryBu?.code === buLeadOf &&
                      !u.roles.includes("AA") &&
                      u.id !== myId);
                  return (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <div className="text-sm font-medium text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} tone="indigo">{r}</Badge>
                        ))}
                        {u.financialAccess && <Badge tone="amber">$</Badge>}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-600">
                      {u.primaryBu?.code ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-600">
                      {u.managedAccounts.length > 0
                        ? u.managedAccounts.map((a) => a.code).join(", ")
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      <button
                        onClick={() => setCostEditing(u)}
                        className="hover:text-indigo-600"
                        title="Edit cost rate"
                      >
                        {u.costRate != null ? (
                          `$${u.costRate}`
                        ) : (
                          <span className="text-gray-300">— set</span>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {u.projectCount}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {u.status === "active" ? (
                        <Badge tone="emerald">active</Badge>
                      ) : u.status === "pending" ? (
                        <Badge tone="amber">invited</Badge>
                      ) : (
                        <Badge tone="gray">deactivated</Badge>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {rowEditable && (
                          <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                            Edit
                          </Button>
                        )}
                        {u.isActive ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deactivateMutation.mutate(u.id)}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => reactivateMutation.mutate(u.id)}
                            >
                              Reactivate
                            </Button>
                            {canEditAll && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDeleteErr(null);
                                  setDeleting(u);
                                }}
                              >
                                Delete
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && busQ.data && (
        <UserEditModal
          user={editing}
          businessUnits={busQ.data.businessUnits}
          accounts={accountsQ.data?.accounts ?? []}
          canAssignAccounts={canEditAll}
          restricted={!canEditAll}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin", "users"] });
          }}
        />
      )}

      {inviting && busQ.data && (
        <InviteModal
          lockBuCode={buLeadOf}
          allowAa={canEditAll}
          businessUnits={busQ.data.businessUnits}
          onClose={() => setInviting(false)}
        />
      )}

      {costEditing && (
        <PromptModal
          open
          title={`Cost rate — ${costEditing.name}`}
          message="Fully-loaded hourly cost (salary + overhead). New projects use this rate; existing projects keep the rate captured when they were created. Leave blank to clear."
          placeholder="e.g. 120"
          initialValue={costEditing.costRate != null ? String(costEditing.costRate) : ""}
          submitLabel="Save"
          inputType="number"
          inputMode="decimal"
          validator={(v) => {
            if (v.trim() === "") return null; // blank clears the rate
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0) return "Enter a non-negative number";
            return null;
          }}
          loading={costRateMutation.isPending}
          onCancel={() => setCostEditing(null)}
          onSubmit={(v) => {
            const trimmed = v.trim();
            costRateMutation.mutate({
              id: costEditing.id,
              costRate: trimmed === "" ? null : Number(trimmed),
            });
          }}
        />
      )}

      <ConfirmModal
        open={deleting !== null}
        title="Delete user"
        tone="danger"
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        message={
          <>
            Permanently delete <strong>{deleting?.name}</strong> ({deleting?.email})? This
            can&rsquo;t be undone.
            {deleteErr && <span className="block mt-3 text-rose-600">{deleteErr}</span>}
          </>
        }
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        onCancel={() => {
          setDeleting(null);
          setDeleteErr(null);
        }}
      />
    </div>
  );
}

// ── User edit modal ──

function UserEditModal({
  user,
  businessUnits,
  accounts,
  canAssignAccounts,
  restricted = false,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  businessUnits: AdminBusinessUnit[];
  accounts: AdminAccount[];
  canAssignAccounts: boolean;
  /** BU-lead mode: role ceiling (no AA) and the AA-only switches hidden. */
  restricted?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<Role[]>(user.roles);
  const [financialAccess, setFinancialAccess] = useState(user.financialAccess);
  const initialBuId = businessUnits.find((b) => b.code === user.primaryBu?.code)?.id ?? "";
  const [primaryBuId, setPrimaryBuId] = useState(initialBuId);
  const [managedAccountIds, setManagedAccountIds] = useState<string[]>(
    user.managedAccounts.map((a) => a.id)
  );
  const [projectRolesText, setProjectRolesText] = useState(user.projectRoles.join(", "));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const newProjectRoles = projectRolesText
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (JSON.stringify(newProjectRoles) !== JSON.stringify(user.projectRoles)) {
        await api.put(`/api/admin/users/${user.id}/profile`, { projectRoles: newProjectRoles });
      }
      return api.put(
        `/api/admin/users/${user.id}/roles`,
        restricted
          ? { roles }
          : {
              roles,
              financialAccess,
              primaryBuId: primaryBuId || undefined,
              managedAccountIds: roles.includes("AC") ? managedAccountIds : [],
            }
      );
    },
    onSuccess: onSaved,
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Save failed");
    },
  });

  const toggleRole = (r: Role) => {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const toggleAccount = (id: string) => {
    setManagedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${user.name}`} size="md">
      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <div className="mb-5">
        <div className="text-sm font-medium text-gray-700 mb-2">Roles</div>
        <div className="grid grid-cols-5 gap-2">
          {(["IC", "PM", "AC", "BUL", "AA"] as Role[])
            .filter((r) => !restricted || r !== "AA")
            .map((r) => {
            const active = roles.includes(r);
            return (
              <button
                key={r}
                onClick={() => toggleRole(r)}
                className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                  active
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300"
                }`}
                title={roleLabel(r)}
              >
                {r}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-gray-400 mt-1.5">
          {roles.map((r) => roleLabel(r)).join(" · ")}
        </div>
      </div>

      <div className="mb-5">
        <FormInput
          label="Preferred project role(s)"
          value={projectRolesText}
          onChange={setProjectRolesText}
          placeholder="e.g. iOS Dev, Backend"
          hint="Comma-separated planning labels — these don't change permissions."
        />
      </div>

      {!restricted && (
      <div className="mb-5">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={financialAccess}
            onChange={(e) => setFinancialAccess(e.target.checked)}
          />
          Financial access (AA supplement)
        </label>
        <div className="text-xs text-gray-400 mt-0.5 ml-6">
          Enables platform-wide financial visibility for AAs.
        </div>
      </div>
      )}

      {!restricted && (
      <div className="mb-5">
        <div className="text-sm font-medium text-gray-700 mb-2">Primary business unit</div>
        <select
          value={primaryBuId}
          onChange={(e) => setPrimaryBuId(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
        >
          <option value="">— no change —</option>
          {businessUnits
            .filter((b) => b.isActive)
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name}
              </option>
            ))}
        </select>
      </div>
      )}

      {roles.includes("AC") && canAssignAccounts && (
        <div className="mb-5">
          <div className="text-sm font-medium text-gray-700 mb-2">Managed accounts</div>
          {accounts.length === 0 ? (
            <div className="text-xs text-gray-400">No accounts exist yet.</div>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {accounts
                .filter((a) => a.isActive)
                .map((a) => {
                  const picked = managedAccountIds.includes(a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => toggleAccount(a.id)}
                      />
                      <div className="text-sm text-gray-700">
                        {a.name}
                        <span className="text-gray-400 ml-1">({a.code})</span>
                      </div>
                    </label>
                  );
                })}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={mutation.isPending}
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
          disabled={roles.length === 0}
        >
          Save changes
        </Button>
      </div>
    </Modal>
  );
}

// ── Invite modal ──

function InviteModal({
  businessUnits,
  lockBuCode = null,
  allowAa = true,
  onClose,
}: {
  businessUnits: AdminBusinessUnit[];
  /** BU-lead mode: invites are locked to this BU code. */
  lockBuCode?: string | null;
  /** Whether the AA role may be granted (AA callers only). */
  allowAa?: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const lockedBuId = lockBuCode
    ? businessUnits.find((b) => b.code === lockBuCode)?.id ?? ""
    : null;
  const [buId, setBuId] = useState(
    lockedBuId ?? (businessUnits.find((b) => b.isActive)?.id ?? "")
  );

  // Whitelist is only about self-signup; an invitation authorizes any address.
  // We still flag foreign domains so a typo'd or external invite is deliberate.
  const domainsQ = useQuery({
    queryKey: ["admin", "domains"],
    queryFn: () => api.get<{ domains: Array<{ domain: string }> }>("/api/admin/domains"),
  });
  const whitelisted = (domainsQ.data?.domains ?? []).map((d) => d.domain.toLowerCase());
  const emailDomain = email.includes("@") ? (email.split("@")[1] ?? "").trim().toLowerCase() : "";
  const foreignDomain =
    emailDomain.length > 0 && whitelisted.length > 0 && !whitelisted.includes(emailDomain);
  const [projectRole, setProjectRole] = useState("");
  const [roles, setRoles] = useState<Role[]>(["IC"]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteCreatedResponse | null>(null);

  const toggleRole = (r: Role) =>
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));

  const mutation = useMutation({
    mutationFn: () =>
      api.post<InviteCreatedResponse>("/api/admin/users/invite", {
        email,
        buId,
        roles,
        name: name || undefined,
        projectRole: projectRole || undefined,
      }),
    onSuccess: (res) => setResult(res),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Invite failed"),
  });

  return (
    <Modal open onClose={onClose} title="Invite user" size="md">
      {result ? (
        <div>
          <Alert tone="emerald" title="Invitation created">
            Share this link with {result.email}. Expires {formatDate(result.expiresAt)}.
          </Alert>
          <div className="mt-4 bg-gray-50 rounded-lg p-3 font-mono text-xs break-all select-all border border-gray-100">
            {window.location.origin}
            {result.acceptUrl}
          </div>
          <div className="text-xs text-gray-400 mt-2">
            SMTP delivery isn&apos;t wired yet — copy the link and send it manually.
          </div>
          <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-100">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4">
              <Alert tone="rose">{error}</Alert>
            </div>
          )}
          <FormInput label="Email *" type="email" value={email} onChange={setEmail} autoFocus />
          {foreignDomain && (
            <p className="mt-1.5 text-xs text-amber-600">
              {emailDomain} isn&rsquo;t one of the self-signup domains — this invitation goes to
              an external address. That&rsquo;s allowed: the invitation itself is the
              authorization.
            </p>
          )}
          <FormInput label="Name" value={name} onChange={setName} placeholder="Optional pre-fill" />
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Business unit *
            </label>
            <select
          disabled={lockedBuId != null}
              value={buId}
              onChange={(e) => setBuId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
            >
              {businessUnits
                .filter((b) => b.isActive)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} · {b.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Role *
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(["IC", "PM", "AC", "BUL", "AA"] as Role[])
            .filter((r) => allowAa || r !== "AA")
            .map((r) => {
                const active = roles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-colors ${
                      active
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-500 border-gray-200 hover:border-indigo-300"
                    }`}
                    title={roleLabel(r)}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
            <div className="text-xs text-gray-400 mt-1.5">
              {roles.length
                ? `Signs up as: ${roles.map((r) => roleLabel(r)).join(" · ")}`
                : "Pick at least one role"}
            </div>
          </div>
          <FormInput
            label="Project role"
            value={projectRole}
            onChange={setProjectRole}
            placeholder="e.g. iOS Dev (optional)"
            hint="Shown to the invitee and added to their project roles."
          />

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
              disabled={!email || !buId || roles.length === 0}
            >
              Create invite
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// Business units tab
// ═══════════════════════════════════════════════════════════════

function BusinessUnitsTab({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "bus"],
    queryFn: () => api.get<{ businessUnits: AdminBusinessUnit[] }>("/api/admin/bus"),
  });

  const [creating, setCreating] = useState(false);

  const toggleMutation = useMutation({
    mutationFn: (args: { id: string; activate: boolean }) =>
      api.put(`/api/admin/bus/${args.id}/${args.activate ? "activate" : "deactivate"}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "bus"] }),
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        {canWrite && <Button onClick={() => setCreating(true)}>Add business unit</Button>}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="md" color="indigo" />
        </div>
      )}
      {error && <Alert tone="rose">Couldn&apos;t load business units.</Alert>}

      {data && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Code</th>
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">BUL</th>
                  <th className="text-right px-6 py-3 font-medium">Users</th>
                  <th className="text-right px-6 py-3 font-medium">Projects</th>
                  <th className="text-right px-6 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.businessUnits.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <Badge>{b.code}</Badge>
                    </td>
                    <td className="px-6 py-3 text-gray-800 font-medium">{b.name}</td>
                    <td className="px-6 py-3 text-gray-600">
                      {b.bul ? b.bul.name : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {b.userCount}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {b.projectCount}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {b.isActive ? (
                        <Badge tone="emerald">active</Badge>
                      ) : (
                        <Badge tone="gray">inactive</Badge>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            toggleMutation.mutate({ id: b.id, activate: !b.isActive })
                          }
                        >
                          {b.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {creating && <CreateBuModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateBuModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post("/api/admin/bus", { code, name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "bus"] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Create failed"),
  });

  return (
    <Modal open onClose={onClose} title="New business unit" size="sm">
      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}
      <FormInput
        label="Code *"
        value={code}
        onChange={(v) => setCode(v.toUpperCase())}
        placeholder="e.g. US-ORD-OWLS"
        autoFocus
      />
      <FormInput
        label="Name *"
        value={name}
        onChange={setName}
        placeholder="e.g. Chicago Owls"
      />
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          disabled={!code || !name}
        >
          Create
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// Accounts tab
// ═══════════════════════════════════════════════════════════════

function AccountsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "accounts"],
    queryFn: () => api.get<{ accounts: AdminAccount[] }>("/api/admin/accounts"),
  });

  const [creating, setCreating] = useState(false);

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/admin/accounts/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "accounts"] }),
  });

  return (
    <div>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setCreating(true)}>Add account</Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="md" color="indigo" />
        </div>
      )}
      {error && <Alert tone="rose">Couldn&apos;t load accounts.</Alert>}

      {data && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Name</th>
                  <th className="text-left px-6 py-3 font-medium">Code</th>
                  <th className="text-left px-6 py-3 font-medium">Managers</th>
                  <th className="text-right px-6 py-3 font-medium">Projects</th>
                  <th className="text-right px-6 py-3 font-medium">Status</th>
                  <th className="text-right px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-900 font-medium">{a.name}</td>
                    <td className="px-6 py-3">
                      <Badge>{a.code}</Badge>
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-600">
                      {a.managers.length > 0
                        ? a.managers.map((m) => m.name).join(", ")
                        : <span className="text-gray-400">None assigned</span>}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {a.projectCount}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {a.isActive ? (
                        <Badge tone="emerald">active</Badge>
                      ) : (
                        <Badge tone="gray">inactive</Badge>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {a.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deactivateMutation.mutate(a.id)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-3 text-xs text-gray-400">
        Assign account managers by editing individual users (add the AC role and pick accounts).
      </div>

      {creating && <CreateAccountModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateAccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post("/api/admin/accounts", { name, code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "accounts"] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Create failed"),
  });

  return (
    <Modal open onClose={onClose} title="New account" size="sm">
      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}
      <FormInput label="Name *" value={name} onChange={setName} autoFocus />
      <FormInput
        label="Code *"
        value={code}
        onChange={(v) => setCode(v.toUpperCase())}
        placeholder="e.g. MER"
      />
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          disabled={!name || !code}
        >
          Create
        </Button>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════
// Domains tab
// ═══════════════════════════════════════════════════════════════

function DomainsTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "domains"],
    queryFn: () => api.get<{ domains: AdminDomain[] }>("/api/admin/domains"),
  });

  const [newDomain, setNewDomain] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const addMutation = useMutation({
    mutationFn: () => api.post("/api/admin/domains", { domain: newDomain }),
    onSuccess: () => {
      setNewDomain("");
      qc.invalidateQueries({ queryKey: ["admin", "domains"] });
    },
    onError: (err) => setFormError(err instanceof ApiError ? err.message : "Add failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/domains/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "domains"] });
      setPendingDelete(null);
    },
  });

  // Domain currently queued for deletion confirmation.
  const [pendingDelete, setPendingDelete] = useState<AdminDomain | null>(null);

  return (
    <div>
      <Card className="mb-6">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add domain</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Users can only sign up if their email domain is whitelisted.
          </p>
        </div>
        <div className="p-6 flex items-end gap-3">
          <div className="flex-1">
            <FormInput
              label="Domain"
              value={newDomain}
              onChange={(v) => {
                setFormError(null);
                setNewDomain(v.toLowerCase());
              }}
              placeholder="example.com"
              error={formError ?? undefined}
            />
          </div>
          <div className="pb-4">
            <Button
              onClick={() => {
                setFormError(null);
                addMutation.mutate();
              }}
              loading={addMutation.isPending}
              disabled={!newDomain}
            >
              Add
            </Button>
          </div>
        </div>
      </Card>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="md" color="indigo" />
        </div>
      )}
      {error && <Alert tone="rose">Couldn&apos;t load domains.</Alert>}

      {data && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">Domain</th>
                  <th className="text-left px-6 py-3 font-medium">Added by</th>
                  <th className="text-left px-6 py-3 font-medium">Added</th>
                  <th className="text-right px-6 py-3 font-medium">Active users</th>
                  <th className="text-right px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.domains.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono text-sm text-gray-800">{d.domain}</td>
                    <td className="px-6 py-3 text-gray-600">{d.addedBy}</td>
                    <td className="px-6 py-3 text-gray-500 text-xs">
                      {formatRelative(d.addedAt)}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700 tabular-nums">
                      {d.activeUsers}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(d)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title="Remove whitelisted domain?"
        message={
          pendingDelete ? (
            <>
              Remove <strong>{pendingDelete.domain}</strong>? Existing users won&apos;t be
              affected but new signups from this domain will be blocked.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Remove"
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
