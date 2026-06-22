import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { RegisterResponse, DomainsResponse } from "../lib/types";
import { AuthShell } from "../components/AuthShell";
import { Button, FormInput, Alert, Spinner } from "../components/ui";
import { useAuth } from "../context/AuthContext";

/**
 * Signup — domain-whitelisted. The allowed-domains list comes from
 * /api/auth/domains so the UI can give immediate feedback before hitting
 * /register. The server is still the source of truth; this is display.
 */

// Suggested project roles offered as multi-select pills at signup
// (TC 1.8/1.14). project_roles is free-form text[] in the schema, so this
// is a curated starter list matching the seed vocabulary — a user can hold
// any of these; an AA can add more later. Selecting none is allowed (TC 1.15).
const PROJECT_ROLE_OPTIONS = [
  "iOS Dev",
  "Android Dev",
  "Backend",
  "Frontend",
  "Full Stack",
  "Designer",
  "UX Lead",
  "ML Engineer",
  "3D Dev",
  "DevOps",
  "QA Lead",
];

export function SignupPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [domains, setDomains] = useState<string[] | null>(null);
  const [domainsUnavailable, setDomainsUnavailable] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [projectRoles, setProjectRoles] = useState<string[]>([]);
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
        // Couldn't load the whitelist (network error, or the endpoint was
        // rate-limited). Don't block signup client-side — the server enforces
        // the whitelist on submit and returns an authoritative 403 listing the
        // allowed domains. (Setting [] here instead would make every domain
        // appear disallowed.)
        if (!cancelled) setDomainsUnavailable(true);
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
    if (domainsUnavailable) return null; // can't validate locally; let the server decide
    if (!domains || !emailDomain) return null;
    return domains.includes(emailDomain);
  }, [domains, emailDomain, domainsUnavailable]);

  const toggleRole = (role: string) =>
    setProjectRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );

  const canSubmit =
    email.includes("@") &&
    name.trim().length >= 1 &&
    password.length >= 8 &&
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
        projectRoles,
      });
      if (res.status === "authenticated") {
        // MFA disabled — account created and logged in already. Refresh the
        // /api/me cache before navigating so ProtectedRoute doesn't bounce us
        // back to /login on the stale (pre-signup) null.
        await refresh();
        navigate("/dashboard", { replace: true, state: { welcome: { kind: "direct" } } });
      } else {
        navigate("/login/mfa-setup", {
          state: { mfaSetup: res.mfaSetup, from: "/dashboard", welcome: { kind: "direct" } },
        });
      }
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
          placeholder="at least 8 characters"
          autoComplete="new-password"
          hint="Minimum 8 characters."
          required
        />

        <fieldset className="mt-4">
          <legend className="block text-sm font-medium text-gray-700 mb-1.5">
            Project roles <span className="font-normal text-gray-400">(optional)</span>
          </legend>
          <p className="text-xs text-gray-500 mb-2">
            Pick the skills you'd be assigned for. You can change these later.
          </p>
          <div className="flex flex-wrap gap-2">
            {PROJECT_ROLE_OPTIONS.map((role) => {
              const selected = projectRoles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    selected
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-gray-300 text-gray-600 hover:border-indigo-300"
                  }`}
                >
                  {selected && (
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.1 3.1 6.8-6.8a1 1 0 011.4 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {role}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Button type="submit" loading={submitting} disabled={!canSubmit} className="w-full mt-2">
          Create account
        </Button>
      </form>

      {domains === null && !domainsUnavailable && (
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
