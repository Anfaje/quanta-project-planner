# Quanta

**Project Estimates & Resource Tracking Platform**

Quanta replaces manual Google Sheet workflows with a structured, role-aware web application for project resource estimation and actuals tracking.

**Repository:** https://github.com/Anfaje/quanta-project-planner

**Project status:** see [`TODO.md`](TODO.md) for the parking lot of outstanding work. Security posture: [`SECURITY.md`](SECURITY.md). Local dev setup: [`SETUP.md`](SETUP.md).

## Documentation

All project documentation lives in the [`docs/`](docs/) directory:

| Document | Description |
|----------|-------------|
| [Project Plan](docs/Quanta_Project_Plan.docx) | 19-week phased delivery plan, team structure, milestones, risk register |
| [Reference Architecture](docs/Quanta_Reference_Architecture.docx) | Tech stack, data model, API design, multi-role RBAC, hosting strategy (AWS), NFRs |
| [Test Cases](docs/Quanta_Test_Cases.docx) | 212 test cases across 9 sections — auth, 5 roles, multi-role combos, wizard, edge cases |

### UI Prototypes

Interactive React prototypes in [`docs/prototypes/`](docs/prototypes/) — these can be rendered in any React environment or in [Claude Artifacts](https://claude.ai):

| Prototype | Flow |
|-----------|------|
| [Dashboard](docs/prototypes/Quanta_Dashboard_Prototype.jsx) | Adaptive multi-role dashboard with role toggles, burn chart, BUL health check, trajectory charts |
| [Hours Grid](docs/prototypes/Quanta_Hours_Grid_Prototype.jsx) | IC weekly timesheet with week navigation, locked/future states, fill-remaining |
| [Financial Views](docs/prototypes/Quanta_Financial_Views_Prototype.jsx) | BUL/AC financial detail with margin charts, cost donut, resource breakdown, drill-down |
| [Onboarding Wizard](docs/prototypes/Quanta_Wizard_Prototype.jsx) | 5-step project creation with conditional financial setup step |
| [Auth Flow](docs/prototypes/Quanta_Auth_Prototype.jsx) | Login, signup (domain-whitelisted), MFA, invite context, project role selection |
| [Admin Console](docs/prototypes/Quanta_Admin_Prototype.jsx) | AA user management, multi-role assignment, BU/Account/domain CRUD |

## Architecture

- **Frontend:** React 18 + TypeScript + Tailwind CSS + Recharts
- **Backend:** Node.js + Express + Prisma ORM
- **Database:** PostgreSQL 16
- **Cache:** Redis 7
- **Auth:** Email + password with TOTP MFA (domain-whitelisted signup)
- **Hosting:** AWS (ECS Fargate + RDS + ElastiCache + CloudFront + SES)

## Roles

Users hold any combination of five roles (permissions are additive):

| Role | Scope |
|------|-------|
| **IC** — Individual Contributor | Log own hours on assigned projects |
| **PM** — Project Manager | Create projects, manage team hours, view bill rates |
| **AC** — Account Manager | Full financials on assigned Accounts (crosses BU boundaries) |
| **BUL** — Business Unit Leader | Full financials and admin for their BU |
| **AA** — Application Admin | Platform-wide user and config management |

## Quick Start

```bash
# 1. Clone and copy env
git clone https://github.com/Anfaje/quanta-project-planner.git
cd quanta-project-planner
cp .env.example .env

# 2. Start infrastructure
docker-compose up -d postgres redis mailpit

# 3. Install dependencies
npm install

# 4. Run migrations + seed
cd packages/api
npx prisma migrate dev --name init
npm run db:seed
cd ../..

# 5. Start dev servers
npm run dev
```

- **API:** http://localhost:4000
- **Web:** http://localhost:5173
- **Mailpit:** http://localhost:8025 (email testing)
- **Health:** http://localhost:4000/api/health

### Seed Credentials

All users: password `quanta123`

| Email | Roles |
|-------|-------|
| sarah@trifork.com | AA + IC |
| sara@trifork.com | BUL + PM + IC |
| lena@trifork.com | AC + PM + IC |
| jonas@trifork.com | PM + IC |
| tom@spantree.com | PM + IC |
| kai@trifork.com | PM + IC |
| maya@trifork.com | IC |
| alex@trifork-na.com | IC |
| priya@trifork.com | IC |
| diego@trifork-na.com | IC |
| emma@spantree.com | IC |
| noor@trifork.com | IC |
| marco@trifork.com | IC (inactive) |

### Whitelisted Domains

`@trifork.com`, `@trifork-na.com`, `@spantree.com`

## Project Structure

```
quanta-project-planner/
├── docs/                    # Project documentation
│   ├── Quanta_Project_Plan.docx
│   ├── Quanta_Reference_Architecture.docx
│   ├── Quanta_Test_Cases.docx
│   └── prototypes/          # Interactive UI prototypes (JSX)
│       ├── Quanta_Dashboard_Prototype.jsx
│       ├── Quanta_Hours_Grid_Prototype.jsx
│       ├── Quanta_Financial_Views_Prototype.jsx
│       ├── Quanta_Wizard_Prototype.jsx
│       ├── Quanta_Auth_Prototype.jsx
│       └── Quanta_Admin_Prototype.jsx
├── packages/
│   ├── api/                 # Express API server
│   │   ├── prisma/          # Schema + migrations + seed
│   │   ├── src/
│   │   │   ├── middleware/   # Auth, RBAC, audit, serialiser
│   │   │   ├── routes/       # API route handlers
│   │   │   ├── services/     # Business logic
│   │   │   ├── lib/          # Prisma client, logger, permissions
│   │   │   └── index.ts      # Express entry point
│   │   └── Dockerfile
│   └── web/                 # React SPA
│       ├── src/
│       │   ├── components/  # Shared UI components
│       │   ├── pages/       # Route pages
│       │   ├── hooks/       # Custom hooks
│       │   └── lib/         # API client, utils
│       └── index.html
├── docker-compose.yml
├── .env.example
└── package.json             # Workspace root
```

## Build Drops

| Drop | Contents | Status |
|------|----------|--------|
| 1 | Foundation: scaffolding, Prisma schema, seed, Docker | ✅ |
| 2 | Auth + RBAC: login, MFA, domain whitelist, permission resolver | ✅ |
| 3 | Core API: projects, hours, assignments, dashboard, export | ✅ |
| 4a | Frontend Phase A: shared infra, auth, dashboard, projects, hours | ✅ |
| 4b | Frontend Phase B: wizard, admin console, financial drill-down | ✅ |
| 6a | Frontend tests: vitest + RTL, 60 tests across utilities, auth, dashboard, hours grid, wizard, and shared UI primitives | ✅ |
| 6b | A11y + security review: focus traps, aria audit, code-defense sweep, SECURITY.md | ✅ |
| 6c | Perf + UX polish: code-splitting, memoisation, replace window.confirm/window.prompt with proper dialogs | ✅ |
| 6d | API integration tests: Supertest + test Postgres, ~33 tests across auth / projects / hours / admin / invites / dashboard / exports | ✅ |
| 5  | Infrastructure: Terraform, CI/CD, deployment | — |

### Drop 3 highlights

Full project lifecycle now reachable over HTTP:

- **Projects** — `GET/POST/PATCH /api/projects`, scoped list by role, wizard create atomically populates all assignments and every (assignment × week) hour cell
- **Assignments** — add / update / remove resources; rates and roles tracked through the audit log
- **Hours grid** — `GET/PUT /api/projects/:id/hours` with row-level permissions (IC restricted to own rows, planned hours require PM/AC/BUL)
- **Week lock / unlock** — per `(project, week)` transactional flip, unlock takes an optional reason and every entry is audited
- **Fill-remaining** — one-click copy of planned→actual on non-locked, NULL cells
- **Burn chart** — `GET /api/projects/:id/burn` with cumulative planned / actual / EAC and optional fee / cost streams
- **Adaptive dashboard** — `GET /api/dashboard` returns only the sections the caller's role union unlocks (IC → my\_hours; PM → project\_health; AC → account\_overview; BUL → bu\_health; AA → platform\_admin)
- **Exports** — `GET /api/projects/:id/export.csv` and `.pdf`, column visibility driven by the same financial serialiser as the JSON responses

### Drop 4a highlights (Phase A)

End-to-end frontend coverage for the main daily workflows. The app is usable for logging hours, viewing project burn, and managing invites:

- **Shared infrastructure** — typed `api` client (session cookies, `ApiError` with status + parsed details), `AuthContext` wrapping `useQuery('me')`, `ProtectedRoute` with return-to preservation, flat `Layout` shell with nav and user menu, and reusable UI primitives (Button, FormInput, Card, Badge, Spinner, Alert, EmptyState, PageHeader).
- **Auth surfaces** — `/login`, two-step MFA (`/login/mfa` verify, `/login/mfa-setup` first-time TOTP with QR), domain-whitelisted `/signup`, and full invite accept at `/invite/:token`.
- **Invite API** — new `UserInvite` model + routes: `GET /api/invites/:token` (public context lookup), `POST /api/invites/:token/accept` (atomic user create + MFA bootstrap), plus an updated `POST /api/admin/users/invite` that now persists the token with a 7-day expiry.
- **Adaptive dashboard** — consumes `/api/dashboard` and renders only the sections the caller's role union unlocks, preserving server-chosen priority order.
- **Projects list** (`/projects`) — scoped by role on the server, filterable by status (active / on_hold / complete / archived).
- **Project detail** (`/projects/:id`) — overview tab (metadata, summary financials, resources table), hours-grid tab (inline-editable planned/actual with pending-edit batching, week lock / unlock with reason prompt, fill-remaining), burn-chart tab (Recharts line chart for planned / actual / EAC hours).
- **Exports** — CSV and PDF download buttons on project detail wire to the existing `/export.csv` and `/export.pdf` endpoints.

Phase B remains to bring the project creation wizard, admin console (users / BUs / accounts / domains), and the financial drill-down view onto the frontend.

### Drop 4b highlights (Phase B)

The management surfaces are now wired up end-to-end. A BUL can onboard people through the admin console; a PM can launch a new project through the wizard; anyone with financial access can drill into cost and margin on a project:

- **Project creation wizard** (`/projects/new`) — five steps (basics → resources → planned hours → financial preview → review). Auto-generates project codes from the name, pulls accounts / BUs / users from the admin endpoints, validates each step before advancing, and submits to `POST /api/projects` with assignments + planned hours flattened. A `New project` button appears on the projects list for PM / BUL / AA users.
- **Admin console** (`/admin`) — tabbed console visible to BUL and AA. Users tab shows name, roles, BU, managed accounts, project count, and active status with inline deactivate / reactivate, a detail modal for editing roles / BU / financial access / managed accounts (AC role), and an invite modal that returns the generated accept URL until SMTP lands. Business units tab lists code / name / BUL / counts with create + activate / deactivate. Accounts tab mirrors that for clients. Domains tab inline-adds domains with live user count per whitelisted domain and a remove action.
- **Financials tab** on project detail — renders four headline metrics (quoted fee, fee burned, cost burned, margin with delta vs plan), a cumulative fee-vs-cost line chart with both planned and actual streams, a cost-by-resource donut with a legend, and a per-resource table of planned / actual fee / cost with margin badges. Falls back to a "Financials not visible" empty state for IC viewers.
- **Navigation** — Admin link appears in the top nav for BUL / AA only; mirror of the server-side tab visibility.

### Drop 6a highlights (Frontend tests)

The web package now has its own test suite, matching the rigor of the 61 API tests already in place. 47 tests across six files cover the critical paths:

- **Test infrastructure** — `vitest` + `@testing-library/react` + `@testing-library/user-event` + `happy-dom`. `vite.config.ts` is extended with a `test` block, a global setup file imports jest-dom matchers and registers RTL `cleanup`, and a `renderWithProviders` helper wraps in a fresh `QueryClient` + `MemoryRouter` (with optional `path`/`route` for parameterised pages) plus pre-seeded test users for IC / PM / AA.
- **Utility tests** — `format.test.ts` (23 tests) pins down money / hours / percent / date / status-color contracts; `api.test.ts` (7 tests) exercises the fetch wrapper through happy paths, JSON error parsing, 204 responses, fall-back to "HTTP N" when the body has no `error` field, and non-JSON content.
- **Auth flow** — `LoginPage.test.tsx` (5 tests) covers the mfa_required vs mfa_setup_required branches, error display, the input that strips non-digits and caps at 6 characters, and the sub-6-digit submission guard.
- **Dashboard** — `DashboardPage.test.tsx` (4 tests) asserts the greeting renders the IC's first name, my_hours rows show project name + week number, the page preserves API-chosen section order (rendering Platform before BU health even when both apply), and a rejected query surfaces the error alert.
- **Hours grid** — `HoursGridPanel.test.tsx` (4 tests) covers the rendered grid shape (one row per assignment, one column per week), inline-edit batching (typing into a cell increments the pending counter and shows the Discard button), the PUT payload shape when Save fires, and the POST to `/weeks/:week/lock` when Lock is clicked.
- **Project wizard** — `ProjectWizardPage.test.tsx` (4 tests) covers Continue gating until basics validates, navigating Continue / Back across step 1 ↔ step 2, adding a resource from the directory updating the team count, and an end-to-end run that posts the expected payload shape and navigates to the new project on success.

A11y bugs found and fixed along the way (pulled forward from Drop 6b):

- `FormInput` and `FormTextarea` weren't `htmlFor`-associating their labels with their inputs — fixed with a small id-generation helper.
- `ProjectWizardPage`'s bespoke `Field` component had the same issue — fixed using `React.useId` + `cloneElement` to inject an id into the labeled child.
- `MfaVerifyPage` and `MfaSetupPage` both had near-duplicate strings between page description and error message ("Enter the 6-digit code from your authenticator app" appearing in both) — error message changed to "Code must be 6 digits" so screen readers no longer see two identical sentences.

### Drop 6b highlights (A11y + security review)

The big-impact a11y and security issues are addressed. The codebase now has zero `dangerouslySetInnerHTML` usages, every modal traps focus and restores it on close, all forms wire `aria-invalid` and `aria-describedby` to their error/hint messages, and the tab navigation surfaces support full keyboard control:

- **Removed XSS vector** — `FinancialsPanel`'s `SectionTitle` was rendering titles through `dangerouslySetInnerHTML` to display an `&amp;` entity. That entire pathway is gone; the title now renders as a plain text node. Real risk if user-controlled titles ever flowed in.
- **Modal** — `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the title; focus moves to the first focusable element on open and is restored to the opener on close; Tab and Shift+Tab cycle within the dialog; Escape closes; body scroll is locked while open.
- **Form inputs** — `FormInput` / `FormTextarea` now use `useId` for stable, collision-free ids and expose `aria-invalid` when there's an error plus `aria-describedby` pointing at the rendered error or hint message. Screen-reader users now hear validation feedback when they focus a broken field.
- **New shared `Tabs` / `TabPanel` primitives** with `role="tablist"` / `role="tab"` / `role="tabpanel"`, proper `aria-selected` and `aria-controls` wiring, and full keyboard navigation: Left/Right arrows wrap between tabs, Home/End jump to first/last, only the active tab is in the natural tab order. `ProjectDetailPage` and `AdminConsolePage` migrated to use them.
- **Wizard step indicator** — rebuilt as a semantic `<ol>` with `aria-current="step"` on the active step and descriptive aria-labels like "Step 2 of 5: Resources (current)"; all decorative chrome marked `aria-hidden`.
- **Live regions** — the hours-grid toast announcing save / lock results is now `aria-live="polite" aria-atomic="true"` so screen readers hear the outcome of mutations.
- **Disclosure widgets** — the user-menu button and the `⋯` week-actions menu both expose `aria-haspopup="menu"` + `aria-expanded` reflecting open state, with the dropdowns using `role="menu"` / `role="menuitem"`.
- **Decorative SVGs** — every icon-only SVG (close X, search empty-state, error chevron, logo glyph, wizard tick) is now `aria-hidden="true"` so AT users don't hear them announced.
- **Disambiguated user-menu label** — was "Account menu for X", which collided with Quanta's domain concept of an Account. Now "User menu for X".
- **`SECURITY.md`** — new top-level document covering reporting policy, threat model, defenses currently in place (auth, authorisation, input validation, transport, rate limiting, audit, XSS surface), and known gaps with rationale for each.
- **+13 new a11y tests** in `ui.test.tsx` covering Modal labelling / Escape / focus restoration / Tab+Shift-Tab cycling, Tabs roles / keyboard nav / Home-End, and FormInput `aria-invalid` + `aria-describedby` wiring. Web suite total: 60 tests across 7 files.

### Drop 6c highlights (Perf + UX polish)

The last `window.confirm` / `window.prompt` calls are gone, the heavy pages are now code-split, and the hot rendering paths are memoised. Web suite total: 70 tests across 8 files.

- **No more `window.confirm` / `window.prompt`** — two new shared primitives in `ui.tsx`:
  - `ConfirmModal` — yes/no dialog with optional `danger` tone, auto-focuses the confirm action on open
  - `PromptModal` — single-input prompt with optional `validator` callback for live error display
  Both compose the existing `Modal`, so they inherit the focus trap, scroll lock, and Escape-to-close from Drop 6b without re-implementing any of it. Replaced the three remaining native calls: domain remove in the admin console (danger-toned confirm with the affected domain bolded), unlock-reason on the hours grid, and "spread evenly" on the wizard's planned-hours step (with a 0–168 validator).
- **Code-splitting via `React.lazy`** — `ProjectWizardPage`, `AdminConsolePage`, and `AcceptInvitePage` are loaded on demand behind a top-level `Suspense` boundary. The fallback is a centered indigo spinner with `role="status"` matching `ProtectedRoute`'s loading look. An IC who only visits `/dashboard` and `/projects/:id` no longer downloads the wizard or admin bundles up front.
- **Memoised hot paths**:
  - `HoursGridPanel.HoursCell` is now `React.memo`-wrapped. The parent looks up the per-cell `pendingCell` at the iteration site (not the whole pending Map) and passes a stable `useCallback`-wrapped `onCellChange`. Editing one cell no longer forces all 260 cells in a 10×26 grid to re-render.
  - Wizard `Step3Hours` row totals are now precomputed once per `plannedHours` change via `useMemo` (was O(resources × weeks) per keystroke; now O(non-empty cells)).
  - Wizard `Step4Financials` per-resource summary and grand totals are memoised on `[resources, plannedHours, contingencyPct, totalWeeks]`, so navigating between steps doesn't re-run the loop.
- **`Button` now uses `forwardRef`** so `ConfirmModal` can focus the confirm action without a workaround.
- **+10 new tests**: `ConfirmModal` (4 — render, single-call invariant, danger tone styling, Escape to cancel), `PromptModal` (4 — submit value, `initialValue` resets on reopen, validator disables submit, cancel doesn't fire submit), and `App.test.tsx` (2 — Suspense fallback shown while a lazy chunk loads, lazy page replaces the fallback once its import resolves).

### Drop 6d highlights (API integration tests)

Closes the Tier-1 testing gap from the Drop 6c audit: every route now has HTTP-level coverage that boots Express, fires real requests via Supertest, and exercises against a real Postgres. ~33 tests across 6 files. The unit tests (61) continue to run with `npm test`; the integration suite is opt-in via `npm run test:integration`.

- **App factory** — `src/createApp.ts` extracts Express setup from `src/index.ts`. The factory takes optional `sessionStore`, `redisStatus`, and `logging` overrides so tests get an in-memory session store, a stub redis health probe, and a quiet log stream. `src/index.ts` is now ~20 lines of "wire Redis + listen" — the integration suite imports `createApp` directly.
- **Test infrastructure** in `src/__integration__/`:
  - `globalSetup.ts` — drops/recreates the schema via `prisma db push --force-reset` and seeds a baseline (one whitelisted domain, three BUs, one Account, one bootstrap AA user) at the start of every `test:integration` run
  - `helpers.ts` — `setupTestApp`, `resetMutableTables` (between-test cleanup that preserves the baseline), `seedUser` / `seedProject` factories, and the killer `authenticateAs(app, email)` which walks the real two-step login + MFA flow and returns a Supertest agent with the session cookie attached. Every test user shares one TOTP secret so `currentTotpCode()` works universally.
- **Test coverage** — what each file proves about the API surface:
  - `auth.test.ts` (13) — register/login/MFA + domain whitelist enforcement + `/api/me` shape + logout
  - `projects.test.ts` (~10) — list scope by role (IC sees only assigned; BUL sees BU-owned; AA sees all); create permission gates (IC 403, PM ok); validation (end<start 400, dup code 409, out-of-range weeks 400); financial field stripping on detail for ICs
  - `hours.test.ts` (~7) — IC can edit own / can't edit others' rows / can't touch planned; PM can edit both; locked weeks reject from any role; lock/unlock permission + audit log; fill-remaining math
  - `admin.test.ts` (~8) — IC denied / BUL allowed / AA allowed on user list; AA can promote IC→PM and audit log records the change; BUL cannot update roles; domain CRUD restricted to AA; BU/Account create restricted to AA
  - `invites.test.ts` (~8) — GET context with 200/404/410 outcomes; POST accept creates the user, marks invite consumed, returns MFA setup payload; expired and already-accepted tokens both 410; race condition on email already taken returns 409
  - `dashboard.test.ts` (6) — adaptive sections per role: IC sees `my_hours`, PM sees `project_health`, BUL sees `bu_health` scoped to their BU, AA sees `platform_admin`; union roles (PM + BUL) get both blocks in one response
  - `exports.test.ts` (3) — IC's CSV strips fee / cost / rate columns; AA's CSV includes them; PDF magic-byte verification and access-denied check
- **Configuration** — `vitest.integration.config.ts` is separate so the integration suite has its own `globalSetup`, longer timeouts, single-fork pool (the suite shares one DB), and serial file ordering. The default `vitest.config.ts` excludes `__integration__` so `npm test` stays fast and hermetic.
- **Rate limit bypass** — `createApp`'s rate limiter honours `RATE_LIMIT_DISABLED=1`, set by `setupTestApp`. The auth/invite limits would otherwise trip after ten requests in a test run.

**To run the integration suite locally** (full instructions in `SETUP.md`):

```bash
# 1. Start a test Postgres (any way you like — Docker example):
docker run --rm -d --name quanta-test-db \
  -e POSTGRES_USER=quanta_test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=quanta_test \
  -p 5432:5432 postgres:16

# 2. Run the integration suite:
cd packages/api
TEST_DATABASE_URL=postgresql://quanta_test:test@localhost:5432/quanta_test \
  npm run test:integration
```


