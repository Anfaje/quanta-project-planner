import { useState, type ReactNode } from "react";

export const CREATE_SENTINEL = "__create_new__";

/**
 * A select with an optional trailing "+ Add new …" affordance.
 *
 * Choosing the affordance never commits a selection — it opens the caller's
 * create modal instead, so cancelling naturally restores the previous value
 * (the controlled value was never changed). The caller's modal is expected
 * to invalidate its option query and hand back the fresh entity via its
 * onCreated/onInvited callback, at which point the caller sets `value`.
 */
export function CreatableSelect({
  value,
  onChange,
  options,
  placeholder,
  canCreate,
  createLabel,
  renderCreateModal,
  id,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  /** When false, the affordance is absent from the DOM entirely. */
  canCreate: boolean;
  /** e.g. "New account…" — rendered as "+ New account…". */
  createLabel: string;
  /** Render the matching create modal; call close() to dismiss. */
  renderCreateModal: (close: () => void) => ReactNode;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => {
          if (e.target.value === CREATE_SENTINEL) {
            setCreating(true);
            return; // never commit the sentinel — previous value stands
          }
          onChange(e.target.value);
        }}
        className={
          className ??
          "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
        }
      >
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {canCreate && <option value={CREATE_SENTINEL}>+ {createLabel}</option>}
      </select>
      {creating && renderCreateModal(() => setCreating(false))}
    </>
  );
}
