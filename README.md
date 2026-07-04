# Quanta

**Plan projects, track the hours, keep the margin.**

Quanta is a role-aware web application for professional-services project planning: estimate a project as a weekly resource plan, route it through draft review and approval, track actual hours against the plan, and watch fee, cost, and margin respond in real time. It replaces the spreadsheet sprawl of estimates, timesheets, and financial rollups with one structured system that knows who is allowed to see and change what.

**Live:** deployed on Fly.io (API + web). See [`DEPLOY.md`](DEPLOY.md).

## What it does

**Plan.** A five-step wizard walks a project from scope to a committed plan: basics and dates, the team (with cross-BU cost markup applied automatically), a per-person weekly planned-hours grid, pricing (time & materials with contingency, or fixed price with a contract value), and review. Invited teammates are assignable before they've even activated their accounts. Drafts can be reopened and revised in the same wizard, so iteration feels identical to creation.

**Review and approve.** Projects start as drafts. Owners share them with named reviewers; an Account Administrator or the owning BU lead approves them into an active project — at which point the plan is captured as an immutable Initial Plan baseline.

**Track.** Individual contributors log actual hours in a weekly grid scoped to their own assignments. Weeks can be locked (and unlocked, with a reason) as they close. A burn chart shows planned vs actual trajectory per project.

**Steer.** Financials are computed live from the plan and the actuals: total fee, cost, margin %, contingency, estimate-at-completion hours and cost. The projects list badges anything with margin below 35% as at-risk; role-adaptive dashboards roll the same signals up — BU revenue/margin/profit against yearly targets for BU leads, account overviews for account managers, per-project burn health for PMs, and platform stats for admins. Everything exports to CSV and PDF, with financial fields stripped for viewers who aren't entitled to them.

**Administer.** An admin console manages users (multi-role, financial access, cost rates, activate/deactivate/delete), invitations that carry role and BU assignments, business units, client accounts, and the domain whitelist that gates self-signup. Every mutation is written to an audit log.

## Roles

A user holds one or more roles; the UI and API adapt to the union of them.

| Role | Who | What they can do |
|------|-----|------------------|
| `IC` | Individual contributor | Log actual hours on their own assignments; see their own week |
| `PM` | Project manager | Create and plan projects, manage drafts, track burn on their projects |
| `AC` | Account manager | Oversee projects and financials across their managed accounts |
| `BUL` | Business-unit lead | BU-wide financial health vs targets; approve drafts in their BU; manage BU users |
| `AA` | Account administrator | Everything: platform administration, user lifecycle, approvals, all financials |

Financial visibility is a separate per-user flag, so a role can exist with or without seeing money.

## Access and account

Authentication is email + password with optional TOTP MFA, behind a domain-whitelisted signup (or an invitation, which pre-assigns BU, system roles, and a project role). Users manage their own name, preferred project-role labels, and password from an in-app account modal; destructive self-actions (deactivating or deleting your own account) are blocked by design.

## Architecture

- **Web:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, TanStack Query
- **API:** Node.js, Express, Prisma ORM, Zod validation
- **Data:** PostgreSQL 16 · Redis 7 (sessions)
- **Auth:** session cookies, bcrypt, optional TOTP (encrypted secrets)
- **Hosting:** Fly.io (separate API and web apps, managed Postgres, Upstash Redis)
- **CI:** GitHub Actions — typecheck, unit tests, and Supertest-against-Postgres integration tests on every PR

The repo is an npm-workspaces monorepo: `packages/api` and `packages/web`.

## Getting started

- **Local development:** [`SETUP.md`](SETUP.md)
- **Deploying:** [`DEPLOY.md`](DEPLOY.md)
- **Security posture and threat model:** [`SECURITY.md`](SECURITY.md)

## Roadmap

Planned work lives in [GitHub issues](https://github.com/Anfaje/quanta-project-planner/issues) — currently centered on profitability steering: margin guardrails at approval, baseline-drift comparison, overburn alerts, utilization/capacity views, rate cards, and the platform hardening to support them.

## Project history

Quanta was designed and built iteratively; the paper trail is preserved. [`SPEC_AUDIT.md`](SPEC_AUDIT.md) records the implementation-vs-requirements audit, [`TODO.md`](TODO.md) the engineering parking lot, and [`docs/`](docs/) the original project plan, reference architecture, 212-case test plan, and the interactive React UI prototypes the product was built from.
