import { useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { MfaVerifyResponse } from "../lib/types";
import { AuthShell } from "../components/AuthShell";
import { Button, FormInput, Alert } from "../components/ui";

/**
 * First-time TOTP enrollment. Reached from:
 *   - /login → mfa_setup_required (user never verified)
 *   - /signup completion (new account)
 *   - /invite/:token accept (new account from invite)
 *
 * Expects navigation state { mfaSetup: { qrUri, manualKey }, from?: string }.
 * The API already has mfaPending set in the session; we verify the user's
 * first code and then navigate to the dashboard.
 *
 * QR rendering strategy: we use the free qr-server.com image endpoint so we
 * don't need to ship a local qrcode library to the bundle. Same origin-less
 * approach every dev tool uses.
 */

interface LocationState {
  mfaSetup?: { qrUri: string; manualKey: string };
  from?: string;
}

export function MfaSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const state = (location.state as LocationState | null) ?? null;

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If the user landed here without the setup payload (e.g. hard refresh),
  // send them back to login — the state only lives in navigation.
  if (!state?.mfaSetup) {
    navigate("/login", { replace: true });
    return null;
  }

  const { qrUri, manualKey } = state.mfaSetup;

  const qrImageSrc = useMemo(
    () =>
      `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(
        qrUri
      )}`,
    [qrUri]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.post<MfaVerifyResponse>("/api/auth/mfa/verify", { code });
      await refresh();
      navigate(state.from ?? "/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Set up two-factor auth</h1>
      <p className="text-sm text-gray-500 mb-6">
        Scan this QR with an authenticator app (Google Authenticator, 1Password, Authy), then enter
        the 6-digit code to finish.
      </p>

      <div className="bg-gray-50 rounded-xl p-5 mb-4 flex flex-col items-center">
        <img
          src={qrImageSrc}
          alt="Scan this QR code"
          className="w-52 h-52 rounded-lg bg-white p-2"
        />
        <div className="mt-4 text-xs text-gray-400 text-center">
          Can&apos;t scan? Enter this key manually:
        </div>
        <code className="mt-1 text-xs font-mono text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 select-all">
          {manualKey}
        </code>
      </div>

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
          Complete setup
        </Button>
      </form>
    </AuthShell>
  );
}
