import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { Button, Badge } from "../components/ui";

/**
 * Post-signup welcome screen (TC 1.19 / 1.20).
 *
 * Reached once, immediately after first-time TOTP enrollment completes in
 * MfaSetupPage. Two variants, driven by navigation state:
 *
 *   { kind: "direct" }
 *     → "Welcome — you're an Individual Contributor. An admin can grant
 *        additional roles." CTA: Go to dashboard.
 *
 *   { kind: "invite", buName, role?, inviter? }
 *     → "Welcome — [inviter] added you to [BU] as [role]." CTA: Go to
 *        dashboard. (Invites are BU-scoped in this system, not tied to a
 *        single project, so the spec's "Go to project" resolves to the
 *        dashboard.)
 *
 * If there's no welcome state (someone hit /welcome directly), bounce to
 * the dashboard — the screen is purely a one-time greeting.
 */

type WelcomeState =
  | { kind: "direct" }
  | { kind: "invite"; buName?: string; role?: string | null; inviter?: string };

interface LocationState {
  welcome?: WelcomeState;
  dest?: string;
}

export function WelcomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;

  const welcome = state?.welcome;
  const dest = state?.dest ?? "/dashboard";

  if (!welcome) {
    return <Navigate to="/dashboard" replace />;
  }

  const isInvite = welcome.kind === "invite";

  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
          <svg
            className="w-7 h-7 text-indigo-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          {isInvite ? "You're all set" : "Welcome to Quanta"}
        </h1>

        <p className="text-sm text-gray-500 mb-5 max-w-sm">
          {isInvite ? (
            <>
              {welcome.inviter ? `${welcome.inviter} added you` : "You've been added"}
              {welcome.buName ? (
                <>
                  {" "}
                  to <span className="font-medium text-gray-700">{welcome.buName}</span>
                </>
              ) : null}
              {welcome.role ? (
                <>
                  {" "}
                  as a <span className="font-medium text-gray-700">{welcome.role}</span>
                </>
              ) : null}
              .
            </>
          ) : (
            <>Your account is ready. An admin can grant additional roles when you need them.</>
          )}
        </p>

        <div className="flex items-center gap-2 mb-7">
          <span className="text-xs text-gray-400">Your role:</span>
          <Badge tone="indigo">Individual Contributor</Badge>
        </div>

        <Button onClick={() => navigate(dest, { replace: true })} className="w-full">
          Go to dashboard
        </Button>
      </div>
    </AuthShell>
  );
}
