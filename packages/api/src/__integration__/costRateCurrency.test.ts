import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import {
  setupTestApp,
  teardownTestApp,
  resetMutableTables,
  seedUser,
  authenticateAs,
  getDefaultBu,
  TEST_DOMAIN,
} from "./helpers";

/**
 * Standing cost rates carry a currency (default USD). Editable by AA
 * anywhere and BUL for their own BU — the default capability — widened by
 * the grants overlay: manage_users@BU covers that BU's users.
 */

let app: Express;
let prisma: PrismaClient;

beforeAll(async () => {
  ({ app, prisma } = await setupTestApp());
});

afterAll(async () => {
  await teardownTestApp(prisma);
});

beforeEach(async () => {
  await resetMutableTables(prisma);
});

describe("cost rate with currency", () => {
  it("AA sets rate + currency; the directory reflects both", async () => {
    const bu = await getDefaultBu(prisma);
    const ic = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const aaAgent = await authenticateAs(app, `aa@${TEST_DOMAIN}`);

    const put = await aaAgent
      .put(`/api/admin/users/${ic.id}/cost-rate`)
      .send({ costRate: 750, currency: "DKK" })
      .expect(200);
    expect(put.body.costRate).toBe(750);
    expect(put.body.costRateCurrency).toBe("DKK");

    const list = await aaAgent.get("/api/admin/users").expect(200);
    const row = list.body.users.find((u: { id: string }) => u.id === ic.id);
    expect(row.costRate).toBe(750);
    expect(row.costRateCurrency).toBe("DKK");

    // Omitting currency keeps the existing one.
    const put2 = await aaAgent
      .put(`/api/admin/users/${ic.id}/cost-rate`)
      .send({ costRate: 800 })
      .expect(200);
    expect(put2.body.costRateCurrency).toBe("DKK");
  });

  it("BUL sets rates in their own BU; cross-BU and PM are refused; bad currency is 400", async () => {
    const bu = await getDefaultBu(prisma);
    const otherBu = await prisma.businessUnit.upsert({
      where: { code: "ZZ-CRC" },
      update: {},
      create: { code: "ZZ-CRC", name: "Other BU (cost currency)" },
    });
    const bul = await seedUser(prisma, { buId: bu.id, roles: ["BUL"] });
    const inBu = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const outBu = await seedUser(prisma, { buId: otherBu.id, roles: ["IC"] });
    const bulAgent = await authenticateAs(app, bul.email);

    await bulAgent
      .put(`/api/admin/users/${inBu.id}/cost-rate`)
      .send({ costRate: 95, currency: "EUR" })
      .expect(200);
    await bulAgent
      .put(`/api/admin/users/${outBu.id}/cost-rate`)
      .send({ costRate: 95, currency: "EUR" })
      .expect(403);
    await bulAgent
      .put(`/api/admin/users/${inBu.id}/cost-rate`)
      .send({ costRate: 95, currency: "JPY" })
      .expect(400);

    const pm = await seedUser(prisma, { buId: bu.id, roles: ["PM"] });
    const pmAgent = await authenticateAs(app, pm.email);
    await pmAgent
      .put(`/api/admin/users/${inBu.id}/cost-rate`)
      .send({ costRate: 95, currency: "EUR" })
      .expect(403);
  });

  it("a manage_users @ BU grantee sets rates for that BU's users (grants widen the default)", async () => {
    const bu = await getDefaultBu(prisma);
    const editor = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    await prisma.permissionGrant.create({
      data: {
        userId: editor.id,
        permission: "manage_users" as never,
        scopeType: "business_unit" as never,
        scopeId: bu.id,
      },
    });
    const target = await seedUser(prisma, { buId: bu.id, roles: ["IC"] });
    const agent = await authenticateAs(app, editor.email);

    const put = await agent
      .put(`/api/admin/users/${target.id}/cost-rate`)
      .send({ costRate: 640, currency: "GBP" })
      .expect(200);
    expect(put.body.costRateCurrency).toBe("GBP");
  });
});
