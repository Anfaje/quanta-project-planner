import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { requireAuth, requireRoles } from "../middleware/auth";
import { updateRolesSchema, domainSchema, inviteSchema, updateCostRateSchema } from "../utils/validation";
import { logChanges, diffFields } from "../services/auditLog";

const router = Router();

// All admin routes require authentication
router.use(requireAuth);

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/users
 * BUL: sees own BU's users. AA: sees all.
 */
// Read access spans the roles that can create projects (see canCreateProject):
// the project-creation wizard loads the user, BU, and account lists from these
// admin read endpoints. The write endpoints below stay AA-only (BU/account
// management is admin-only); only the reads are opened up.
router.get("/users", requireRoles(Role.PM, Role.BUL, Role.AC, Role.AA), async (req: Request, res: Response) => {
  const user = req.authUser!;
  const isBULOnly = user.roles.includes(Role.BUL) && !user.roles.includes(Role.AA);

  const where = isBULOnly ? { primaryBuId: user.primaryBuId } : {};

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      roles: true,
      projectRoles: true,
      primaryBuId: true,
      financialAccess: true,
      costRate: true,
      isActive: true,
      createdAt: true,
      primaryBu: { select: { code: true, name: true } },
      managedAccounts: {
        select: { account: { select: { id: true, name: true, code: true } } },
      },
      _count: { select: { assignments: true } },
    },
    orderBy: { name: "asc" },
  });

  const result = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    roles: u.roles,
    projectRoles: u.projectRoles,
    primaryBu: u.primaryBu,
    financialAccess: u.financialAccess,
    costRate: u.costRate != null ? Number(u.costRate) : null,
    isActive: u.isActive,
    createdAt: u.createdAt,
    managedAccounts: u.managedAccounts.map((m) => m.account),
    projectCount: u._count.assignments,
  }));

  res.json({ users: result });
});

/**
 * PUT /api/admin/users/:id/cost-rate
 * Set a user's standing fully-loaded cost rate (loaded salary + overhead).
 * BUL: own-BU users only. AA: anyone. New projects snapshot this value;
 * existing projects keep the rate captured when they were created.
 */
router.put("/users/:id/cost-rate", requireRoles(Role.BUL, Role.AA), async (req: Request, res: Response) => {
  const actor = req.authUser!;
  const parsed = updateCostRateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const target = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, primaryBuId: true, costRate: true },
  });
  if (!target) return res.status(404).json({ error: "User not found" });

  // BUL may only set cost rates for users in their own business unit.
  const isBULOnly = actor.roles.includes(Role.BUL) && !actor.roles.includes(Role.AA);
  if (isBULOnly && target.primaryBuId !== actor.primaryBuId) {
    return res
      .status(403)
      .json({ error: "You can only set cost rates for users in your own business unit" });
  }

  const newRate = parsed.data.costRate;
  await prisma.user.update({ where: { id: target.id }, data: { costRate: newRate } });

  await logChanges("User", target.id, actor.id, [
    {
      field: "cost_rate",
      oldValue: target.costRate != null ? target.costRate.toString() : null,
      newValue: newRate != null ? String(newRate) : null,
    },
  ]);
  logger.info({ targetUser: target.id, actor: actor.id, costRate: newRate }, "Cost rate updated");

  res.json({ id: target.id, costRate: newRate });
});

/**
 * PUT /api/admin/users/:id/roles
 * AA only: update a user's roles, financial flag, managed accounts, BU.
 */
router.put("/users/:id/roles", requireRoles(Role.AA), async (req: Request, res: Response) => {
  try {
    const parsed = updateRolesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const targetId = req.params.id;
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      include: { managedAccounts: true },
    });

    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }

    const { roles, financialAccess, managedAccountIds, primaryBuId } = parsed.data;

    // Build audit trail
    const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];

    if (JSON.stringify(target.roles.sort()) !== JSON.stringify(roles.sort())) {
      changes.push({
        field: "roles",
        oldValue: JSON.stringify(target.roles),
        newValue: JSON.stringify(roles),
      });
    }

    if (financialAccess !== undefined && target.financialAccess !== financialAccess) {
      changes.push({
        field: "financial_access",
        oldValue: String(target.financialAccess),
        newValue: String(financialAccess),
      });
    }

    if (primaryBuId && target.primaryBuId !== primaryBuId) {
      changes.push({
        field: "primary_bu_id",
        oldValue: target.primaryBuId,
        newValue: primaryBuId,
      });
    }

    // Update user
    const updateData: any = { roles };
    if (financialAccess !== undefined) updateData.financialAccess = financialAccess;
    if (primaryBuId) updateData.primaryBuId = primaryBuId;

    await prisma.user.update({
      where: { id: targetId },
      data: updateData,
    });

    // Update managed accounts if AC role is in the set and account IDs provided
    if (managedAccountIds !== undefined) {
      const oldAccountIds = target.managedAccounts.map((m) => m.accountId).sort();
      const newAccountIds = [...managedAccountIds].sort();

      if (JSON.stringify(oldAccountIds) !== JSON.stringify(newAccountIds)) {
        changes.push({
          field: "managed_accounts",
          oldValue: JSON.stringify(oldAccountIds),
          newValue: JSON.stringify(newAccountIds),
        });

        // Delete removed, add new
        await prisma.accountManager.deleteMany({ where: { userId: targetId } });
        if (roles.includes(Role.AC) && managedAccountIds.length > 0) {
          await prisma.accountManager.createMany({
            data: managedAccountIds.map((accountId) => ({
              userId: targetId,
              accountId,
            })),
          });
        }
      }
    }

    // If AC was removed from roles, clean up managed accounts
    if (!roles.includes("AC" as Role)) {
      const existingManagedAccounts = await prisma.accountManager.findMany({
        where: { userId: targetId },
      });
      if (existingManagedAccounts.length > 0) {
        await prisma.accountManager.deleteMany({ where: { userId: targetId } });
        changes.push({
          field: "managed_accounts",
          oldValue: JSON.stringify(existingManagedAccounts.map((m) => m.accountId)),
          newValue: "[]",
        });
      }
    }

    // Write audit log
    if (changes.length > 0) {
      await logChanges("User", targetId, req.authUser!.id, changes);
    }

    logger.info({ targetId, changes, actor: req.authUser!.id }, "User roles updated");
    res.json({ message: "User updated", changes });
  } catch (err) {
    logger.error({ err }, "Failed to update user roles");
    res.status(500).json({ error: "Failed to update user" });
  }
});

