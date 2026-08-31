import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { formatDate, roleLabel } from "../lib/format";
import type { AdminBusinessUnit, InviteCreatedResponse, Role } from "../lib/types";
import { Modal, FormInput, Button, Alert } from "./ui";
import { CreatableSelect } from "./CreatableSelect";
import { CreateBuModal } from "./EntityCreateModals";

export function InviteModal({
  businessUnits,
  lockBuCode = null,
  allowedBuIds = null,
  allowAa = true,
  onClose,
  onInvited,
}: {
  businessUnits: AdminBusinessUnit[];
  /** BU-lead mode: invites are locked to this BU code. */
  lockBuCode?: string | null;
  /** Grant-holder mode: BU choices restricted to these ids (locks when one). */
  allowedBuIds?: string[] | null;
  /** Whether the AA role may be granted (AA callers only). */
  allowAa?: boolean;
  onClose: () => void;
  /** Called once the invite is created (pending user id included). */
  onInvited?: (result: InviteCreatedResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const selectableBus = allowedBuIds
    ? businessUnits.filter((b) => allowedBuIds.includes(b.id))
    : businessUnits;
  const soleAllowedId = allowedBuIds && selectableBus.length === 1 ? selectableBus[0].id : null;
  const lockedBuId =
    (lockBuCode ? businessUnits.find((b) => b.code === lockBuCode)?.id ?? "" : null) ??
    soleAllowedId;
  const [buId, setBuId] = useState(
    lockedBuId ?? (selectableBus.find((b) => b.isActive)?.id ?? "")
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
    onSuccess: (res) => {
      setResult(res);
      onInvited?.(res);
    },
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
            {lockedBuId != null ? (
              <select
                disabled
                value={buId}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg bg-gray-50"
              >
                {selectableBus
                  .filter((b) => b.isActive)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} · {b.name}
                    </option>
                  ))}
              </select>
            ) : (
              <CreatableSelect
                value={buId}
                onChange={setBuId}
                options={selectableBus
                  .filter((b) => b.isActive)
                  .map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))}
                canCreate={allowAa}
                createLabel="New business unit…"
                renderCreateModal={(close) => (
                  <CreateBuModal onClose={close} onCreated={(bu) => setBuId(bu.id)} />
                )}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50 bg-white"
              />
            )}
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
