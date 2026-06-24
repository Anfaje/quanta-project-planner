// A small fixed badge that marks the staging deployment so alpha testers
// always know they're not on production. It renders only when served from the
// staging host, so it never shows in production or in tests (jsdom runs on
// localhost). Purely client-side — no build flag or env plumbing needed.
export function StagingBanner() {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  const isStaging = host.startsWith("quanta-web-staging") || host.includes("-staging.");
  if (!isStaging) return null;

  return (
    <div
      className="fixed bottom-3 right-3 z-50 select-none rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white shadow-lg"
      title="Staging environment — data here is for alpha testing and may be reset"
    >
      Staging
    </div>
  );
}
