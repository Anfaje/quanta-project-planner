import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { BusinessUnitLite } from "../lib/types";
import { Modal, Button, Alert, Spinner } from "./ui";

/**
 * Manage which business units a project is shared with (TC 4.10 / 5.22).
 *
 * Sharing grants the target BU's leader visibility of the project. The BU
 * picker is sourced from /api/admin/bus, which is BUL/AA-gated — so this
 * modal is only opened for those roles (the owning team's leader sharing
 * outward). Add/remove both return the updated share list, and we invalidate
 * the project detail query so the header badge stays in sync.
 */

interface BuListItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

interface Props {
  projectId: string;
  owningBuId: string;
  sharedWithBus: BusinessUnitLite[];
  open: boolean;
  onClose: () => void;
}

export function ShareProjectModal({ projectId, owningBuId, sharedWithBus, open, onClose }: Props) {
  const qc = useQueryClient();
  const [selectedBu, setSelectedBu] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: buData, isLoading: busLoading } = useQuery({
    queryKey: ["admin", "bus"],
    queryFn: () => api.get<{ businessUnits: BuListItem[] }>("/api/admin/bus"),
    enabled: open, // only fetch once the modal is actually opened
  });

  const sharedIds = useMemo(() => new Set(sharedWithBus.map((b) => b.id)), [sharedWithBus]);

  // BUs eligible to share with: active, not the owner, not already shared.
  const shareable = useMemo(
    () =>
      (buData?.businessUnits ?? []).filter(
        (b) => b.isActive && b.id !== owningBuId && !sharedIds.has(b.id)
      ),
    [buData, owningBuId, sharedIds]
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["project", projectId] });

  const shareMutation = useMutation({
    mutationFn: (buId: string) =>
      api.post(`/api/projects/${projectId}/share`, { buId }),
    onSuccess: () => {
      setSelectedBu("");
      setError(null);
      invalidate();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not share project"),
  });

  const unshareMutation = useMutation({
    mutationFn: (buId: string) => api.delete(`/api/projects/${projectId}/share/${buId}`),
    onSuccess: invalidate,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Could not remove share"),
  });

  const busy = shareMutation.isPending || unshareMutation.isPending;

  return (
    <Modal open={open} onClose={onClose} title="Share project" size="md">
      <p className="text-sm text-gray-500 mb-4">
        Shared business units&apos; leaders can view this project (read-only). The owning team keeps
        full control.
      </p>

      {error && (
        <div className="mb-3">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      {/* Current shares */}
      <div className="mb-5">
        <div className="text-xs font-medium text-gray-500 mb-2">Currently shared with</div>
        {sharedWithBus.length === 0 ? (
          <div className="text-sm text-gray-400">Not shared with any other business unit.</div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {sharedWithBus.map((b) => (
              <li key={b.id}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 pl-3 pr-1.5 py-1 text-xs">
                  <span className="font-medium text-gray-700">{b.code}</span>
                  <span className="text-gray-400">{b.name}</span>
                  <button
                    onClick={() => unshareMutation.mutate(b.id)}
                    disabled={busy}
                    aria-label={`Stop sharing with ${b.name}`}
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

      {/* Add a share */}
      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs font-medium text-gray-500 mb-2">Share with another BU</div>
        {busLoading ? (
          <Spinner size="sm" color="indigo" />
        ) : shareable.length === 0 ? (
          <div className="text-sm text-gray-400">No other active business units available.</div>
        ) : (
          <div className="flex items-center gap-2">
            <select
              value={selectedBu}
              onChange={(e) => setSelectedBu(e.target.value)}
              disabled={busy}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select a business unit…</option>
              {shareable.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={() => selectedBu && shareMutation.mutate(selectedBu)}
              disabled={!selectedBu || busy}
              loading={shareMutation.isPending}
            >
              Share
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
