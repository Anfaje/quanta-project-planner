import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { getDashboardSections } from "../lib/permissions";

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
  });
});

export default router;
