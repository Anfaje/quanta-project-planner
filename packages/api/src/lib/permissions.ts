import { Role } from "@prisma/client";
import type { AuthUser, Action, ResourceContext } from "../types";

/**
 * Centralised permission resolver.
 *
 * Business logic NEVER checks role strings directly — it calls resolver functions.
 * Permissions are additive: the effective capability set is the union of all roles.
 * Adding a role can never reduce a user's capabilities.
 */

// ── Base capabilities per role (non-scoped) ──

const ROLE_CAPABILITIES: Record<Role, Set<Action>> = {
  IC: new Set(["logHours", "viewOwnHours"]),
  PM: new Set(["viewTeamHours", "createProject", "manageProject", "viewBillRates"]),
  AC: new Set(["viewTeamHours", "createProject", "manageProject", "viewBillRates"]),
  BUL: new Set(["viewTeamHours", "createProject", "manageProject", "viewBillRates", "adminBU"]),
  AA: new Set(["viewTeamHours", "adminUsers", "adminPlatform", "manageDomains", "manageAccounts"]),
};

/**
 * Check if a user has a base (non-scoped) capability.
 * This is the union of all capabilities from their roles.
 */
export function hasCapability(user: AuthUser, action: Action): boolean {
  return user.roles.some((role) => ROLE_CAPABILITIES[role]?.has(action));
}

/**
 * Check if a user can view financial data for a specific project.
 *
 * Financial access is scoped per-project:
 * - AC: project's account must be in the user's managed accounts
 * - BUL: project must be in the user's BU or shared with their BU
 * - AA: only if financialAccess flag is true
 *
 * PM gets bill rates but NOT cost rates or margins.
 * IC gets nothing.
 */
export function canViewFinancials(user: AuthUser, ctx: ResourceContext): boolean {
  // AC path: project is in a managed account
  if (
    user.roles.includes(Role.AC) &&
    ctx.projectAccountId &&
    user.managedAccountIds.includes(ctx.projectAccountId)
  ) {
    return true;
  }

  // BUL path: project is in user's BU or shared with their BU
  if (user.roles.includes(Role.BUL)) {
    if (ctx.projectOwningBuId === user.primaryBuId) return true;
    if (ctx.projectSharedBuIds?.includes(user.primaryBuId)) return true;
  }

  // AA path: only with explicit financial flag
  if (user.roles.includes(Role.AA) && user.financialAccess) {
    return true;
  }

  return false;
}

/**
 * Check if a user can view bill rates for a project.
 * PM, AC, BUL all see bill rates. AA with financial flag too.
 */
export function canViewBillRates(user: AuthUser): boolean {
  return hasCapability(user, "viewBillRates") ||
    (user.roles.includes(Role.AA) && user.financialAccess);
}

/**
 * Check if a user can access a project at all.
 *
 * - IC/PM: must be assigned to the project
 * - AC: project must be in a managed account
 * - BUL: project must be in their BU or shared
 * - AA: all projects
 *
 * Returns true if ANY of the user's roles grants access.
 */
export function canAccessProject(
  user: AuthUser,
  ctx: ResourceContext & { assignedUserIds?: string[] }
): boolean {
  // AA: platform-wide access
  if (user.roles.includes(Role.AA)) return true;

  // IC or PM: must be assigned
  if (
    (user.roles.includes(Role.IC) || user.roles.includes(Role.PM)) &&
    ctx.assignedUserIds?.includes(user.id)
  ) {
    return true;
  }

  // AC: project in managed account
  if (
    user.roles.includes(Role.AC) &&
    ctx.projectAccountId &&
    user.managedAccountIds.includes(ctx.projectAccountId)
  ) {
    return true;
  }

  // BUL: project in BU or shared
  if (user.roles.includes(Role.BUL)) {
    if (ctx.projectOwningBuId === user.primaryBuId) return true;
    if (ctx.projectSharedBuIds?.includes(user.primaryBuId)) return true;
  }

  return false;
}

/**
 * Check if a user can edit hours on a project.
 *
 * - IC: own hours only (caller must also check assignment)
 * - PM/AC/BUL: any hours on projects they can access
 * - AA: no (unless they also hold PM/AC/BUL/IC)
 */
export function canEditHours(user: AuthUser, isOwnRow: boolean): boolean {
  if (isOwnRow && user.roles.includes(Role.IC)) return true;
  if (user.roles.includes(Role.PM)) return true;
  if (user.roles.includes(Role.AC)) return true;
  if (user.roles.includes(Role.BUL)) return true;
  return false;
}

