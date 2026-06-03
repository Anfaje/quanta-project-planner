# Security

This document captures the current security posture of Quanta. It is honest about both the defenses in place and the gaps remaining. It will be revisited each drop as the surface area changes.

## Reporting a vulnerability

Quanta is pre-release software. Please report suspected vulnerabilities privately:

- Open a private security advisory on GitHub (preferred), or
- Email the maintainers directly. Do not file public issues for security reports.

Include reproduction steps, the commit hash you tested against, and (if exploitation is non-obvious) a proof-of-concept. We aim to triage within five business days.

## Threat model

Quanta is a project resource estimation and time-tracking platform intended to be deployed inside an organisation, not as a public product. The expected deployment model is:

- Behind an organisational SSO eventually (TBD; for now, password + TOTP)
- Reachable from corporate networks and trusted laptops
- Storing project plans, hour ledgers, and financial figures (bill rates, cost rates, margin) that are considered sensitive at the row level but not regulated PHI / PCI data

Threats we explicitly defend against:

- **Account compromise via credential stuffing or weak passwords** — login is gated by mandatory TOTP; the password-reset flow issues short-lived (1h) single-use tokens and never reveals whether an email has an account
- **Privilege escalation between roles** — every privileged action is enforced server-side by the permission resolver, regardless of UI gating
- **Financial data leakage to unauthorised roles** — every API response that includes money fields passes through the financial serialiser, which strips columns based on the caller's role and project scope
- **Cross-tenant data leakage between BUs** — project list, assignments, and hour grids are scoped server-side to the caller's primary BU + shared-with BUs + AA-override
- **Session hijack via XSS** — session cookie is HttpOnly so JavaScript cannot read it
- **CSRF** — session cookie is SameSite=strict so it isn't sent on cross-origin requests
- **Bruteforce on auth and invite endpoints** — both are rate-limited to 10 attempts per 15-minute window per IP

Threats we do not yet defend against, and accept for now:

- A malicious AA (super-admin) acting in bad faith — there is no separation of duties on AA actions yet
- Compromise of the host machine running the API process — the database and Redis are reachable from there
- Physical access to a logged-in workstation — there is no per-action confirmation
- Denial-of-service at scale — there is no global rate limit, no CAPTCHA, no WAF in front of the API

## Defenses currently in place

### Authentication

- Passwords stored with `bcrypt` at cost factor 12
- Mandatory TOTP (RFC 6238) — every account must complete MFA setup before being usable
- TOTP secret encrypted at rest with AES-256-GCM, keyed off the `TOTP_ENCRYPTION_KEY` env var
- Session ID stored only as an HttpOnly + SameSite=strict cookie; in production the `secure` flag is set so it never leaves TLS
- 8-hour absolute session lifetime; sessions are bound to a Redis store and revocable
- Domain whitelist for self-signup: only email addresses whose domain is in the `DomainWhitelist` table can register
- Invite tokens are 32 random bytes encoded base64url, single-use, and expire after 7 days

### Authorisation

- Single source of truth for permission checks: `permissions.ts`, exercised by 42 unit tests
- The permission resolver computes a capability set per (user, project) tuple, so a PM cannot edit hours on a project they're not assigned to, even if they're a PM elsewhere
- The IC role is restricted server-side to editing only their own assignment rows on unlocked weeks
- Week-lock state is a hard guard: locked weeks reject any hour write at the API layer, regardless of role
- The `financialSerializer` strips fee, cost, rate, and margin fields from response payloads based on the caller's role and project scope; the same serializer is used for JSON responses and CSV/PDF exports so a privilege check can't be bypassed by switching format

### Input validation

- Every request body is parsed with Zod schemas (see `packages/api/src/utils/validation.ts`)
- Schemas enforce bounds (hours 0-168, week index 0-520, percentages 0-1, etc.) before any DB write
- Prisma is the only data-access layer, eliminating SQL injection by construction
- The web client never builds URLs from untrusted input; user-supplied IDs are sent as `params` to Prisma

