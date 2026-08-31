import { describe, it } from "vitest";

/**
 * REMAINING ACCEPTANCE TODOS — "Add new" on manageable dropdowns.
 *
 * The feature is implemented: CreatableSelect + the create/invite modals are
 * wired into all seven surfaces, gated by lib/capabilities.ts, which honours
 * the grants overlay (manage_users@BU grantees can invite into their granted
 * BUs; the invite, directory, and domains endpoints accept them server-side —
 * covered by API integration tests in permissionGrants.test.ts). The shared
 * CreatableSelect behaviour has real tests in
 * components/CreatableSelect.test.tsx.
 *
 * What remains below are UI-flow acceptance criteria not yet automated
 * (they need heavier page-level harnesses), plus the pinned absences.
 */

describe("Project wizard — Account select", () => {
  it.todo("AA sees '+ New account…'; PM, BUL, AC, and IC do not");
  it.todo("creating an account inline auto-selects it in the wizard state");
  it.todo("a duplicate account code surfaces the API 409 message inside the inline modal");
  it.todo("the freshly created account is immediately usable: submitting the wizard with it creates the draft");
});

describe("Project wizard — Owning business unit select", () => {
  it.todo("AA sees '+ New business unit…'; nobody else does (BULs cannot create BUs)");
  it.todo("creating a BU inline auto-selects it and derived state (owningBuCode) updates");
});

describe("Project wizard — Team directory", () => {
  it.todo("'+ Invite someone…' appears for AA and BUL; PM sees no invite affordance");
  it.todo("the empty-search state ('No matches') offers the invite affordance, prefilling the search text as the email when it looks like one");
  it.todo("a BUL's inline invite has the BU select locked to their own BU");
  it.todo("a foreign-domain email keeps the amber whitelist-bypass note inside the inline invite modal");
  it.todo("an invited (pending) user appears in the directory immediately with the pending badge and can be added as a resource");
});

describe("Project detail — Add person modal (Person select)", () => {
  it.todo("AA and BUL see '+ Invite new user…' in the Person select; PM does not");
  it.todo("inline invite auto-selects the pending user; saving the assignment shows the existing pending-invitee badge on the row");
  it.todo("cancelling the inline invite restores the previously selected candidate");
});

describe("Admin console — User edit modal (Primary BU select)", () => {
  it.todo("AA sees '+ New business unit…' in the primary-BU select (the restricted BUL variant hides the BU select entirely, so the affordance can never leak there)");
  it.todo("creating a BU inline auto-selects it as the primary BU and the BUs tab reflects it via query invalidation");
});

describe("Admin console — Invite modal (BU select)", () => {
  it.todo("AA sees '+ New business unit…'; a BUL's locked BU select (lockedBuId) has no affordance");
  it.todo("creating a BU inline auto-selects it and the invite submits against the fresh BU");
});

describe("Admin console — User edit modal (Managed accounts checklist, adjacent surface)", () => {
  it.todo("AA sees a trailing '+ New account…' row in the managed-accounts checklist; creating one adds it pre-checked");
});

describe("Explicit non-goals (asserted absences)", () => {
  it.todo("currency selects (wizard, dashboard, accounts page) never render an add-new affordance — enums are not manageable entities");
  it.todo("the team-directory BU filter never renders add-new — it filters existing data, it does not assign");
  it.todo("ShareProjectModal's BU select ships without add-new (v1 deferral: sharing into a just-created, member-less BU does nothing)");
  it.todo("ReviewerShareModal's user select ships without add-new (v1 deferral: a pending invitee cannot review until they accept)");
});
