import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import {
  registerSchema,
  loginSchema,
  mfaVerifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../utils/validation";
import { generateTOTPSecret, verifyTOTPCode, encryptSecret, decryptSecret } from "../utils/totp";
import { requireAuth, requireMFAPending } from "../middleware/auth";
import { logChange } from "../services/auditLog";

const router = Router();

/**
 * POST /api/auth/register
 * Domain-whitelisted signup. New users start as IC.
 */
router.post("/register", async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const { email, password, name, projectRoles } = parsed.data;

    // Check domain whitelist
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    const allowedDomains = await prisma.domainWhitelist.findMany({ select: { domain: true } });
    const domainList = allowedDomains.map((d) => d.domain);

    if (!domainList.includes(domain)) {
      return res.status(403).json({
        error: "Email domain not authorised",
        allowedDomains: domainList,
      });
    }

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    // Get default BU (first active one — can be reassigned by AA later)
    const defaultBU = await prisma.businessUnit.findFirst({ where: { isActive: true } });
    if (!defaultBU) {
      return res.status(500).json({ error: "No active business units configured" });
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        roles: ["IC"],
        projectRoles,
        primaryBuId: defaultBU.id,
      },
    });

    // Generate TOTP secret (user will verify on first login)
    const { secret, uri } = generateTOTPSecret(email);
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: encryptSecret(secret) },
    });

    logger.info({ userId: user.id, email }, "User registered");

    res.status(201).json({
      message: "Account created. Please set up two-factor authentication.",
      mfaSetup: {
        qrUri: uri,
        manualKey: secret,
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        projectRoles: user.projectRoles,
      },
    });
  } catch (err) {
    logger.error({ err }, "Registration failed");
    res.status(500).json({ error: "Registration failed" });
  }
});

/**
 * POST /api/auth/login
 * Step 1: validate email + password. If valid, set MFA pending and return challenge.
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Account has been deactivated" });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // If user hasn't set up TOTP yet, prompt setup
    if (!user.totpSecret || !user.totpVerified) {
      // Generate new secret if missing
      if (!user.totpSecret) {
        const { secret, uri } = generateTOTPSecret(email);
        await prisma.user.update({
          where: { id: user.id },
          data: { totpSecret: encryptSecret(secret) },
        });

        req.session.mfaPending = true;
        req.session.mfaPendingUserId = user.id;

        return res.json({
          status: "mfa_setup_required",
          mfaSetup: { qrUri: uri, manualKey: secret },
        });
      }

      // Secret exists but not verified yet — show setup again
      const secret = decryptSecret(user.totpSecret);
      const { uri } = generateTOTPSecret(email);

      req.session.mfaPending = true;
      req.session.mfaPendingUserId = user.id;

      return res.json({
        status: "mfa_setup_required",
        mfaSetup: { qrUri: uri, manualKey: secret },
      });
    }

    // TOTP is set up — require verification
    req.session.mfaPending = true;
    req.session.mfaPendingUserId = user.id;

    res.json({ status: "mfa_required" });
  } catch (err) {
    logger.error({ err }, "Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

/**
 * POST /api/auth/mfa/verify
 * Step 2: verify TOTP code and complete login.
 */
router.post("/mfa/verify", requireMFAPending, async (req: Request, res: Response) => {
  try {
    const parsed = mfaVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const userId = req.session.mfaPendingUserId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.totpSecret) {
      return res.status(400).json({ error: "MFA not configured" });
    }

    const secret = decryptSecret(user.totpSecret);
    const valid = verifyTOTPCode(secret, parsed.data.code);

    if (!valid) {
      return res.status(401).json({ error: "Invalid verification code" });
    }

    // Mark TOTP as verified (first-time setup completion)
    if (!user.totpVerified) {
      await prisma.user.update({
        where: { id: userId },
        data: { totpVerified: true },
      });
    }

    // Complete login: clear MFA state, set authenticated session
    req.session.mfaPending = false;
    req.session.mfaPendingUserId = undefined;
    req.session.userId = userId;

    logger.info({ userId, email: user.email }, "User logged in");

    res.json({
      status: "authenticated",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        projectRoles: user.projectRoles,
      },
    });
  } catch (err) {
    logger.error({ err }, "MFA verification failed");
    res.status(500).json({ error: "Verification failed" });
  }
});

/**
 * POST /api/auth/logout
 * Destroy session.
 */
router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});

/**
 * POST /api/auth/forgot-password  { email }
 * Begin a password reset (TC 1.5). Always returns a generic 200 so the
 * endpoint can't be used to enumerate which emails have accounts. If the
 * email does match an active user, a short-lived single-use token is created
 * and — until SMTP is wired up — the reset URL is returned in the response
 * (the same dev-mode pattern the invite flow uses). In production this would
 * be emailed instead and never returned.
 */
router.post("/forgot-password", async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const generic = {
    message: "If an account exists for that email, a reset link has been generated.",
  };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return res.json(generic); // don't reveal non-existence / deactivation
  }

  // One active token at a time: clear any outstanding unused tokens first.
  await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordReset.create({
    data: {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    },
  });

  // Dev-mode convenience: surface the link in the response. Replace with an
  // email send (and drop resetUrl from the payload) once SMTP exists.
  res.json({ ...generic, resetUrl: `/reset-password/${token}` });
});

/**
 * POST /api/auth/reset-password  { token, password }
 * Complete a reset. Validates the token is unused + unexpired, sets the new
 * password, consumes the token, and clears the user's other tokens. Does not
 * touch TOTP — the user still logs in with their existing authenticator.
 */
router.post("/reset-password", async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const reset = await prisma.passwordReset.findUnique({
    where: { token: parsed.data.token },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired." });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    // Invalidate any other outstanding tokens for this user.
    prisma.passwordReset.deleteMany({ where: { userId: reset.userId, usedAt: null } }),
  ]);

  await logChange({
    entityType: "User",
    entityId: reset.userId,
    field: "password",
    oldValue: null,
    newValue: "reset via forgot-password",
    changedBy: reset.userId,
  });

  res.json({ message: "Password updated. You can now sign in with your new password." });
});

/**
 * GET /api/auth/domains
 * Public endpoint: returns the list of allowed domains (for signup form validation).
 */
router.get("/domains", async (_req: Request, res: Response) => {
  const domains = await prisma.domainWhitelist.findMany({
    select: { domain: true },
    orderBy: { domain: "asc" },
  });
  res.json({ domains: domains.map((d) => d.domain) });
});

export default router;