/**
 * Check if a user can manage planned hours (set/edit the plan).
 */
export function canManagePlan(user: AuthUser): boolean {
  return user.roles.includes(Role.PM) ||
    user.roles.includes(Role.AC) ||
    user.roles.includes(Role.BUL);
}

/**
 * A project's plan (assignments, hours, dates, contingency) is locked once the
 * project is complete or archived. Completing a project freezes the Current
 * plan for evaluation; reopening it (status -> active) unlocks it again.
 */
export function isPlanLocked(status: string): boolean {
  return status === "complete" || status === "archived";
}

/**
 * Check if a user can lock/unlock weeks.
 */
export function canLockWeeks(user: AuthUser): boolean {
  return user.roles.includes(Role.PM) ||
    user.roles.includes(Role.AC) ||
    user.roles.includes(Role.BUL);
}

/**
 * Get the dashboard sections a user should see.
 * Sections are ordered by priority (highest context first).
 */
export function getDashboardSections(user: AuthUser): string[] {
  const sections: string[] = [];
  if (user.roles.includes(Role.BUL)) sections.push("bu_health");
  if (user.roles.includes(Role.AC)) sections.push("account_overview");
  if (user.roles.includes(Role.AA)) sections.push("platform_admin");
  if (user.roles.includes(Role.PM)) sections.push("project_health");
  if (user.roles.includes(Role.IC)) sections.push("my_hours");
  return sections;
}

/**
 * Get the list of roles that require additional context to be useful.
 * Used by the admin console to show the right sub-panels.
 */
export function roleRequiresContext(role: Role): string | null {
  switch (role) {
    case Role.AC: return "managed_accounts";
    case Role.AA: return "financial_access_flag";
    default: return null;
  }
}

/**
 * Check if a user can create a new project in the given (account, BU).
 *
 * Any of the following grants creation rights:
 *   - AA: anywhere
 *   - BUL: if owningBuId matches their primary BU
 *   - AC:  if accountId is in their managed accounts
 *   - PM:  anywhere (PM is a delivery role, not scoped to a BU or account)
 *
 * IC alone cannot create projects.
 */
export function canCreateProject(
  user: AuthUser,
  accountId: string,
  owningBuId: string
): boolean {
  if (user.roles.includes(Role.AA)) return true;
  if (user.roles.includes(Role.PM)) return true;
  if (user.roles.includes(Role.BUL) && owningBuId === user.primaryBuId) return true;
  if (user.roles.includes(Role.AC) && user.managedAccountIds.includes(accountId)) return true;
  return false;
}

/**
 * AA or the owning-BU BUL — the only roles that can move a project into `active`,
 * whether by creating it directly or by approving a draft. A PM (or AC) cannot
 * activate; their projects must be drafted and approved by an AA/BUL.
 */
export function canActivateProject(user: AuthUser, owningBuId: string): boolean {
  if (user.roles.includes(Role.AA)) return true;
  if (user.roles.includes(Role.BUL) && owningBuId === user.primaryBuId) return true;
  return false;
}

/**
 * Who can approve a draft → active. Identical mandate to activation: an AA or the
 * owning-BU BUL. There is NO self-approval restriction — an AA/BUL may approve
 * their own draft (product decision). Approval is reserved to AA/BUL, so a pure
 * PM can never approve anything regardless of who created the draft.
 */
export function canApproveDraft(
  user: AuthUser,
  project: { owningBuId: string }
): boolean {
  return canActivateProject(user, project.owningBuId);
}

/**
 * Who can view a draft. Drafts are NOT visible via the normal project-access
 * paths (they're excluded from the main list and all aggregations). Visibility
 * is limited to: the owner, anyone explicitly invited as a reviewer, any AA
 * (oversight), and the owning-BU BUL (so approvers get a queue without needing
 * to be explicitly shared).
 */
export function canAccessDraft(
  user: AuthUser,
  project: { owningBuId: string; createdById: string; reviewerUserIds?: string[] }
): boolean {
  if (project.createdById === user.id) return true;
  if (project.reviewerUserIds?.includes(user.id)) return true;
  if (user.roles.includes(Role.AA)) return true;
  if (user.roles.includes(Role.BUL) && project.owningBuId === user.primaryBuId) return true;
  return false;
}

/**
 * Check if a user can manage (edit/archive) a project.
 *
 * Requires a manage-capable role AND access to the project. The caller is
 * expected to combine this with canAccessProject / ResourceContext as needed.
 */
export function canManageProject(user: AuthUser): boolean {
  return hasCapability(user, "manageProject");
}
