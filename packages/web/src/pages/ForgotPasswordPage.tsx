import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { AuthShell } from "../components/AuthShell";
import { Button, FormInput, Alert } from "../components/ui";

/**
 * Request a password reset (TC 1.5).
 *
 * The API always responds 200 with a generic message (no account
 * enumeration). Until SMTP is wired up it also returns a dev-mode resetUrl,
 * which we surface here so the flow is usable end-to-end without email.
 */

interface ForgotResponse {
  message: string;
  resetUrl?: string;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ForgotResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<ForgotResponse>("/api/auth/forgot-password", { email });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <AuthShell>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Check your email</h1>
        <p className="text-sm text-gray-500 mb-5">{result.message}</p>

        {result.resetUrl && (
          <Alert tone="amber">
            <div className="text-sm">
              <div className="font-medium mb-1">Dev mode</div>
              Email isn&apos;t configured yet, so here&apos;s your reset link:
              <div className="mt-2">
                <Link
                  to={result.resetUrl}
                  className="text-indigo-600 hover:text-indigo-700 font-medium break-all"
                >
                  {result.resetUrl}
                </Link>
              </div>
            </div>
          </Alert>
        )}

        <div className="mt-6 text-center text-sm text-gray-500">
          <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Reset your password</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enter your work email and we&apos;ll send a link to reset your password.
      </p>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <FormInput
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          autoComplete="email"
          required
        />
        <Button type="submit" loading={submitting} disabled={!email.includes("@")} className="w-full">
          Send reset link
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
