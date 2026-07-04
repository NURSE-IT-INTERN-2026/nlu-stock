import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

const PORT = 4517;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Shared seeded DB (reset once per run) → no per-test isolation, run serially.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
    },
    // Responsive audit — runs only responsive.spec.ts across mobile→desktop widths.
    {
      name: "mobile-320",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 720 }, storageState: "e2e/.auth/admin.json" },
    },
    {
      name: "mobile-375",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, storageState: "e2e/.auth/admin.json" },
    },
    {
      name: "tablet-768",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, storageState: "e2e/.auth/admin.json" },
    },
    {
      name: "desktop-1024",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 }, storageState: "e2e/.auth/admin.json" },
    },
  ],
  webServer: {
    command: `next dev -p ${PORT}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      E2E: "1",
      DATABASE_URL: process.env.DATABASE_URL!,
      JWT_SECRET: process.env.JWT_SECRET!,
      NEXT_PUBLIC_APP_URL: baseURL,
      UPLOAD_DIR: process.env.UPLOAD_DIR!,
      ...(process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ? { GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY }
        : {}),
    },
  },
});
