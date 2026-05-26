/**
 * Shared UI primitives.
 *
 * Flat component set — no Radix, no headless-ui, just Tailwind classes. If we
 * need Combobox / Dialog later we reach for a proper library, but for now
 * the prototypes get by with native HTML + our own styling.
 */

import {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

// ── Button ──

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  size?: "sm" | "md";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading, size = "md", className = "", children, disabled, ...rest },
  ref
) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const styles = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm",
    secondary: "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200",
    ghost: "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
    danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm",
  }[variant];

  return (
    <button
      ref={ref}
      className={`${base} ${sz} ${styles} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner size="xs" color={variant === "primary" || variant === "danger" ? "white" : "gray"} />}
      {children}
    </button>
  );
});

// ── Spinner ──

export function Spinner({
  size = "sm",
  color = "gray",
  label,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  color?: "gray" | "white" | "indigo";
  /** Optional accessible label; when omitted the spinner is decorative. */
  label?: string;
}) {
  const s = { xs: "w-3 h-3", sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" }[size];
  const c = { gray: "text-gray-400", white: "text-white", indigo: "text-indigo-500" }[color];
  return (
    <svg
      className={`${s} ${c} animate-spin`}
      fill="none"
      viewBox="0 0 24 24"
      role={label ? "status" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="50" strokeDashoffset="25" />
    </svg>
  );
}

// ── FormInput ──

interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
}

export function FormInput({ label, value, onChange, error, hint, type = "text", id, ...rest }: FormInputProps) {
  // Generate one stable id per render; reuse it for the input + label
  // association and for any hint/error elements we link via
  // aria-describedby.
  const reactId = useId();
  const inputId = id ?? `fi-${reactId}`;
  const messageId = error || hint ? `${inputId}-msg` : undefined;
  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none transition-all ${
          error
            ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-50"
            : "border-gray-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
        } disabled:bg-gray-50 disabled:text-gray-500`}
        {...rest}
      />
      {error && (
        <div id={messageId} className="text-xs text-rose-500 mt-1 flex items-center gap-1">
          <svg aria-hidden="true" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
          </svg>
          {error}
        </div>
      )}
      {hint && !error && (
        <div id={messageId} className="text-xs text-gray-400 mt-1">
          {hint}
        </div>
      )}
    </div>
  );
}

// ── FormTextarea ──

interface FormTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
}

export function FormTextarea({ label, value, onChange, error, hint, rows = 3, id, ...rest }: FormTextareaProps) {
  const reactId = useId();
  const taId = id ?? `fi-${reactId}`;
  const messageId = error || hint ? `${taId}-msg` : undefined;
  return (
    <div className="mb-4">
      {label && (
        <label htmlFor={taId} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      <textarea
        id={taId}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none transition-all ${
          error
            ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-50"
            : "border-gray-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
        }`}
        {...rest}
      />
      {error && (
        <div id={messageId} className="text-xs text-rose-500 mt-1">
          {error}
        </div>
      )}
      {hint && !error && (
        <div id={messageId} className="text-xs text-gray-400 mt-1">
          {hint}
        </div>
      )}
    </div>
  );
}

// ── Card ──

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm ${className}`}>{children}</div>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-6 py-4 border-b border-gray-100 ${className}`}>{children}</div>;
}

export function CardBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

// ── Badge ──

type BadgeTone = "indigo" | "emerald" | "amber" | "rose" | "sky" | "gray";

export function Badge({
  tone = "gray",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded-full ${styles} ${className}`}
    >
      {children}
    </span>
  );
}

// ── Alert ──

export function Alert({
  tone = "amber",
  title,
  children,
}: {
  tone?: "amber" | "rose" | "emerald" | "indigo";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    rose: "bg-rose-50 border-rose-200 text-rose-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
  }[tone];
  return (
    <div className={`p-4 rounded-lg border text-sm ${styles}`}>
      {title && <div className="font-semibold mb-1">{title}</div>}
      <div className="opacity-90">{children}</div>
    </div>
  );
}

// ── EmptyState ──

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-12 h-12 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
        <svg aria-hidden="true" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <div className="text-sm font-semibold text-gray-700">{title}</div>
      {description && <div className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ── PageHeader ──

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ── Modal ──

/**
 * Accessible modal dialog.
 *
 * - Wraps content in role="dialog" + aria-modal="true" so AT users hear it
 *   announced as a modal.
 * - On open: locks body scroll, captures the currently-focused element, and
 *   moves focus to the first focusable element inside the dialog.
 * - While open: Tab and Shift+Tab cycle within the dialog (focus trap).
 * - Escape and backdrop click both close the dialog.
 * - On close: restores focus to the element that was focused at open.
 *
 * Not animated and not nested-modal-safe — both are deferred until we have
 * a use case. For the admin console workflows, this is sufficient.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const widthClass = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" }[size];
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Lock body scroll while the modal is open, restore on unmount/close.
  // This also prevents the page behind the backdrop from scrolling under
  // the user's cursor.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Capture previously-focused element on open, restore on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // After paint, move focus to the first focusable element inside the dialog.
    const focusables = getFocusables(dialogRef.current);
    (focusables[0] ?? dialogRef.current)?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, [open]);

  // Trap focus: Tab and Shift+Tab cycle within the dialog. Also handle
  // Escape here so users on assistive tech with the dialog focused still
  // get a way out.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = getFocusables(dialogRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-900/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`bg-white rounded-2xl border border-gray-100 shadow-2xl w-full ${widthClass} mt-[10vh] mb-8 outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 id={titleId} className="text-base font-semibold text-gray-900">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              aria-label="Close dialog"
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/**
 * Returns focusable elements inside `root` in tab order. Excludes elements
 * with negative tabIndex, disabled, or hidden via the standard `hidden`
 * attribute. Good enough for our dialogs — not a full polyfill.
 */
function getFocusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hidden && el.offsetParent !== null
  );
}

