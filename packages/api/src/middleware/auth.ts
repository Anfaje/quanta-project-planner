import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { AuthUser } from "../types";

/**
 * Load the authenticated user from the session and attach to req.authUser.
 * This runs on every request. If no session, req.authUser remains undefined.
 */
export async function loadAuthUser(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.session.userId && !req.session.mfaPending) {
      const user = await prisma.user.findUnique({
        where: { id: req.session.userId },
        include: {
          managedAccounts: { select: { accountId: true } },
        },
      });

      if (user && user.isActive) {
        req.authUser = {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          projectRoles: user.projectRoles,
          primaryBuId: user.primaryBuId,
          financialAccess: user.financialAccess,
          isActive: user.isActive,
          managedAccountIds: user.managedAccounts.map((m) => m.accountId),
        };
      }
    }
  } catch (err) {
    // If user loading fails, proceed without auth (will be caught by requireAuth)
  }
  next();
}

/**
 * Require an authenticated user. Returns 401 if not logged in.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

/**
 * Require that the user holds at least one of the specified roles.
 * Returns 403 if the user's role set doesn't include any of the required roles.
 *
 * Usage: requireRoles(Role.PM, Role.AC, Role.BUL)
 * The user needs at least ONE of these roles (not all).
 */
export function requireRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const hasRole = roles.some((r) => req.authUser!.roles.includes(r));
    if (!hasRole) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: roles,
        current: req.authUser.roles,
      });
    }
    next();
  };
}

/**
 * Require that the MFA challenge is pending (for the /mfa/verify endpoint).
 */
export function requireMFAPending(req: Request, res: Response, next: NextFunction) {
  if (!req.session.mfaPending || !req.session.mfaPendingUserId) {
    return res.status(400).json({ error: "No MFA challenge pending" });
  }
  next();
}
