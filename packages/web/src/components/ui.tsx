/**
 * Shared UI primitives.
 *
 * Flat component set — no Radix, no headless-ui, just Tailwind classes. If we
 * need Combobox / Dialog later we reach for a proper library, but for now
 * the prototypes get by with native HTML + our own styling.
 */

import { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

// ── Button ──

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  size?: "sm" | "md";
}

export function Button({
  variant = "primary",
  loading,
  size = "md",
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
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
    <button className={`${base} ${sz} ${styles} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size="xs" color={variant === "primary" || variant === "danger" ? "white" : "gray"} />}
      {children}
    </button>
  );
}

// ── Spinner ──

export function Spinner({
  size = "sm",
  color = "gray",
}: {
  size?: "xs" | "sm" | "md" | "lg";
  color?: "gray" | "white" | "indigo";
}) {
  const s = { xs: "w-3 h-3", sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" }[size];
  const c = { gray: "text-gray-400", white: "text-white", indigo: "text-indigo-500" }[color];
  return (
    <svg className={`${s} ${c} animate-spin`} fill="none" viewBox="0 0 24 24">
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

export function FormInput({ label, value, onChange, error, hint, type = "text", ...rest }: FormInputProps) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none transition-all ${
          error
            ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-50"
            : "border-gray-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
        } disabled:bg-gray-50 disabled:text-gray-500`}
        {...rest}
      />
      {error && (
        <div className="text-xs text-rose-500 mt-1 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
          </svg>
          {error}
        </div>
      )}
      {hint && !error && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
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

export function FormTextarea({ label, value, onChange, error, hint, rows = 3, ...rest }: FormTextareaProps) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>}
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2.5 text-sm border rounded-lg outline-none transition-all ${
          error
            ? "border-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-50"
            : "border-gray-200 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
        }`}
        {...rest}
      />
      {error && <div className="text-xs text-rose-500 mt-1">{error}</div>}
      {hint && !error && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
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
        <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
 * Minimal modal: centered panel over a dimmed backdrop, closed via backdrop
 * click or Escape. Not focus-trapped — good enough for Drop 4b, revisit in
 * Drop 6 for full a11y.
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-900/40 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className={`bg-white rounded-2xl border border-gray-100 shadow-2xl w-full ${widthClass} mt-[10vh] mb-8`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
