import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { AdminUser, UserLite } from "../lib/types";
import { Modal, Button, Alert, Spinner } from "./ui";
import { useMe } from "../context/AuthContext";

/**
 * Share a DRAFT project with colleagues for review (the draft-workflow analogue
 * of ShareProjectModal, which shares at the BU level). Reviewers are individual
 * users — typically the owner's manager and peers. Being a reviewer grants
 * visibility, not approval: approval rights come from role (AA / owning-BU BUL).
 *
 * The user directory is sourced from /api/admin/users, which is now readable by
 * PM/BUL/AC/AA. Add returns the updated reviewer list; remove is a 204. We keep a
 * local copy of the current reviewers (seeded from the prop) so this works both
 * in the wizard — where the just-created draft has none and isn't in cache yet —
 * and on the detail page, where we also invalidate the project query.
 */

interface Props {
  projectId: string;
  /** Current reviewers; [] for a freshly created draft. */
  reviewers: UserLite[];
  open: boolean;
  onClose: () => void;
  /** Owning BU id — used only to surface a hint, not to filter. */
  title?: string;
  intro?: string;
  doneLabel?: string;
}

export function ReviewerShareModal({
  projectId,
  reviewers,
  open,
  onClose,
  title = "Share draft for review",
  intro = "Reviewers can open this draft and see the numbers. They'll find it under “Shared with me” in Drafts. Sharing does not grant approval — only an AA or the owning BU's leader can approve.",
  doneLabel = "Done",
}: Props) {
  const qc = useQueryClient();
  const me = useMe();
  const [current, setCurrent] = useState<UserLite[]>(reviewers);
  const [selectedUser, setSelectedUser] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Re-seed when reopened or when the parent passes a fresh list.
  useEffect(() => {
    if (open) setCurrent(reviewers);
  }, [open, reviewers]);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<{ users: AdminUser[] }>("/api/admin/users"),
    enabled: open,
  });

  const currentIds = useMemo(() => new Set(current.map((u) => u.id)), [current]);
  const addable = useMemo(
    // Exclude the current user — you can't add yourself as a reviewer of your
    // own draft — alongside already-added reviewers and inactive accounts.
    () => (usersData?.users ?? []).filter((u) => u.isActive && u.id !== me.id && !currentIds.has(u.id)),
    [usersData, currentIds, me.id]
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["project", projectId] });
    qc.invalidateQueries({ queryKey: ["drafts"] });
  };

  const addMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post<{ reviewers: UserLite[] }>(`/api/projects/${projectId}/reviewers`, {
        userIds: [userId],
      }),
    onSuccess: (res) => {
      setCurrent(res.reviewers);
      setSelectedUser("");
      setError(null);
      invalidate();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not add reviewer"),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/projects/${projectId}/reviewers/${userId}`),
    onSuccess: (_data, userId) => {
      setCurrent((c) => c.filter((u) => u.id !== userId));
      setError(null);
      invalidate();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Could not remove reviewer"),
  });

  const busy = addMutation.isPending || removeMutation.isPending;

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <p className="text-sm text-gray-500 mb-4">{intro}</p>

      {error && (
        <div className="mb-3">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      {/* Current reviewers */}
      <div className="mb-5">
        <div className="text-xs font-medium text-gray-500 mb-2">Reviewers</div>
        {current.length === 0 ? (
          <div className="text-sm text-gray-400">No reviewers yet.</div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {current.map((u) => (
              <li key={u.id}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 pl-3 pr-1.5 py-1 text-xs">
                  <span className="font-medium text-gray-700">{u.name}</span>
                  <span className="text-gray-400">{u.email}</span>
                  <button
                    onClick={() => removeMutation.mutate(u.id)}
                    disabled={busy}
                    aria-label={`Remove ${u.name}`}
                    className="ml-0.5 w-4 h-4 rounded-full text-gray-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add a reviewer */}
      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs font-medium text-gray-500 mb-2">Add a colleague</div>
        {isLoading ? (
          <Spinner size="sm" color="indigo" />
        ) : addable.length === 0 ? (
          <div className="text-sm text-gray-400">No other active users available.</div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              disabled={busy}
              aria-label="Select a colleague to add as reviewer"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select a colleague…</option>
              {addable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.email}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => selectedUser && addMutation.mutate(selectedUser)}
              disabled={!selectedUser || busy}
              loading={addMutation.isPending}
            >
              Add
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          {doneLabel}
        </Button>
      </div>
    </Modal>
  );
}
