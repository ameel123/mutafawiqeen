import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a production build on a separate test database.
// Before running: create the database once (createdb platform_test) and `npm run build`.
const PORT = 3100;
export const TEST_DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5433/platform_test";
export const ADMIN = { login: "e2e-admin@test.iq", password: "admin-pass-123" };

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ar-IQ",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DB,
      ADMIN_EMAIL: ADMIN.login,
      LOCAL_STORAGE_DIR: ".data/e2e-storage",
      SESSION_SECRET: "e2e-secret",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
  },
});
