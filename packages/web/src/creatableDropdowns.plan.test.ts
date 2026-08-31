import { describe, it } from "vitest";

/**
 * TEST PLAN — "Add new" on manageable dropdowns (creatable selects).
 *
 * Design under test (not yet built):
 * A shared CreatableSelect wrapper renders the normal options plus a final
 * "+ Add new …" affordance, shown ONLY when the caller can create that
 * entity type. Choosing it opens the matching inline create modal (the
 * existing CreateAccountModal / CreateBuModal — extracted from
 * AdminConsolePage — or InviteModal), WITHOUT committing a selection.
 * On success: the backing query is invalidated, the fresh entity is
 * auto-selected, focus returns to the select. On cancel: the previous
 * value and focus are restored.
 *
 * Gating (mirrors existing server guards — no new API is needed):
 *   accounts        POST /api/admin/accounts      AA only
 *   business units  POST /api/admin/bus           AA only
 *   users (invite)  POST /api/admin/users/invite  AA + BUL (BUL locked to own BU,
 *                                                 foreign-domain amber note preserved)
 *
 * Every test here is an it.todo — they enumerate the acceptance criteria
 * for development and intentionally do not run yet.
 */

describe("CreatableSelect (shared behaviour)", () => {
  it.todo("renders '+ Add new …' as the final option only when the caller can create the entity");
  it.todo("renders no affordance at all (absent, not disabled) when the caller cannot create");
  it.todo("choosing '+ Add new …' opens the create modal and does not change the committed selection");
  it.todo("cancelling the create modal restores the previous selection and returns focus to the select");
  it.todo("successful create closes the modal, invalidates the option query, and auto-selects the new entity");
  it.todo("a server error in the modal (e.g. 409 duplicate code) is shown inline and the dropdown stays usable");
  it.todo("the affordance and modal are keyboard-reachable (a11y: focus trap in modal, escape cancels)");
});

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
