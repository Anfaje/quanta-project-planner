import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { LoginResponse, MfaVerifyResponse } from "../lib/types";
import { AuthShell } from "../components/AuthShell";
import { Button, FormInput, Alert } from "../components/ui";

/**
 * Login flow is two-step:
 *   1. POST /api/auth/login  with {email, password}
 *      → 200 { status: "mfa_required" }  — user has set up TOTP
 *      → 200 { status: "mfa_setup_required", mfaSetup: { qrUri, manualKey } }
 *   2. Based on status, navigate to /login/mfa or /login/mfa-setup.
 *
 * The session cookie is already set after step 1 with mfaPending=true; the
 * MFA pages pick up from there.
 */

interface LocationState {
  from?: string;
  notice?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;
  const { refresh } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<LoginResponse>("/api/auth/login", { email, password });
      // Pass the return-to path through navigation state so the MFA step
      // knows where to send the user after success.
      const from = state?.from;
      if (res.status === "mfa_required") {
        navigate("/login/mfa", { state: { from } });
      } else if (res.status === "mfa_setup_required") {
        navigate("/login/mfa-setup", {
          state: { mfaSetup: res.mfaSetup, from },
        });
      } else {
        // status === "authenticated" — MFA disabled. Refresh the /api/me cache
        // before navigating so ProtectedRoute sees the authenticated user
        // instead of the stale null and doesn't bounce straight back to /login.
        await refresh();
        navigate(from ?? "/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Welcome back</h1>
      <p className="text-sm text-gray-500 mb-6">Sign in to continue to Quanta.</p>

      {state?.notice && (
        <div className="mb-4">
          <Alert tone="emerald">{state.notice}</Alert>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <form onSubmit={submit}>
        <FormInput
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@trifork.com"
          autoFocus
          required
        />
        <FormInput
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••••••"
          required
        />
        <div className="text-right -mt-1">
          <Link
            to="/forgot-password"
            className="text-xs text-gray-500 hover:text-indigo-600"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" loading={submitting} className="w-full mt-2">
          Sign in
        </Button>
      </form>

    </AuthShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// MFA Verify — post-password TOTP code entry
// ═══════════════════════════════════════════════════════════════

export function MfaVerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const state = (location.state as LocationState | null) ?? null;

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Code must be 6 digits");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post<MfaVerifyResponse>("/api/auth/mfa/verify", { code });
      await refresh(); // populate /api/me cache before the protected route check
      navigate(state?.from ?? "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Two-factor authentication</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enter the 6-digit code from your authenticator app.
      </p>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <form onSubmit={submit}>
        <FormInput
          label="Verification code"
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          required
        />
        <Button type="submit" loading={submitting} className="w-full mt-2">
          Verify and continue
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-500">
        <button
          type="button"
          onClick={() => navigate("/login", { replace: true })}
          className="text-indigo-600 hover:text-indigo-700 font-medium"
        >
          Cancel and sign in again
        </button>
      </div>
    </AuthShell>
  );
}
