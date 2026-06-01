# Spec Audit — Implementation vs. Business Requirements

A pass over the codebase against the source-of-truth docs (`docs/Quanta_Reference_Architecture.docx` and the 212 test cases in `docs/Quanta_Test_Cases.docx`), done after Drops 1–6d + 5a/5b. It separates **what was fixed in this pass**, **what was verified correct**, the **one architectural divergence that needs a decision**, and the **ranked backlog of gaps**.

Last updated: audit pass following Drop 5b.

---

## ✅ Fixed in this audit pass

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | **Password length inconsistency.** Registration enforced 8 chars (matching TC 1.16/1.17) but invite-acceptance enforced 12 — same product, two policies by entry path. The web `SignupPage` and `AcceptInvitePage` also displayed/validated "12". | Standardised to **8** everywhere: `validation.ts` (both schemas), `SignupPage`, `AcceptInvitePage`. Fixed a misleading integration-test title and added an exactly-8 boundary test. *If you prefer a stronger 12-char policy, bump both Zod schemas + the two pages + update TC 1.16/1.17 — it's deliberately consistent now so that's a one-decision change.* |
| 2 | **Hours-grid cell coloring missing.** The grid only highlighted unsaved (pending) edits in indigo. Spec (TC 2.10 / 8.19) wants the actual value **green when it matches plan, indigo when it differs**. | `HoursGridPanel` now tones the actual value: emerald when `actual === planned`, indigo when they differ, neutral gray when nothing's logged. |
| 3 | **Planned hours not shown as placeholder.** Empty actual cells showed "—". Spec (TC 8.20) wants the planned value as a light-gray placeholder the user types over. | Empty actual cells now render the planned hours as the gray placeholder. |
| 4 | **Signup missing project-role selection.** `SignupPage` hard-coded `projectRoles: []`; spec (TC 1.8/1.14/1.15/1.21) requires multi-select pills. The API already accepted the field. | Added a multi-select pill group (curated starter list matching seed vocabulary; selecting none is allowed per TC 1.15) wired into the register payload. |

---

## ✅ Verified correct — no change needed

- **Financial serialiser** (`financialSerializer.ts`) matches spec §5.1 exactly: IC → nothing; **PM → bill rate only** (no cost/margin); AC/BUL/AA → full financials when in scope. Both camelCase and snake_case keys are stripped defensively.
- **Dashboard sections** — all five exist and are role-gated (`my_hours`, `project_health`, `account_overview`, `bu_health`, `platform_admin`), including the AC `account_overview` path. API keys differ cosmetically from the doc's labels ("BU overview", "Platform admin") but are internally consistent.
- **Wizard 35% margin warning** present in `ProjectWizardPage` (emerald ≥ 35, amber ≥ 25, rose below).
- **Financial calc division-by-zero guard** (TC 8.24): `marginPct = totalFee > 0 ? … : 0`. Zero-planned-hours projects render $0/0% cleanly.
- **`GlobalConfig` table** backs BU targets (yearly revenue / margin / headcount) and is seeded — sensible design (config rows, not BU columns).
- **Signup domain verification** (TC 1.9/1.10/1.13): live check against `/api/auth/domains` with inline allow/deny feedback.

---

## ✅ Resolved by decision — hours grid stays weekly

**Decision (post-audit):** keep the **weekly** hours grid; the spec and test cases were updated to match, rather than rebuilding to daily.

Rationale: weekly granularity is already built, tested, and sufficient when time rolls up weekly for billing. Daily Mon–Fri would have rippled through the data model, hours API, wizard Step 3, and burn-chart math with a data-migration cost — not worth it absent a hard requirement for per-day entry.

**Docs updated to reflect the weekly reality (tracked changes, author "Claude"):**
- `Quanta_Reference_Architecture.docx` §6.3 (hours grid) and the §5 API hours-endpoint description — daily Mon–Fri / week-arrow nav / Today button / current-day highlight / future-week lockout / `is_future` flag all replaced with the weekly model (one column per project week, sticky resource column, lock ribbons, per-week fill-remaining, green/indigo cells, planned-as-placeholder).
- `Quanta_Test_Cases.docx` — 13 cells across IC §2 (2.9, 2.11, 2.17, 2.18, 2.19, 2.21) and Edge §8 (8.18) rewritten from daily/Today-button/future-disable behavior to the weekly grid. Notably **8.19 (green/indigo) and 8.20 (planned-placeholder) were left unchanged — the implementation now satisfies them** after the cell-coloring fix in this pass.

