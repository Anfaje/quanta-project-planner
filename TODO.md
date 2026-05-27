# Quanta — TODO

Outstanding work captured through Drop 6c. Items are grouped by category; within each category they're roughly ordered by impact. This file is a parking lot, not a sprint plan — pull from it when you have time, don't try to do it all at once.

**Repository:** https://github.com/Anfaje/quanta-project-planner

**Snapshot at time of writing:** 164 tests passing (61 API unit + ~33 API integration + 70 web), TypeScript clean across both packages. Web codebase has zero `dangerouslySetInnerHTML`, zero `window.confirm` / `window.prompt` calls, full focus traps + ARIA wiring on modals and tabs, and `SECURITY.md` capturing the threat model.

---

## Immediate / unblocked

- [ ] **Push the Drop 6c commit.** Local at `79f7efc`, ahead of `origin/main` (`868897e`). The GitHub token used through Drop 6b was rotated mid-session; needs a fresh token or a manual push from a workstation with credentials. Once pushed, this TODO commit should follow.

---

## Testing — major gaps

These were surfaced by the Drop 6c audit. The tier ranking reflects relative impact on production confidence, not effort.

### Tier 1 — must address before any non-trivial deploy

- [x] ~~**HTTP integration tests for the API.**~~ Shipped in Drop 6d. ~33 tests across auth / projects / hours / admin / invites / dashboard / exports under `packages/api/src/__integration__/`. Run via `npm run test:integration` from `packages/api/`.
- [ ] **Database tests against real Postgres beyond what 6d covers.** Schema constraint behavior (FK cascades on Project delete, unique on email + projectCode, etc.), migration upgrade paths from each historical schema, complex query helpers like `buildProjectAccessFilter` exercised at boundary conditions.
- [ ] **End-to-end browser tests.** Playwright. At minimum: IC logs hours; PM creates a project, locks a week, unlocks with reason. Drop 6d gets us the API contract; this would close the UI-through-API loop.

### Tier 2 — fill in unit / component coverage

- [ ] Route-handler tests for `auth.ts`, `projects.ts` (incl. validation edge cases: overlapping assignments, malformed dates, contingency bounds), `admin.ts`, `invites.ts`, `dashboard.ts`, `exports.ts` (CSV escaping when project names contain commas/quotes, PDF generation runs, financial-field stripping on export for unauthorised viewers)
- [ ] Frontend page tests for: `SignupPage`, `AcceptInvitePage`, `MfaSetupPage`, `ProjectsListPage`, `ProjectDetailPage` (tab switching + export buttons), `AdminConsolePage` (each tab and its modals — Users/BUs/Accounts/Domains), `FinancialsPanel`, `BurnChartPanel`, `Layout` (role-conditional admin nav, user-menu outside-click), `ProtectedRoute` (loading state, `state.from` preservation), `AuthContext` (login → `/me` refetch → logout cache-clear)
- [ ] Strengthen existing thin tests:
  - Wizard end-to-end submit currently sends zero planned hours — add a variant that asserts the `plannedHours` payload shape
  - HoursGridPanel save test asserts one pending cell — add a multi-cell batch test
  - DashboardPage role-conditional rendering coverage is shallow
  - LoginPage MFA setup branch verifies navigation but not that the QR payload survives the state hop

### Tier 3 — categorically missing test types

- [ ] Automated a11y audits via axe-core or pa11y over rendered pages (Drop 6b shipped manual code review only)
- [ ] Contract tests between API and Web — frontend types in `lib/types.ts` are hand-mirrored; a shared OpenAPI or shared Zod schema would close this
- [ ] Property-based tests on financial math (invariants like "EAC ≥ max(planned, actual)" or "Σ per-week fee deltas = total fee")
- [ ] Production-build smoke test — the `vite build` artifact (minified, code-split) is never executed in tests
- [ ] Load / perf tests at scale (500 projects × 1000 users × 50K hour entries)
- [ ] Browser cross-compatibility (happy-dom only today; real Chrome / Firefox / Safari behaviour unverified)
- [ ] Migration upgrade-path tests
- [ ] Audit-log integration tests — verify each mutating route actually calls `logChange` with the right entityType / field / values
- [ ] Visual regression / screenshot baselines

### Tier 4 — lower priority but real

- [ ] Race conditions on invite acceptance (parallel POSTs to `/accept`)
- [ ] Concurrent edits to the same hour cell from two browser tabs
- [ ] Session expiry behaviour after the 8-hour TTL
- [ ] Mobile viewport / responsive breakpoints
- [ ] i18n / locale (formatters are pinned to en-US)
- [ ] Time-zone handling (everything is treated as UTC today)

---

## Drop 5 — Infrastructure

Not started. Decisions to make before coding:

- [ ] Cloud target — AWS / GCP / Azure / Render / Fly?
- [ ] Container vs serverless?
- [ ] Database — managed Postgres (RDS / Cloud SQL / Supabase) or self-hosted?
- [ ] Redis — managed (ElastiCache / Upstash) or self?
- [ ] Secrets — Vault / AWS Secrets Manager / Doppler?
- [ ] CI — GitHub Actions assumed; needs build, lint, typecheck, both test suites, `npm audit`
- [ ] Deployment strategy — blue/green, rolling, or recreate?

Then:

- [ ] Terraform modules for the chosen provider
- [ ] CI workflow files in `.github/workflows/`
- [ ] Production-grade Dockerfiles for both packages (dev images exist via Docker Compose)
- [ ] Health-check endpoints — `/api/health` exists but needs a depth probe (db + redis reachable)
- [ ] Logging / monitoring (Sentry / Datadog / stdout → CloudWatch?)
- [ ] Backup strategy for Postgres + Redis sessions
- [ ] TLS / cert rotation
- [ ] CORS origin pinned to production `WEB_URL`

---

## Production-readiness gaps (from SECURITY.md)

Some will fold naturally into Drop 5 work.

- [ ] Strict Content-Security-Policy (Helmet defaults are permissive)
- [ ] Global rate limit beyond `/api/auth` and `/api/invites`
- [ ] CAPTCHA on signup / invite-accept
- [ ] SMTP-delivered invites (token currently returned in admin POST response)
- [ ] Password-reset flow
- [ ] SSO / SAML / OIDC
- [ ] `npm audit` wired into CI (folds into Drop 5)
- [ ] Third-party penetration test against a staging deployment
- [ ] Screen-reader test sweep (NVDA / JAWS / VoiceOver)

---

## Feature gaps deferred from earlier drops

- [ ] BU rename — `PATCH /api/admin/bus/:id` + UI (workaround today is deactivate + recreate)
- [ ] Account rename — same shape
- [ ] Invite-list UI in admin console (today the token is only visible at creation)
- [ ] Resend / revoke pending invites
- [ ] Account-manager assignment from the Accounts tab (today only via Users → AC role + account picker)
- [ ] Replace QR rendering from `api.qrserver.com` external service with a local library (privacy + offline)

---

## Polish

- [ ] Toast / notification system (currently inline `Alert` per page; consider a portal-based pattern)
- [ ] Loading skeletons rather than spinners on tables and cards
- [ ] Dedicated 404 / 500 pages on the React side (today `*` redirects to `/dashboard`)
- [ ] Colour-contrast audit on status pills and badges
- [ ] Decide on committing `package-lock.json` (currently always untracked — should be a deliberate repo decision)

---

When picking up an item, copy it into a git branch name and check it off here when shipped.
