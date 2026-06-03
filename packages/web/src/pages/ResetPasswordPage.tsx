import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { AuthShell } from "../components/AuthShell";
import { Button, FormInput, Alert } from "../components/ui";

/**
 * Complete a password reset (TC 1.5). The token comes from the URL
 * (/reset-password/:token). On success we send the user to the login page
 * with a success banner — they still authenticate with their existing TOTP.
 */

export function ResetPasswordPage() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 8 && password === confirm && token.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      navigate("/login", {
        replace: true,
        state: { notice: "Password updated. Sign in with your new password." },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset password");
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Choose a new password</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enter a new password for your account. You&apos;ll still sign in with your authenticator app.
      </p>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <FormInput
          label="New password"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="at least 8 characters"
          autoComplete="new-password"
          hint="Minimum 8 characters."
          required
        />
        <FormInput
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="re-enter password"
          autoComplete="new-password"
          error={mismatch ? "Passwords don't match" : undefined}
          required
        />
        <Button type="submit" loading={submitting} disabled={!canSubmit} className="w-full">
          Update password
        </Button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-500">
        <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