The visual behaviors the daily spec called for (cell coloring, planned placeholder) were pulled onto the weekly grid regardless, so nothing of value was lost.

### Original divergence (kept for the record)

`HourEntry` stores one `plannedHours` + one `actualHours` per `(assignment, projectWeek)`; the grid shows every project week as a column. The prior spec (arch §6.3 + ~12 test cases) described a daily Mon–Fri grid with one week visible at a time, navigated by arrows with a Today button. That language is now corrected.

---

## 📋 Gap backlog — specified but not yet implemented (ranked)

### Tier 1 — core flows referenced repeatedly
- [ ] **CSV import for hours** (TC 3.17 / 3.18 / 8.6) — PM bulk-imports a timesheet; unmatched names flagged & skipped with a report. No endpoint or UI today.
- [ ] **Forgot-password flow** (TC 1.5; also a known `SECURITY.md` gap) — needs SES/SMTP, a reset-token model, and the reset pages. Currently the only recovery is AA deactivate + re-invite.
- [ ] **Post-signup Welcome screen** (TC 1.19 / 1.20) — role-badge confirmation with a context-appropriate CTA ("Go to dashboard" vs "Go to project").
- [ ] **Monthly trajectory charts with real data** (BUL TC 2.5/2.6/2.7) — `GlobalConfig` holds *yearly* targets only; there's no monthly target/actual series feeding the revenue/profit/headcount trajectory charts. They'll be empty or stubbed until a data source exists.
- [ ] **Project sharing UI** (TC 4.10 / 5.22) — the `ProjectShare` model exists; the BUL-facing "share with another BU" action + the "Shared" badge need building.

### Tier 2 — meaningful but narrower
- [ ] **Remember-me** (TC 1.6) — persist session across browser restart within the 8h TTL.
- [ ] **Invite context banner** persisting through signup (TC 1.7) — partial; the accept flow exists but the "[X] invited you to [Project] as [Role]" banner needs to survive the signup transition.
- [ ] **Deactivate-sole-PM warning** (TC 4.18 / 5.18) — block/warn when deactivating the only PM on a live project, prompt reassignment.
- [ ] **Per-BU default contingency** (TC 5.21) — BUL changes the BU's default contingency (e.g. 15%→10%) for *new* projects; needs a BU-scoped config row + wizard default wiring.
- [ ] **Add / remove resource mid-project** (TC 3.21 / 3.22) — verify empty past weeks on add, and historical-actuals preservation on remove.
- [ ] **Archive → read-only** (TC 3.20 / 8.16) — confirm archived projects drop from the active list, stay searchable, and render read-only (financials visible to AC/BUL, not editable).
- [ ] **Weekly-summary-by-project toggle** (TC 2.20) — per-project planned/actual/delta/completion expander on the grid.
- [ ] **Concurrency last-write-wins + toast** (TC 8.2) — two editors on one cell; confirm both get a toast and last save wins.
- [ ] **Session-expiry preserves unsaved data** (TC 8.3) — re-auth then resubmit the in-flight edit rather than dropping it.
- [ ] **Mobile-responsive grid** (TC 8.8) — tap-friendly cells, no horizontal-scroll trap.

### Tier 3 — infra / security hardening (mostly Drop 5c, some documented deviations)
- [ ] **CSRF double-submit cookie** — arch §9 specifies it; we rely on `SameSite=Strict` instead. Either implement the double-submit pattern or record the deviation as accepted in `SECURITY.md`.
- [ ] **Append-only audit log** (arch §9) — currently a normal table we INSERT into; the spec wants INSERT-only DB grants so rows can't be updated/deleted even via the app's role.
- [ ] **TOTP library** — arch names `speakeasy`; we use `otpauth` (modern, maintained). Functionally equivalent — just note the deliberate substitution; no action needed beyond acknowledging it.
- [ ] **Observability** — OpenTelemetry traces, Prometheus `/metrics`, correlation IDs on logs (arch §10). Deferred to 5c.

---

## Test gaps surfaced by this audit

- **AC role is uncovered by integration tests** — no coverage of the `account_overview` dashboard, AC-scoped project access, or AC financial visibility. The dashboard integration tests cover IC/PM/BUL/AA but not AC.
- **No tests for the cell-coloring / placeholder behavior** added in this pass (green-matches / indigo-differs / planned-placeholder).
- **No test for the signup project-role pills** added in this pass.

These are cheap to add and would lock in the fixes above.
