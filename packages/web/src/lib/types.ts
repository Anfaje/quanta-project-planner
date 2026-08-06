/**
 * Shared response types — mirror what the API sends, strictly typed so UI
 * code gets autocomplete and compile-time safety.
 *
 * Kept intentionally close to the wire format: NO transforms, no serialiser
 * layer on the client. The API's financialSerializer decides what to send,
 * and the client trusts that shape.
 */

export type Role = "IC" | "PM" | "AC" | "BUL" | "AA";

export type ProjectStatus = "active" | "on_hold" | "complete" | "archived" | "draft";
export type PricingModel = "time_and_materials" | "fixed_price";

export type DashboardSection =
  | "my_hours"
  | "project_health"
  | "account_overview"
  | "bu_health"
  | "platform_admin";

// ── Auth / Me ──

export interface BusinessUnitLite {
  id: string;
  code: string;
  name: string;
}

export interface AccountLite {
  id: string;
  code: string;
  name: string;
}

export interface UserLite {
  id: string;
  name: string;
  email: string;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  projectRoles: string[];
  primaryBu: BusinessUnitLite | null;
  financialAccess: boolean;
  managedAccounts: AccountLite[];
  dashboardSections: DashboardSection[];
}

export interface LoginMfaRequired {
  status: "mfa_required";
}

export interface LoginMfaSetupRequired {
  status: "mfa_setup_required";
  mfaSetup: { qrUri: string; manualKey: string };
}

export interface LoginAuthenticated {
  status: "authenticated";
  user: {
    id: string;
    email: string;
    name: string;
    roles: Role[];
    projectRoles: string[];
  };
}

export type LoginResponse = LoginMfaRequired | LoginMfaSetupRequired | LoginAuthenticated;
export type MfaVerifyResponse = LoginAuthenticated;

export interface RegisterResponse {
  // "authenticated" when MFA is disabled (no mfaSetup, user is logged in);
  // otherwise "mfa_setup_required" and the user must complete TOTP setup.
  status: "mfa_setup_required" | "authenticated";
  message: string;
  mfaSetup?: { qrUri: string; manualKey: string };
  user: {
    id: string;
    email: string;
    name: string;
    roles: Role[];
    projectRoles: string[];
  };
}

// ── Invite ──

export interface InviteContext {
  email: string;
  name: string | null;
  projectRole: string | null;
  bu: BusinessUnitLite;
  invitedBy: UserLite;
  expiresAt: string;
}

export type AcceptInviteResponse =
  | (LoginMfaSetupRequired & { user: RegisterResponse["user"] })
  | LoginAuthenticated;

// ── Projects ──

export interface ProjectListItem {
  id: string;
  name: string;
  projectCode: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  contingencyPct: number;
  account: AccountLite;
  owningBu: BusinessUnitLite;
  resourceCount: number;
  /** Planned-hours drift vs the Initial Plan baseline (null = no baseline). */
  hoursDriftPct?: number | null;
  // Financial fields — present only if the caller can see them
  totalFee?: number;
  totalCost?: number;
  totalPlannedHours?: number;
  totalActualHours?: number;
  marginPct?: number;
  actualMarginPct?: number;
  adjustedFee?: number;
}

export interface AssignmentRow {
  id: string;
  userId: string;
  user: UserLite;
  projectRole: string;
  businessUnit: string;
  billRate?: number;
  costRate?: number;
  plannedHours?: number;
  actualHours?: number;
  plannedFee?: number;
  actualFee?: number;
  plannedCost?: number;
  actualCost?: number;
}

export interface ProjectFinancials {
  totalPlannedHours: number;
  totalActualHours: number;
  totalFee?: number;
  totalActualFee?: number;
  totalCost?: number;
  totalActualCost?: number;
  contingencyAmt?: number;
  adjustedFee?: number;
  marginPct?: number;
  actualMarginPct?: number;
  eacHours: number;
  fixedPrice?: number | null;
}

export interface ProjectDetail {
  project: {
    id: string;
    name: string;
    projectCode: string;
    status: ProjectStatus;
    pricingModel: PricingModel;
    fixedPrice: number | null;
    description: string | null;
    rejectionNote: string | null;
    rejectionAt: string | null;
    startDate: string;
    endDate: string;
    contingencyPct: number;
    totalWeeks: number;
    account: AccountLite;
    owningBu: BusinessUnitLite;
    sharedWithBus: BusinessUnitLite[];
    reviewers: UserLite[];
    createdBy: UserLite;
    createdAt: string;
    updatedAt: string;
    baseline: { capturedAt: string } | null;
  };
  assignments: AssignmentRow[];
  financials: ProjectFinancials;
  /** Present only for callers who can approve this draft: the plan's economics. */
  approvalFinancials?: {
    plannedFee?: number;
    plannedCost?: number;
    adjustedFee?: number;
    contingencyPct: number;
    contingencyAmt?: number;
    marginPct?: number;
    belowTarget: boolean;
  };
  capabilities: {
    canManage: boolean;
    canManagePlan: boolean;
    canLockWeeks: boolean;
    isDraft: boolean;
    canApproveDraft: boolean;
    canManageReviewers: boolean;
  };
}

/** A row from GET /api/projects/drafts. */
export interface DraftListItem {
  id: string;
  name: string;
  projectCode: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  account: AccountLite;
  owningBu: BusinessUnitLite;
  createdBy: UserLite;
  reviewers: UserLite[];
  resourceCount: number;
  updatedAt: string;
  rejectionNote: string | null;
  rejectionAt: string | null;
  changesRequested: boolean;
  isOwner: boolean;
  canApprove: boolean;
}

// ── Hours Grid ──

