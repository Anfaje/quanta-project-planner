import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { Modal, FormInput, Button, Alert } from "./ui";

export function CreateBuModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Called with the fresh BU so callers (e.g. creatable selects) can auto-select it. */
  onCreated?: (bu: { id: string; code: string; name: string }) => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ businessUnit: { id: string; code: string; name: string } }>("/api/admin/bus", {
        code,
        name,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin", "bus"] });
      onCreated?.(res.businessUnit);
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

export function CreateAccountModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Called with the fresh account so callers (e.g. creatable selects) can auto-select it. */
  onCreated?: (account: { id: string; code: string; name: string }) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ account: { id: string; code: string; name: string } }>("/api/admin/accounts", {
        name,
        code,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin", "accounts"] });
      onCreated?.(res.account);
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
