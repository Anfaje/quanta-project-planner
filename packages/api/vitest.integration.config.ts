import { defineConfig } from "vitest/config";

/**
 * Integration test config.
 *
 * Strategy:
 *   - Single fork (pool: "forks", singleFork: true) so the whole suite shares
 *     one DB connection. Multiple processes would race on the shared schema.
 *   - Longer timeouts because real network/DB calls beat the 5s default.
 *   - globalSetup runs once: drops/recreates the schema in TEST_DATABASE_URL
 *     and seeds the baseline rows that every test depends on (domain
 *     whitelist, business units, accounts).
 *   - Each test file uses beforeEach to wipe mutable tables and reseed the
 *     handful of users/projects it needs — see `src/__integration__/helpers.ts`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // In CI also emit the github-actions reporter so individual test
    // failures surface as workflow annotations (not just buried in the
    // step log). Local runs keep the default reporter only.
    reporters: process.env.GITHUB_ACTIONS ? ["default", "github-actions"] : ["default"],
    include: ["src/__integration__/**/*.test.ts"],
    globalSetup: ["src/__integration__/globalSetup.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Tests boot Express + Prisma; their import time is the bottleneck, not
    // the assertions. Allow a sequential file order to keep the shared DB
    // sane.
    fileParallelism: false,
  },
});
