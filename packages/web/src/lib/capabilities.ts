import type { Me } from "./types";

/**
 * Client-side gating for "Add new" affordances on dropdowns. These mirror
 * the server guards (which enforce regardless): accounts and business units
 * are created by AAs; users are invited by AAs, BULs (own BU), and
 * manage_users grantees (their granted BUs).
 */

export function canCreateAccounts(me: Me): boolean {
  return me.roles.includes("AA");
}

export function canCreateBusinessUnits(me: Me): boolean {
  return me.roles.includes("AA");
}

/** BU ids the caller may invite users into; "all" for AAs. */
export function userAdminBuIds(me: Me): "all" | string[] {
  if (me.roles.includes("AA")) return "all";
  const ids = new Set<string>();
  if (me.roles.includes("BUL") && me.primaryBu) ids.add(me.primaryBu.id);
  for (const g of me.grants ?? []) {
    if (g.permission === "manage_users" && g.scopeType === "business_unit" && g.scopeId) {
      ids.add(g.scopeId);
    }
  }
  return [...ids];
}

export function canInviteUsers(me: Me): boolean {
  const reach = userAdminBuIds(me);
  return reach === "all" || reach.length > 0;
}