/**
 * PUT /api/admin/users/:id/deactivate
 */
router.put("/users/:id/deactivate", requireRoles(Role.BUL, Role.AA), async (req: Request, res: Response) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "User not found" });

  // BUL can only deactivate users in their BU
  if (req.authUser!.roles.includes(Role.BUL) && !req.authUser!.roles.includes(Role.AA)) {
    if (target.primaryBuId !== req.authUser!.primaryBuId) {
      return res.status(403).json({ error: "Can only deactivate users in your BU" });
    }
  }

  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
  await logChanges("User", req.params.id, req.authUser!.id, [
    { field: "is_active", oldValue: "true", newValue: "false" },
  ]);

  res.json({ message: "User deactivated" });
});

/**
 * PUT /api/admin/users/:id/reactivate
 */
router.put("/users/:id/reactivate", requireRoles(Role.BUL, Role.AA), async (req: Request, res: Response) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: true } });
  await logChanges("User", req.params.id, req.authUser!.id, [
    { field: "is_active", oldValue: "false", newValue: "true" },
  ]);
  res.json({ message: "User reactivated" });
});

/**
 * POST /api/admin/users/invite
 * Creates a signed invitation. In production this would email the invitee;
 * for now the token is returned in the response so the inviter can share the
 * link manually (SMTP delivery is deferred to Drop 6).
 */
router.post("/users/invite", requireRoles(Role.BUL, Role.AA), async (req: Request, res: Response) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const { email, buId, name, projectRole, roles } = parsed.data;

  // Basic sanity: domain must be whitelisted (same rule as direct signup).
  const domain = email.split("@")[1]?.toLowerCase();
  const allowed = await prisma.domainWhitelist.findMany({ select: { domain: true } });
  if (!allowed.some((d) => d.domain === domain)) {
    return res.status(403).json({
      error: "Email domain not authorised",
      allowedDomains: allowed.map((d) => d.domain),
    });
  }

  // Can't invite someone who already has an account.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  // BU must exist and be active.
  const bu = await prisma.businessUnit.findUnique({ where: { id: buId } });
  if (!bu || !bu.isActive) {
    return res.status(400).json({ error: "Business unit not found or inactive" });
  }

  // Fresh token, 7-day expiry. Old pending invites for the same email are
  // superseded — delete them so only the latest link works.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.userInvite.deleteMany({ where: { email, acceptedAt: null } }),
    prisma.userInvite.create({
      data: {
        token,
        email,
        name,
        buId,
        projectRole,
        roles: roles ?? ["IC"],
        invitedBy: req.authUser!.id,
        expiresAt,
      },
    }),
  ]);

  logger.info(
    { email, buId, invitedBy: req.authUser!.id },
    "User invite created (email send pending SMTP wiring)"
  );

  res.status(201).json({
    message: "Invitation created",
    email,
    token,
    acceptUrl: `/invite/${token}`,
    expiresAt,
  });
});

// ═══════════════════════════════════════════════════════════════
// DOMAINS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/domains
 */
router.get("/domains", requireRoles(Role.AA), async (_req: Request, res: Response) => {
  const domains = await prisma.domainWhitelist.findMany({
    orderBy: { domain: "asc" },
    include: { addedByUser: { select: { name: true } } },
  });

  // Count active users per domain
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { email: true },
  });

  const domainCounts: Record<string, number> = {};
  users.forEach((u) => {
    const d = u.email.split("@")[1]?.toLowerCase();
    if (d) domainCounts[d] = (domainCounts[d] || 0) + 1;
  });

  const result = domains.map((d) => ({
    id: d.id,
    domain: d.domain,
    addedBy: d.addedByUser.name,
    addedAt: d.addedAt,
    activeUsers: domainCounts[d.domain] || 0,
  }));

  res.json({ domains: result });
});

