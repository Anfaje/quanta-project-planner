import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Modal, FormInput, Button, Alert } from "./ui";

/**
 * Set a business unit's target margin (percent). The server allows AA for
 * any BU and a BUL for their own; callers surface it only where that holds.
 */
export function EditBuTargetModal({
  buId,
  buCode,
  current,
  invalidateKeys = [["admin", "bus"]],
  onClose,
}: {
  buId: string;
  buCode: string;
  current: number;
  /** Query keys to invalidate on success (prefix match). */
  invalidateKeys?: unknown[][];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  const parsed = Number(value);
  const valid = value.trim() !== "" && !Number.isNaN(parsed) && parsed >= 0 && parsed <= 95;

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/admin/bus/${buId}`, { targetMarginPct: parsed }),
    onSuccess: () => {
      for (const key of invalidateKeys) qc.invalidateQueries({ queryKey: key });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Update failed"),
  });

  return (
    <Modal open onClose={onClose} title={`Target margin — ${buCode}`} size="sm">
      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}
      <FormInput
        label="Target margin (%)"
        type="number"
        value={value}
        onChange={setValue}
        hint="Drives the BU-health comparison and the below-target flag on this BU's projects. 0–95."
        autoFocus
      />
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={mutation.isPending} onClick={() => mutation.mutate()} disabled={!valid}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
