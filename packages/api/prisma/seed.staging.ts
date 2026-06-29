import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Minimal staging seed: exactly ONE user (afh@trifork.com) plus the smallest
 * supporting data the app needs to function:
 *   - one business unit (a user must have a primary BU)
 *   - one account (so projects can be created immediately)
 *   - the trifork.com domain whitelisted (so teammates can be invited later)
 *
 * afh is given AA + BUL + IC so a single person can exercise everything during
 * alpha: admin (users / BUs / accounts / domains), create + activate + manage
 * projects, see financials, and be assignable + log hours.
 *
 * Initial password comes from SEED_ADMIN_PASSWORD, falling back to a default
 * you should change on first login. Re-running refreshes access (roles, BU,
 * active) but will NOT reset a password that's already been changed.
 *
 * Run against the staging DB only, e.g.:
 *   fly ssh console -a quanta-api-staging -C "npm run db:seed:staging"
 */
async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD ?? "Trifork-staging-changeme";
  const passwordHash = await bcrypt.hash(password, 12);

  const bu = await prisma.businessUnit.upsert({
    where: { code: "DK-AAR-TRI" },
    update: {},
    create: { code: "DK-AAR-TRI", name: "Trifork Aarhus" },
  });

  await prisma.account.upsert({
    where: { code: "ALPHA" },
    update: {},
    create: { name: "Alpha Account", code: "ALPHA" },
  });

  const afh = await prisma.user.upsert({
    where: { email: "afh@trifork.com" },
    update: {
      roles: [Role.AA, Role.BUL, Role.IC],
      financialAccess: true,
      primaryBuId: bu.id,
      isActive: true,
    },
    create: {
      email: "afh@trifork.com",
      name: "AFH",
      passwordHash,
      roles: [Role.AA, Role.BUL, Role.IC],
      projectRoles: ["PM"],
      primaryBuId: bu.id,
      financialAccess: true,
    },
  });

  await prisma.domainWhitelist.upsert({
    where: { domain: "trifork.com" },
    update: {},
    create: { domain: "trifork.com", addedBy: afh.id },
  });

  const usingDefault = !process.env.SEED_ADMIN_PASSWORD;
  console.log("✅ Staging seed complete.");
  console.log("   User:    afh@trifork.com  (roles: AA, BUL, IC)");
  console.log(`   BU:      ${bu.code}  ·  Account: ALPHA`);
  console.log(
    usingDefault
      ? `   Password: ${password}  ← change this on first login`
      : "   Password: (from SEED_ADMIN_PASSWORD)"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