/**
 * POST /api/admin/domains
 */
router.post("/domains", requireRoles(Role.AA), async (req: Request, res: Response) => {
  const parsed = domainSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const existing = await prisma.domainWhitelist.findUnique({ where: { domain: parsed.data.domain } });
  if (existing) {
    return res.status(409).json({ error: "Domain already whitelisted" });
  }

  const domain = await prisma.domainWhitelist.create({
    data: { domain: parsed.data.domain, addedBy: req.authUser!.id },
  });

  await logChanges("DomainWhitelist", domain.id, req.authUser!.id, [
    { field: "domain", oldValue: null, newValue: parsed.data.domain },
  ]);

  logger.info({ domain: parsed.data.domain, actor: req.authUser!.id }, "Domain added to whitelist");
  res.status(201).json({ message: "Domain added", domain: domain.domain });
});

/**
 * DELETE /api/admin/domains/:id
 */
router.delete("/domains/:id", requireRoles(Role.AA), async (req: Request, res: Response) => {
  const domain = await prisma.domainWhitelist.findUnique({ where: { id: req.params.id } });
  if (!domain) {
    return res.status(404).json({ error: "Domain not found" });
  }

  await prisma.domainWhitelist.delete({ where: { id: req.params.id } });
  await logChanges("DomainWhitelist", req.params.id, req.authUser!.id, [
    { field: "domain", oldValue: domain.domain, newValue: null },
  ]);

  logger.info({ domain: domain.domain, actor: req.authUser!.id }, "Domain removed from whitelist");
  res.json({ message: "Domain removed. Existing users are not affected." });
});

// ═══════════════════════════════════════════════════════════════
// BUSINESS UNITS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/bus
 */
// Wizard reference read (see the GET /users note): project creators need the BU list.
router.get("/bus", requireRoles(Role.PM, Role.BUL, Role.AC, Role.AA), async (_req: Request, res: Response) => {
  const bus = await prisma.businessUnit.findMany({
    orderBy: { code: "asc" },
    include: {
      _count: { select: { users: true, ownedProjects: true } },
      users: {
        where: { roles: { has: Role.BUL }, isActive: true },
        select: { id: true, name: true },
        take: 1,
      },
    },
  });

  const result = bus.map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    isActive: b.isActive,
    userCount: b._count.users,
    projectCount: b._count.ownedProjects,
    bul: b.users[0] || null,
  }));

  res.json({ businessUnits: result });
});

/**
 * POST /api/admin/bus
 */
router.post("/bus", requireRoles(Role.AA), async (req: Request, res: Response) => {
  const { code, name } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: "Code and name are required" });
  }

  const existing = await prisma.businessUnit.findUnique({ where: { code } });
  if (existing) {
    return res.status(409).json({ error: "BU code already exists" });
  }

  const bu = await prisma.businessUnit.create({ data: { code, name } });
  logger.info({ buId: bu.id, code, actor: req.authUser!.id }, "Business unit created");
  res.status(201).json({ businessUnit: bu });
});

/**
 * PUT /api/admin/bus/:id/deactivate
 */
router.put("/bus/:id/deactivate", requireRoles(Role.AA), async (req: Request, res: Response) => {
  await prisma.businessUnit.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ message: "Business unit deactivated" });
});

/**
 * PUT /api/admin/bus/:id/activate
 */
router.put("/bus/:id/activate", requireRoles(Role.AA), async (req: Request, res: Response) => {
  await prisma.businessUnit.update({ where: { id: req.params.id }, data: { isActive: true } });
  res.json({ message: "Business unit activated" });
});

// ═══════════════════════════════════════════════════════════════
// ACCOUNTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/accounts
 */
// Wizard reference read (see the GET /users note): project creators need the
// account list. This was AA-only, which blocked PM/BUL/AC from the wizard even
// though canCreateProject permits them.
router.get("/accounts", requireRoles(Role.PM, Role.BUL, Role.AC, Role.AA), async (_req: Request, res: Response) => {
  const accounts = await prisma.account.findMany({
    orderBy: { name: "asc" },
    include: {
      managers: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { projects: true } },
    },
  });

  const result = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    isActive: a.isActive,
    projectCount: a._count.projects,
    managers: a.managers.map((m) => m.user),
  }));

  res.json({ accounts: result });
});

/**
 * POST /api/admin/accounts
 */
router.post("/accounts", requireRoles(Role.AA), async (req: Request, res: Response) => {
  const { name, code } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: "Name and code are required" });
  }

  const existing = await prisma.account.findUnique({ where: { code } });
  if (existing) {
    return res.status(409).json({ error: "Account code already exists" });
  }

  const account = await prisma.account.create({ data: { name, code: code.toUpperCase() } });
  logger.info({ accountId: account.id, code, actor: req.authUser!.id }, "Account created");
  res.status(201).json({ account });
});

/**
 * PUT /api/admin/accounts/:id/deactivate
 */
router.put("/accounts/:id/deactivate", requireRoles(Role.AA), async (req: Request, res: Response) => {
  await prisma.account.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ message: "Account deactivated" });
});

export default router;
