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
| 3 | Core API: projects, hours, assignments, dashboard, export | 🔜 |
| 4 | Frontend: all pages and components | — |
| 5 | Infrastructure: Terraform, CI/CD, deployment | — |
| 6 | Polish: WCAG, perf, pen test, migration | — |