### Transport and headers

- `helmet` is applied to every API response, including its default `X-Frame-Options: DENY`, `Strict-Transport-Security`, and `X-Content-Type-Options: nosniff`
- CORS allows only the configured `WEB_URL` origin (with `credentials: true`); production deploys must set this correctly
- The API and the SPA are served from the same origin in production, so cross-origin requests are not part of the normal flow

### Rate limiting

- `/api/auth/*` and `/api/invites/*` are limited to 10 requests per 15-minute window per IP via `express-rate-limit`
- Other routes are not yet rate-limited; see "Known gaps" below

### Audit trail

- Every role change, BU change, account change, hour edit, week lock/unlock, and project lifecycle transition is recorded in `AuditLog` with the actor's user id, the entity touched, the field, old value, and new value
- The platform_admin dashboard surface exposes the most recent audit entries to AA users

### Frontend XSS surface

- React's default escaping handles all rendered text; we audit every `dangerouslySetInnerHTML` usage at code-review time
- As of Drop 6b, the codebase has zero `dangerouslySetInnerHTML` usages (the one in `FinancialsPanel`'s `SectionTitle` has been removed)
- No `innerHTML`, `outerHTML`, or `document.write` calls in the web package
- The session cookie cannot be read by JavaScript even if an XSS were achieved

## Known gaps

These are accepted for now and tracked for future drops:

- **No Content-Security-Policy** — Helmet's default CSP is permissive. A strict CSP forbidding inline scripts and remote sources should be added when we have a stable asset pipeline.
- **No global rate limit** — Only auth and invite routes are limited. A modest global limit (e.g. 600 req/15min per IP) would mitigate brute-force enumeration on project IDs.
- **No CAPTCHA on signup / invite accept** — A determined attacker could automate signups against any whitelisted domain. Domain whitelisting limits the blast radius for now.
- **No SMTP-delivered invites** — Invite tokens are currently returned in the admin `POST /users/invite` response, on the assumption that the inviter shares the link out-of-band. When SMTP is wired up the token should never leave the server.
- **Reset-token delivery / hardening** — the forgot-password flow exists, but until SMTP is wired the reset link is returned in the API response (dev mode) rather than emailed; reset tokens are also stored raw (like invite tokens) rather than hashed at rest. Both are follow-ups before production.
- **No SSO / SAML / OIDC** — Planned but not in scope.
- **No automated dependency scanning in CI** — The project's CI/CD pipeline ships in Drop 5; `npm audit` will be wired up there.
- **No professional pen test** — A third-party penetration test should run against the Drop 6c build before any non-trivial production deployment.
- **No focus indicator audit on third-party charts** — Recharts elements are not part of the keyboard-navigable surface today.
- **No screen-reader test sweep** — The a11y work in Drop 6b targets the highest-impact issues based on code review. A full audit with NVDA / JAWS / VoiceOver is deferred to Drop 6c.

## Drop-by-drop security log

- **Drop 2** — Established auth (password + TOTP), session management, permission resolver, financial serialiser, audit log, domain whitelist
- **Drop 3** — Server-side week-lock enforcement on hour writes; financial field stripping extended to CSV / PDF exports
- **Drop 4a** — Public invite-accept endpoint added with 7-day token expiry, 32-byte token, rate limiting shared with `/api/auth`; supersedes-old-invites logic to prevent token reuse
- **Drop 6a** — 47 frontend tests pinning down formatter, fetch wrapper, auth flow, dashboard, hours grid, and wizard behaviour; tests caught and fixed real label-association a11y bugs
- **Drop 6b** — Removed last `dangerouslySetInnerHTML` from the codebase; Modal focus trap and ARIA wiring; form inputs now expose `aria-invalid` + `aria-describedby`; tab navigation surfaces full keyboard support; added 13 a11y tests as regression guard; this document
