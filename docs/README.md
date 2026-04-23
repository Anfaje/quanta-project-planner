# Quanta Documentation

## Spec & Planning Documents

| Document | Version | Contents |
|----------|---------|----------|
| **Quanta_Project_Plan.docx** | v2.1 | 19-week phased delivery plan with 7 phases, 8.5 FTE team structure, milestone gates, risk register, multi-role permission model, common role combinations |
| **Quanta_Reference_Architecture.docx** | v2.2 | Tech stack, Prisma data model (11 entities), 26-endpoint API design, 5-layer RBAC with additive role merging, AWS hosting strategy with cost estimates, NFR matrix |
| **Quanta_Test_Cases.docx** | v2.2 | 212 test cases across 9 sections: auth/signup, IC, PM, AC, BUL, AA, multi-role combinations, onboarding wizard, and system edge cases |

## UI Prototypes

Interactive React (JSX) prototypes in `prototypes/`. These were designed iteratively and serve as the visual specification for the frontend build.

| Prototype | Covers |
|-----------|--------|
| **Quanta_Dashboard_Prototype.jsx** | Adaptive dashboard with role toggle — renders IC hours (with fill-remaining), PM burn chart (cumulative + weekly detail), AC account roll-ups, BUL health check (3-question cards + revenue/profit/headcount trajectory charts), AA platform stats |
| **Quanta_Hours_Grid_Prototype.jsx** | IC weekly timesheet — Mon–Fri grid with week navigation (Today button left of arrows), locked/future week states, planned-hours placeholders, green/indigo cell states, daily totals, save flow |
| **Quanta_Financial_Views_Prototype.jsx** | BUL/AC financial detail — 3-question health check, monthly trajectory charts, margin-by-project bars, revenue billed-vs-remaining, margin trend (at-risk highlighted), project drill-down (gauges, resource charts, cost donut, calculation breakdown) |
| **Quanta_Wizard_Prototype.jsx** | 5-step project creation — conditional Step 4 (financial setup) for AC/BUL, Account selector, cross-BU resource search, planned hours grid with live totals, margin warning at 35%, review & launch with email notification |
| **Quanta_Auth_Prototype.jsx** | Login (email + password + TOTP MFA), signup (domain whitelist validation, project role multi-select), invite link context, welcome screen with IC default |
| **Quanta_Admin_Prototype.jsx** | AA admin console — 4-tab layout: Users (filterable table + side-panel with multi-role checkboxes, AC–Account linking, AA financial toggle), Business Units, Accounts, Email Domains (whitelist CRUD) |

### Running Prototypes

These are standalone React components. To run them:

1. Paste into a [Claude Artifact](https://claude.ai) (they were designed there)
2. Or mount in any React app that has `recharts`, `react`, and Tailwind CSS available