// ── Tabs ──

/**
 * Accessible tab list.
 *
 * - Renders role="tablist"; each tab is role="tab" with proper aria-selected
 *   and aria-controls. Callers must put the corresponding panel inside a
 *   <TabPanel> so aria-labelledby / aria-controls match up.
 * - Keyboard: Left/Right arrows move between tabs; Home/End jump to ends.
 *   Activation happens immediately on focus (manual activation is also fine
 *   here because tab panels are cheap to switch).
 *
 * The visual style stays out of the primitive — pass a `renderTab` function
 * if the surrounding page needs different chrome.
 */

export interface TabDef<Id extends string = string> {
  id: Id;
  label: string;
}

export function Tabs<Id extends string>({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: TabDef<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  className?: string;
}) {
  const refs = useRef<Map<Id, HTMLButtonElement>>(new Map());

  const focusTab = (id: Id) => {
    refs.current.get(id)?.focus();
    onChange(id);
  };

  const onKeyDown = (e: ReactKeyboardEvent, idx: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTab(tabs[(idx + 1) % tabs.length].id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTab(tabs[(idx - 1 + tabs.length) % tabs.length].id);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(tabs[0].id);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(tabs[tabs.length - 1].id);
    }
  };

  return (
    <div role="tablist" className={`border-b border-gray-200 flex gap-1 ${className}`}>
      {tabs.map((t, idx) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              if (el) refs.current.set(t.id, el);
              else refs.current.delete(t.id);
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1 rounded-t ${
              isActive
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Panel companion to <Tabs>. Sets role="tabpanel" + correct aria-labelledby/id. */
export function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={!active}
    >
      {active && children}
    </div>
  );
}

// ── ConfirmModal ──

/**
 * Yes/no confirmation dialog. Replaces window.confirm(), which is
 * synchronous, blocks the event loop, can't be styled, and can't be made
 * keyboard-accessible the way we want.
 *
 * Renders inside Modal so it inherits the focus trap, Escape-to-close,
 * scroll lock, and aria-labelledby wiring for free. The Confirm button
 * receives focus on open so Enter triggers the destructive action — but
 * Escape still cancels.
 *
 * `tone="danger"` colours the confirm button rose; otherwise indigo.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  onConfirm,
  onCancel,
  loading = false,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button after the Modal's own focus management runs.
  // The Modal moves focus to the first focusable element on open; for a
  // confirm dialog we want focus on the action, not the close X.
  useEffect(() => {
    if (!open) return;
    // Small timeout so Modal's own focus assignment happens first.
    const t = setTimeout(() => confirmRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="text-sm text-gray-700 mb-6">{message}</div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          ref={confirmRef}
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// ── PromptModal ──

/**
 * Single-line text-input prompt dialog. Replaces window.prompt(). The
 * pattern is the same as ConfirmModal: it composes Modal so it gets focus
 * trap / Escape / scroll lock automatically.
 *
 * Returns the entered value to onSubmit; an empty string still counts as
 * a submission so callers can decide how to treat empties.
 */
export function PromptModal({
  open,
  title,
  message,
  placeholder,
  initialValue = "",
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  onSubmit,
  onCancel,
  loading = false,
  inputType = "text",
  inputMode,
  validator,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  loading?: boolean;
  inputType?: "text" | "number";
  inputMode?: "text" | "decimal" | "numeric";
  /** Returns a string error message to display, or null when valid. */
  validator?: (value: string) => string | null;
}) {
  const [value, setValue] = useState(initialValue);

  // Reset the field whenever the modal reopens; otherwise the previous
  // submission's text would persist into the next invocation.
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const error = validator ? validator(value) : null;

  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (error) return;
          onSubmit(value);
        }}
      >
        {message && <div className="text-sm text-gray-700 mb-4">{message}</div>}
        <FormInput
          label=""
          value={value}
          onChange={setValue}
          placeholder={placeholder}
          autoFocus
          type={inputType}
          inputMode={inputMode}
          error={value.length > 0 ? error ?? undefined : undefined}
        />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="submit" loading={loading} disabled={!!error}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