export interface HoursWeek {
  week: number;
  weekStartDate: string;
  locked: boolean;
}

export interface HoursEntry {
  week: number;
  plannedHours: number | null;
  actualHours: number | null;
  locked: boolean;
}

export interface HoursAssignmentRow {
  id: string;
  userId: string;
  user: UserLite;
  projectRole: string;
  businessUnit: string;
  billRate?: number;
  costRate?: number;
  entries: HoursEntry[];
}

export interface HoursGrid {
  projectId: string;
  totalWeeks: number;
  weeks: HoursWeek[];
  assignments: HoursAssignmentRow[];
  capabilities: {
    canEditOwnActuals: boolean;
    canManagePlan: boolean;
    canLockWeeks: boolean;
  };
}

// ── Burn chart ──

export interface BurnPoint {
  week: number;
  weekStart: string;
  plannedCumulative: number;
  actualCumulative: number;
  eacCumulative: number;
  plannedFeeCumulative?: number;
  actualFeeCumulative?: number;
  plannedCostCumulative?: number;
  actualCostCumulative?: number;
}

export interface BurnSeries {
  projectId: string;
  includesFinancials: boolean;
  series: BurnPoint[];
}

// ── Dashboard ──

export interface MyHoursItem {
  projectId: string;
  projectName: string;
  projectCode: string;
  projectStatus: ProjectStatus;
  projectRole: string;
  currentWeek: number;
  currentWeekPlanned: number | null;
  currentWeekActual: number | null;
  currentWeekLocked: boolean;
  unfilledWeeks: number;
  totalPlanned: number;
  totalActual: number;
}

export interface ProjectHealthRow {
  id: string;
  name: string;
  projectCode: string;
  status: ProjectStatus;
  account: AccountLite;
  owningBu: BusinessUnitLite;
  startDate: string;
  endDate: string;
  resourceCount: number;
  totalPlannedHours: number;
  totalActualHours: number;
  eacHours: number;
  overrunPct: number;
  hoursDriftPct?: number | null;
  totalFee?: number;
  totalCost?: number;
  marginPct?: number;
  actualMarginPct?: number;
  adjustedFee?: number;
}

export interface AccountOverviewRow {
  id: string;
  name: string;
  code: string;
  projectCount: number;
  projects: Array<{
    id: string;
    name: string;
    projectCode: string;
    status: ProjectStatus;
    totalFee?: number;
    totalCost?: number;
    marginPct?: number;
    actualMarginPct?: number;
    totalPlannedHours: number;
    totalActualHours: number;
  }>;
}

export interface BuHealthTrajectoryPoint {
  month: string; // "2026-01"
  headcount: number;
  headcountTarget: number | null;
  revenue?: number;
  profit?: number;
  revenueTarget?: number | null;
  profitTarget?: number | null;
}

export interface BuHealth {
  businessUnit: BusinessUnitLite | null;
  headcount: { active: number; target: number | null };
  atRiskProjectCount: number;
  totalProjects: number;
  trajectory: BuHealthTrajectoryPoint[];
  revenueYtd?: number;
  revenueTarget?: number | null;
  revenueAttainmentPct?: number | null;
  actualMarginPct?: number;
  projectedMarginPct?: number;
  marginTargetPct?: number;
}

export interface PlatformAdminInfo {
  userCount: number;
  activeUserCount: number;
  domainCount: number;
  buCount: number;
  accountCount: number;
  recentAudit: Array<{
    id: string;
    entityType: string;
    entityId: string;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    changedAt: string;
    changedBy: UserLite | null;
  }>;
}

export interface Dashboard {
  user: {
    id: string;
    name: string;
    email: string;
    roles: Role[];
    primaryBuId: string;
  };
  sections: DashboardSection[];
  myHours?: MyHoursItem[];
  projectHealth?: ProjectHealthRow[];
  accountOverview?: { accounts: AccountOverviewRow[] };
  buHealth?: BuHealth;
  platformAdmin?: PlatformAdminInfo;
}

// ── Misc ──

export interface DomainsResponse {
  domains: string[];
}

// ═══════════════════════════════════════════════════════════════
// Admin console (Drop 4b)
// ═══════════════════════════════════════════════════════════════

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  projectRoles: string[];
  primaryBu: { code: string; name: string } | null;
  financialAccess: boolean;
  costRate: number | null;
  isActive: boolean;
  status: "active" | "pending" | "deactivated";
  createdAt: string;
  managedAccounts: AccountLite[];
  projectCount: number;
}

export interface AdminBusinessUnit {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  userCount: number;
  projectCount: number;
  bul: { id: string; name: string } | null;
}

export interface AdminAccount {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  projectCount: number;
  managers: UserLite[];
}

export interface AdminDomain {
  id: string;
  domain: string;
  addedBy: string;
  addedAt: string;
  activeUsers: number;
}

// ── Invite creation response (returned from admin POST) ──

export interface InviteCreatedResponse {
  message: string;
  email: string;
  token: string;
  acceptUrl: string;
  expiresAt: string;
}

/** GET /api/projects/:id/baseline-comparison */
export interface BaselineComparison {
  capturedAt: string;
  baseline: { startDate: string; endDate: string; contingencyPct: number };
  totals: {
    baselineHours: number;
    currentHours: number;
    hoursDriftPct: number | null;
    baselineFee?: number;
    currentFee?: number;
    baselineCost?: number;
    currentCost?: number;
    baselineMarginPct?: number;
    currentMarginPct?: number;
  };
  rows: Array<{
    userId: string;
    name: string;
    projectRole: string;
    baselineHours: number;
    currentHours: number;
    deltaHours: number;
    change: "added" | "removed" | "kept";
  }>;
}
