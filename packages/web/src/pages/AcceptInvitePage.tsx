import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { InviteContext, AcceptInviteResponse } from "../lib/types";
import { AuthShell } from "../components/AuthShell";
import { Button, FormInput, Alert, Spinner } from "../components/ui";

/**
 * Invite Accept — public page reached via /invite/:token.
 *
 * Flow:
 *   1. GET /api/invites/:token  → resolves inviter, email, BU, optional role
 *   2. User fills in password (and optionally edits pre-filled name)
 *   3. POST /api/invites/:token/accept  → creates account, starts MFA setup
 *   4. Navigate to /login/mfa-setup with the returned QR — reusing the same
 *      screen the signup path uses.
 *
 * 404 → "Invitation not found"
 * 410 → "Expired" or "Already accepted"
 */

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [context, setContext] = useState<InviteContext | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Resolve token on mount.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .get<InviteContext>(`/api/invites/${encodeURIComponent(token)}`)
      .then((res) => {
        if (cancelled) return;
        setContext(res);
        setName(res.name ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          setLoadError({ status: err.status, message: err.message });
        } else {
          setLoadError({ status: 0, message: "Could not load invitation" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const canSubmit =
    context !== null &&
    name.trim().length >= 1 &&
    password.length >= 12 &&
    password === confirmPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<AcceptInviteResponse>(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        { name, password }
      );
      navigate("/login/mfa-setup", {
        state: { mfaSetup: res.mfaSetup, from: "/dashboard" },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept invitation");
      setSubmitting(false);
    }
  };

  // ── Rendering states ──

  if (loadError) {
    const isExpired = loadError.status === 410;
    return (
      <AuthShell>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          {isExpired ? "Invitation unavailable" : "Invitation not found"}
        </h1>
        <p className="text-sm text-gray-500 mb-6">{loadError.message}</p>
        <div className="flex gap-3">
          <Link to="/login" className="flex-1">
            <Button variant="secondary" className="w-full">
              Sign in
            </Button>
          </Link>
          <Link to="/signup" className="flex-1">
            <Button className="w-full">Sign up</Button>
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (!context) {
    return (
      <AuthShell>
        <div className="flex flex-col items-center py-8 gap-3 text-gray-400">
          <Spinner size="md" color="indigo" />
          <div className="text-sm">Loading your invitation…</div>
        </div>
      </AuthShell>
    );
  }

  const banner = (
    <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
      <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1">
        You&apos;ve been invited
      </div>
      <div className="text-sm text-indigo-800">
        <span className="font-semibold">{context.invitedBy.name}</span> invited you to join Quanta
        on behalf of <span className="font-semibold">{context.bu.name}</span>
        {context.projectRole && <> as a <span className="font-semibold">{context.projectRole}</span></>}.
      </div>
    </div>
  );

  return (
    <AuthShell banner={banner}>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Accept your invitation</h1>
      <p className="text-sm text-gray-500 mb-6">
        Choose a password for <span className="font-medium text-gray-700">{context.email}</span>.
      </p>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <form onSubmit={submit}>
        <FormInput label="Email" value={context.email} onChange={() => {}} disabled />
        <FormInput
          label="Your name"
          value={name}
          onChange={setName}
          placeholder="Jane Doe"
          autoComplete="name"
          autoFocus
          required
        />
        <FormInput
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="at least 12 characters"
          autoComplete="new-password"
          hint="Minimum 12 characters."
          required
        />
        <FormInput
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="re-enter password"
          autoComplete="new-password"
          error={
            confirmPassword.length > 0 && password !== confirmPassword
              ? "Passwords don't match"
              : undefined
          }
          required
        />
        <Button type="submit" loading={submitting} disabled={!canSubmit} className="w-full mt-2">
          Create account and continue
        </Button>
      </form>

      <div className="mt-6 text-center text-xs text-gray-400">
        Invitation expires {new Date(context.expiresAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </div>
    </AuthShell>
  );
}
