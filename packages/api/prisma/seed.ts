import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Quanta database...\n");

  // ── Domain Whitelist ──
  // (created after first AA user exists)

  // ── Business Units ──
  const bus = await Promise.all([
    prisma.businessUnit.upsert({ where: { code: "US-ORD-OWLS" }, update: {}, create: { code: "US-ORD-OWLS", name: "Chicago Owls" } }),
    prisma.businessUnit.upsert({ where: { code: "DK-AAR-PANDA" }, update: {}, create: { code: "DK-AAR-PANDA", name: "Aarhus Panda" } }),
    prisma.businessUnit.upsert({ where: { code: "US-CA-SE" }, update: {}, create: { code: "US-CA-SE", name: "California SE" } }),
    prisma.businessUnit.upsert({ where: { code: "EU-BER-FOXES" }, update: {}, create: { code: "EU-BER-FOXES", name: "Berlin Foxes" } }),
  ]);
  console.log(`✅ ${bus.length} Business Units`);

  const buMap: Record<string, string> = {};
  bus.forEach(b => { buMap[b.code] = b.id; });

  // ── Accounts ──
  const accounts = await Promise.all([
    prisma.account.upsert({ where: { code: "MER" }, update: {}, create: { name: "Meridian Corp", code: "MER" } }),
    prisma.account.upsert({ where: { code: "PIN" }, update: {}, create: { name: "Pinnacle Tech", code: "PIN" } }),
    prisma.account.upsert({ where: { code: "LUM" }, update: {}, create: { name: "Lumen Group", code: "LUM" } }),
    prisma.account.upsert({ where: { code: "APX" }, update: {}, create: { name: "Apex Industries", code: "APX" } }),
  ]);
  console.log(`✅ ${accounts.length} Accounts`);

  const acctMap: Record<string, string> = {};
  accounts.forEach(a => { acctMap[a.code] = a.id; });

  // ── Users ──
  const pw = await bcrypt.hash("quanta123", 12);

  const userData = [
    // AA + IC (platform admin)
    { email: "sarah@trifork.com", name: "Sarah Kim", roles: [Role.AA, Role.IC], bu: "US-ORD-OWLS", projectRoles: ["PM"], financialAccess: true },
    // BUL + PM + IC
    { email: "sara@trifork.com", name: "Sara Olsen", roles: [Role.BUL, Role.PM, Role.IC], bu: "US-ORD-OWLS", projectRoles: ["UX Lead"], financialAccess: false },
    // AC + PM + IC
    { email: "lena@trifork.com", name: "Lena Kowalski", roles: [Role.AC, Role.PM, Role.IC], bu: "DK-AAR-PANDA", projectRoles: ["PM"], financialAccess: false },
    // PM + IC
    { email: "jonas@trifork.com", name: "Jonas Berg", roles: [Role.PM, Role.IC], bu: "DK-AAR-PANDA", projectRoles: ["Designer"], financialAccess: false },
    { email: "tom@spantree.com", name: "Tom Nguyen", roles: [Role.PM, Role.IC], bu: "US-ORD-OWLS", projectRoles: ["Full Stack"], financialAccess: false },
    { email: "kai@trifork.com", name: "Kai Tanaka", roles: [Role.PM, Role.IC], bu: "US-CA-SE", projectRoles: ["ML Engineer"], financialAccess: false },
    // IC only
    { email: "maya@trifork.com", name: "Maya Chen", roles: [Role.IC], bu: "US-ORD-OWLS", projectRoles: ["iOS Dev"], financialAccess: false },
    { email: "alex@trifork-na.com", name: "Alex Rivera", roles: [Role.IC], bu: "US-ORD-OWLS", projectRoles: ["Backend"], financialAccess: false },
    { email: "priya@trifork.com", name: "Priya Sharma", roles: [Role.IC], bu: "US-ORD-OWLS", projectRoles: ["3D Dev"], financialAccess: false },
    { email: "diego@trifork-na.com", name: "Diego Ruiz", roles: [Role.IC], bu: "US-ORD-OWLS", projectRoles: ["DevOps"], financialAccess: false },
    { email: "emma@spantree.com", name: "Emma Walsh", roles: [Role.IC], bu: "US-CA-SE", projectRoles: ["iOS Dev"], financialAccess: false },
    { email: "noor@trifork.com", name: "Noor Patel", roles: [Role.IC], bu: "EU-BER-FOXES", projectRoles: ["QA Lead"], financialAccess: false },
    { email: "marco@trifork.com", name: "Marco Bianchi", roles: [Role.IC], bu: "EU-BER-FOXES", projectRoles: ["Backend"], financialAccess: false },
  ];

  const users: Record<string, string> = {};
  for (const u of userData) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        passwordHash: pw,
        roles: u.roles,
        projectRoles: u.projectRoles,
        primaryBuId: buMap[u.bu],
        financialAccess: u.financialAccess,
      },
    });
    users[u.email] = created.id;
  }
  console.log(`✅ ${userData.length} Users (password: quanta123)`);

  // ── Domain Whitelist ──
  const domains = ["trifork.com", "trifork-na.com", "spantree.com"];
  for (const d of domains) {
    await prisma.domainWhitelist.upsert({
      where: { domain: d },
      update: {},
      create: { domain: d, addedBy: users["sarah@trifork.com"] },
    });
  }
  console.log(`✅ ${domains.length} Whitelisted Domains`);

  // ── Account Manager assignments ──
  await prisma.accountManager.upsert({
    where: { accountId_userId: { accountId: acctMap["MER"], userId: users["lena@trifork.com"] } },
    update: {},
    create: { accountId: acctMap["MER"], userId: users["lena@trifork.com"] },
  });
  await prisma.accountManager.upsert({
    where: { accountId_userId: { accountId: acctMap["PIN"], userId: users["lena@trifork.com"] } },
    update: {},
    create: { accountId: acctMap["PIN"], userId: users["lena@trifork.com"] },
  });
  console.log("✅ Account Manager assignments (Lena → Meridian + Pinnacle)");

  // ── Sample Project ──
  const project = await prisma.project.upsert({
    where: { projectCode: "BRF-2026" },
    update: {},
    create: {
      name: "Brand Refresh 2026",
      accountId: acctMap["MER"],
      owningBuId: buMap["US-ORD-OWLS"],
      projectCode: "BRF-2026",
      startDate: new Date("2026-02-03"),
      endDate: new Date("2026-05-22"),
      contingencyPct: 0.15,
      status: "active",
      createdById: users["sara@trifork.com"],
    },
  });
  console.log(`✅ Project: ${project.name}`);

  // ── Resource Assignments ──
  const assignmentData = [
    { email: "maya@trifork.com", role: "iOS Dev", bill: 185, cost: 95 },
    { email: "jonas@trifork.com", role: "Designer", bill: 165, cost: 82 },
    { email: "alex@trifork-na.com", role: "Backend", bill: 195, cost: 105 },
  ];

  for (const a of assignmentData) {
    const user = userData.find(u => u.email === a.email)!;
    await prisma.resourceAssignment.upsert({
      where: { projectId_userId: { projectId: project.id, userId: users[a.email] } },
      update: {},
      create: {
        projectId: project.id,
        userId: users[a.email],
        projectRole: a.role,
        billRate: a.bill,
        costRate: a.cost,
        businessUnit: user.bu,
      },
    });
  }
  console.log(`✅ ${assignmentData.length} Resource Assignments`);

  // ── Hour Entries (8 weeks of data) ──
  const assignments = await prisma.resourceAssignment.findMany({
    where: { projectId: project.id },
  });

  let entryCount = 0;
  for (const assignment of assignments) {
    for (let week = 0; week < 8; week++) {
      const weekStart = new Date("2026-02-03");
      weekStart.setDate(weekStart.getDate() + week * 7);
      const planned = 32 + Math.floor(Math.random() * 16); // 32-48h
      const actual = week < 7 ? planned + Math.floor(Math.random() * 8) - 4 : null; // +/- 4h variance

      await prisma.hourEntry.upsert({
        where: { assignmentId_projectWeek: { assignmentId: assignment.id, projectWeek: week } },
        update: {},
        create: {
          assignmentId: assignment.id,
          projectWeek: week,
          weekStartDate: weekStart,
          plannedHours: planned,
          actualHours: actual,
          locked: week < 6, // first 6 weeks locked
        },
      });
      entryCount++;
    }
  }
  console.log(`✅ ${entryCount} Hour Entries`);

  // ── Global Config ──
  const config = [
    { key: "contingency_default", value: "0.15" },
    { key: "fiscal_week_start", value: "monday" },
    { key: "currency", value: "USD" },
    { key: "yearly_revenue_target_US-ORD-OWLS", value: "4200000" },
    { key: "yearly_margin_target", value: "0.40" },
    { key: "headcount_target_US-ORD-OWLS", value: "18" },
  ];

  for (const c of config) {
    await prisma.globalConfig.upsert({
      where: { key: c.key },
      update: { value: c.value },
      create: c,
    });
  }
  console.log(`✅ ${config.length} Config entries`);

  console.log("\n🎉 Seed complete!\n");
  console.log("Login credentials:");
  console.log("  Any user: [email from above] / quanta123");
  console.log("  AA admin: sarah@trifork.com / quanta123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
