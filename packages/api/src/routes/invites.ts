import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { acceptInviteSchema } from "../utils/validation";
import { generateTOTPSecret, encryptSecret } from "../utils/totp";
import { mfaEnabled } from "../lib/mfa";
import { logChange } from "../services/auditLog";

/**
 * Invite Routes — PUBLIC
 *
 * No requireAuth middleware: the invite link is the authentication.
 * Token gives the bearer permission to claim exactly one account. Tokens
 * expire after 7 days (see admin.ts invite creation).
 */

const router = Router();

/**
 * GET /api/invites/:token
 * Resolve an invite token to its context so the frontend can render the
 * accept form with pre-filled email + inviter attribution.
 *
 * 404 — token unknown
 * 410 — expired or already accepted
 */
router.get("/:token", async (req: Request, res: Response) => {
  const invite = await prisma.userInvite.findUnique({
    where: { token: req.params.token },
    include: {
      bu: { select: { id: true, code: true, name: true } },
      invitedByUser: { select: { id: true, name: true, email: true } },
    },
  });

  if (!invite) return res.status(404).json({ error: "Invite not found" });
  if (invite.acceptedAt) {
    return res.status(410).json({ error: "This invitation has already been used" });
  }
  if (invite.expiresAt < new Date()) {
    return res.status(410).json({ error: "This invitation has expired" });
  }

  res.json({
    email: invite.email,
    name: invite.name,
    projectRole: invite.projectRole,
    roles: invite.roles,
    bu: invite.bu,
    invitedBy: invite.invitedByUser,
    expiresAt: invite.expiresAt,
  });
});

/**
 * POST /api/invites/:token/accept
 * Create a user account from the invite and start the MFA-setup flow. The
 * invite is atomically marked accepted; if anything fails the new user row
 * is rolled back so the token remains valid.
 *
 * Returns a payload matching /api/auth/register so the frontend can reuse
 * the MFA setup screen unchanged.
 */
router.post("/:token/accept", async (req: Request, res: Response) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const invite = await prisma.userInvite.findUnique({
    where: { token: req.params.token },
  });

  if (!invite) return res.status(404).json({ error: "Invite not found" });
  if (invite.acceptedAt) {
    return res.status(410).json({ error: "This invitation has already been used" });
  }
  if (invite.expiresAt < new Date()) {
    return res.status(410).json({ error: "This invitation has expired" });
  }

  // A pending user was created when the invite was issued; activating that row
  // is the normal path. Only block if a *real* (already-activated) account
  // exists — e.g. someone signed up directly in the meantime.
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing && existing.isActive) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  // When MFA is enabled, generate the TOTP secret up front so we can return it
  // in the response — same shape as /api/auth/register, so the frontend reuses
  // its MFA setup screen without a code fork. When disabled, skip it: the user
  // is created with no secret and logged straight in.
  const totp = mfaEnabled() ? generateTOTPSecret(invite.email) : null;
  const encryptedSecret = totp ? encryptSecret(totp.secret) : null;

  try {
    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Normal path: activate the pending user created at invite time (preserves
      // any role/BU edits an admin made since). Fallback: if that row is gone
      // (e.g. the invite/user was deleted), create the account fresh.
      const created = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: parsed.data.name,
              passwordHash,
              isActive: true,
              totpSecret: encryptedSecret,
            },
          })
        : await tx.user.create({
            data: {
              email: invite.email,
              name: parsed.data.name,
              passwordHash,
              roles: invite.roles,
              projectRoles: invite.projectRole ? [invite.projectRole] : [],
              primaryBuId: invite.buId,
              totpSecret: encryptedSecret,
            },
          });

      // Consume the invite. Mark as accepted rather than deleting so the
      // audit trail shows who accepted when.
      await tx.userInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return created;
    });

    await logChange({
      entityType: "User",
      entityId: user.id,
      field: "created",
      oldValue: null,
      newValue: `invite:${invite.id}`,
      changedBy: invite.invitedBy,
    });

    if (!totp) {
      // MFA temporarily disabled: log the invitee straight in.
      req.session.userId = user.id;
      logger.info(
        { userId: user.id, email: invite.email, inviteId: invite.id },
        "Invite accepted (MFA disabled)"
      );
      return res.status(201).json({
        status: "authenticated",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          roles: user.roles,
          projectRoles: user.projectRoles,
        },
      });
    }

    // Arm the MFA-pending flag so the client can go straight to the TOTP
    // setup screen with a session in-flight (same as /auth/login's
    // mfa_setup_required path).
    req.session.mfaPending = true;
    req.session.mfaPendingUserId = user.id;

    logger.info(
      { userId: user.id, email: invite.email, inviteId: invite.id },
      "Invite accepted"
    );

    res.status(201).json({
      status: "mfa_setup_required",
      mfaSetup: { qrUri: totp.uri, manualKey: totp.secret },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        projectRoles: user.projectRoles,
      },
    });
  } catch (err) {
    logger.error({ err, inviteId: invite.id }, "Invite acceptance failed");
    res.status(500).json({ error: "Failed to accept invitation" });
  }
});

export default router;
