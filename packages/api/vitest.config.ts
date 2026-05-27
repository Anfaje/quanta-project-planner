import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests require a real Postgres at TEST_DATABASE_URL plus
    // Prisma's engine binary available locally. They're opted into via
    // `npm run test:integration`. Excluded here so `npm test` stays fast,
    // hermetic, and runnable anywhere.
    exclude: ["node_modules/**", "src/__integration__/**"],
  },
});
