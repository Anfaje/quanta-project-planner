# Quanta

**Project Estimates & Resource Tracking Platform**

Quanta replaces manual Google Sheet workflows with a structured, role-aware web application for project resource estimation and actuals tracking.

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
| 5 | Infrastructure: Terraform, CI/CD, deployment | — |
| 6 | Polish: WCAG, perf, pen test, migration | — |

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

