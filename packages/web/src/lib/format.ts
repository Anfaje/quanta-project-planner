/**
 * Display-only formatters. The API is already 2dp-rounded for money, so this
 * layer is concerned with locale presentation (commas, currency prefix,
 * signed percentages, etc.), not math.
 */

const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const fmtUsdCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(n: number | null | undefined, withCents = false): string {
  if (n == null) return "—";
  return (withCents ? fmtUsdCents : fmtUsd).format(n);
}

export function formatHours(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return `${n.toFixed(digits)}%`;
}

/** Signed percent with arrow prefix: "+12.3%" or "−4.5%". */
export function formatPercentSigned(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
}

/**
 * Short date — "Feb 3, 2026" for timelines; compact.
 */
export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Just month + day — "Feb 3". For chart labels. */
export function formatDateShort(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Human-friendly relative time for audit entries: "5 minutes ago",
 * "yesterday", "Mar 2". Deliberately loose — this isn't for legal timestamps.
 */
export function formatRelative(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(d);
}

/** "BRF-2026 · Meridian Corp" — unified project label. */
export function projectLabel(p: { projectCode: string; account: { name: string } }): string {
  return `${p.projectCode} · ${p.account.name}`;
}

/** For status pills — maps to Tailwind color classes. */
export function statusColorClasses(status: string): string {
  switch (status) {
    case "active": return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "on_hold": return "bg-amber-50 text-amber-700 border-amber-100";
    case "complete": return "bg-sky-50 text-sky-700 border-sky-100";
    case "archived": return "bg-gray-100 text-gray-600 border-gray-200";
    case "draft": return "bg-violet-50 text-violet-700 border-violet-100";
    default: return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

/** Humanise role codes for display. */
export function roleLabel(role: string): string {
  switch (role) {
    case "IC": return "Individual Contributor";
    case "PM": return "Project Manager";
    case "AC": return "Account Manager";
    case "BUL": return "Business Unit Leader";
    case "AA": return "Application Admin";
    default: return role;
  }
}
