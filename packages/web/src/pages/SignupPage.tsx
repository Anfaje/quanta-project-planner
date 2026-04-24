import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { RegisterResponse, DomainsResponse } from "../lib/types";
import { AuthShell } from "../components/AuthShell";
import { Button, FormInput, Alert, Spinner } from "../components/ui";

/**
 * Signup — domain-whitelisted. The allowed-domains list comes from
 * /api/auth/domains so the UI can give immediate feedback before hitting
 * /register. The server is still the source of truth; this is display.
 */

export function SignupPage() {
  const navigate = useNavigate();

  const [domains, setDomains] = useState<string[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<DomainsResponse>("/api/auth/domains")
      .then((res) => {
        if (!cancelled) setDomains(res.domains);
      })
      .catch(() => {
        if (!cancelled) setDomains([]); // fail-open for display; server still enforces
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const emailDomain = useMemo(() => {
    const parts = email.split("@");
    return parts.length === 2 ? parts[1].toLowerCase() : "";
  }, [email]);

  const domainAllowed = useMemo(() => {
    if (!domains || !emailDomain) return null;
    return domains.includes(emailDomain);
  }, [domains, emailDomain]);

  const canSubmit =
    email.includes("@") &&
    name.trim().length >= 1 &&
    password.length >= 12 &&
    domainAllowed !== false;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<RegisterResponse>("/api/auth/register", {
        email,
        name,
        password,
        projectRoles: [],
      });
      navigate("/login/mfa-setup", {
        state: { mfaSetup: res.mfaSetup, from: "/dashboard" },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const payload = err.details as { allowedDomains?: string[] } | undefined;
        if (err.status === 403 && payload?.allowedDomains) {
          setError(
            `This email domain isn't whitelisted. Allowed: ${payload.allowedDomains.join(", ")}`
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Registration failed");
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthShell>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Create your account</h1>
      <p className="text-sm text-gray-500 mb-6">
        Only email addresses from approved organisations may create accounts.
      </p>

      {error && (
        <div className="mb-4">
          <Alert tone="rose">{error}</Alert>
        </div>
      )}

      <form onSubmit={submit}>
        <FormInput
          label="Full name"
          value={name}
          onChange={setName}
          placeholder="Jane Doe"
          autoComplete="name"
          autoFocus
          required
        />
        <FormInput
          label="Work email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@trifork.com"
          autoComplete="email"
          error={domainAllowed === false ? "This email domain is not allowed" : undefined}
          hint={
            domainAllowed === true
              ? "Domain approved."
              : domains === null
              ? undefined
              : `Allowed: ${domains.join(", ")}`
          }
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
        <Button type="submit" loading={submitting} disabled={!canSubmit} className="w-full mt-2">
          Create account
        </Button>
      </form>

      {domains === null && (
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-4">
          <Spinner size="xs" /> Loading allowed domains…
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
          Sign in
        </Link>
      </div>
    </AuthShell>
  );
}
