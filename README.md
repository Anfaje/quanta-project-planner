# Quanta

**Project Estimates & Resource Tracking Platform**

Quanta replaces manual Google Sheet workflows with a structured, role-aware web application for project resource estimation and actuals tracking.

## Architecture

- **Frontend:** React 18 + TypeScript + Tailwind CSS + Recharts
- **Backend:** Node.js + Express + Prisma ORM
- **Database:** PostgreSQL 16
- **Cache:** Redis 7
- **Auth:** Email + password with TOTP MFA (domain-whitelisted signup)

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
cp .env.example .env

# 2. Start infrastructure
docker-compose up -d postgres redis mailpit

# 3. Install dependencies
npm install

# 4. Run migrations + seed
npm run db:migrate
npm run db:seed

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
| maya@trifork.com | IC |

### Whitelisted Domains

`@trifork.com`, `@trifork-na.com`, `@spantree.com`

## Project Structure

```
quanta-project-planner/
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
| 2 | Auth + RBAC: login, MFA, domain whitelist, permission resolver | 🔜 |
| 3 | Core API: projects, hours, assignments, dashboard, export | — |
| 4 | Frontend: all pages and components | — |
| 5 | Infrastructure: Terraform, CI/CD, deployment | — |
| 6 | Polish: WCAG, perf, pen test, migration | — |
