import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { getDashboardSections } from "../lib/permissions";
import { updateMeSchema, changePasswordSchema } from "../utils/validation";
import { logChange } from "../services/auditLog";

const router = Router();

/**
 * GET /api/me
 * Returns the authenticated user's full context.
 * The frontend uses this to render the adaptive dashboard.
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  const user = req.authUser!;

  // Fetch primary BU details
  const bu = await prisma.businessUnit.findUnique({
    where: { id: user.primaryBuId },
    select: { id: true, code: true, name: true },
  });

  // Fetch managed accounts (for AC role holders)
  let managedAccounts: Array<{ id: string; name: string; code: string }> = [];
  if (user.managedAccountIds.length > 0) {
    managedAccounts = await prisma.account.findMany({
      where: { id: { in: user.managedAccountIds } },
      select: { id: true, name: true, code: true },
    });
  }

  // Compute dashboard sections
  const dashboardSections = getDashboardSections(user);

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles,
    projectRoles: user.projectRoles,
    primaryBu: bu,
    financialAccess: user.financialAccess,
    managedAccounts,
    dashboardSections,
    grants: user.grants,
  });
});

/**
 * PATCH /api/me
 * Self-service profile update. Only the display name + preferred project-role
 * labels — system roles, financial access, and BU are admin-only and can't be
 * set here.
 */
router.patch("/", requireAuth, async (req: Request, res: Response) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const data: { name?: string; projectRoles?: string[] } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.projectRoles !== undefined) data.projectRoles = parsed.data.projectRoles;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }

  const updated = await prisma.user.update({
    where: { id: req.authUser!.id },
    data,
    select: { id: true, name: true, projectRoles: true },
  });

  await logChange({
    entityType: "User",
    entityId: updated.id,
    field: "profile",
    oldValue: null,
    newValue: "updated via account settings",
    changedBy: updated.id,
  });

  res.json(updated);
});

/**
 * POST /api/me/change-password
 * Verify the current password, then set a new one. Does not touch TOTP — the
 * user keeps their existing authenticator.
 */
router.post("/change-password", requireAuth, async (req: Request, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.authUser!.id },
    select: { id: true, passwordHash: true },
  });
  if (!user || !user.passwordHash) {
    return res.status(400).json({ error: "Password cannot be changed for this account" });
  }

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  await logChange({
    entityType: "User",
    entityId: user.id,
    field: "password",
    oldValue: null,
    newValue: "changed via account settings",
    changedBy: user.id,
  });

  res.json({ message: "Password updated" });
});

export default router;
