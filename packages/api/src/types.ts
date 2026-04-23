import { Role } from "@prisma/client";

// Extend Express session with our user data
declare module "express-session" {
  interface SessionData {
    userId?: string;
    mfaPending?: boolean;        // true after password OK, before TOTP verified
    mfaPendingUserId?: string;   // user ID waiting for MFA
  }
}

// The authenticated user object attached to req
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  projectRoles: string[];
  primaryBuId: string;
  financialAccess: boolean;
  isActive: boolean;
  managedAccountIds: string[];   // populated for AC role holders
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

// Capability actions the resolver can check
export type Action =
  | "logHours"
  | "viewOwnHours"
  | "viewTeamHours"
  | "createProject"
  | "manageProject"
  | "viewBillRates"
  | "viewFinancials"
  | "adminBU"
  | "adminUsers"
  | "adminPlatform"
  | "manageDomains"
  | "manageAccounts";

// Resource context for scoped checks
export interface ResourceContext {
  projectId?: string;
  projectAccountId?: string;
  projectOwningBuId?: string;
  projectSharedBuIds?: string[];
}
