import { defineConfig, devices } from "@playwright/test";
import { defineBddConfig } from "playwright-bdd";
import dotenv from "dotenv";
import { BASE_PATH } from "./src/lib/base-path";

dotenv.config({ path: ".env.test", override: true });

const PORT = 4517;
// basePath means nothing is served at the origin root, so both the specs' goto("/…") and
// the webServer readiness probe have to go through the subpath or they land on a 404.
const baseURL = `http://localhost:${PORT}${BASE_PATH}`;

// bddgen reads this export; playwright runs the generated tests from the same dir.
export const testDir = defineBddConfig({
  features: ["./e2e/features/*.feature"],
  steps: ["./e2e/fixtures.ts", "./e2e/steps/*.ts"],
  outputDir: "./e2e/.gen",
  // suite is being built group by group — scenarios without step definitions yet are
  // skipped instead of blocking generation of the finished ones.
  missingSteps: "skip-scenario",
});

export default defineConfig({
  testDir: "./e2e/.gen",
  // Shared seeded DB (reset once per run) → no per-test isolation, run serially.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    // always headed with a visible pause — the owner watches every run (HEADLESS=1 / SLOWMO= override)
    headless: process.env.HEADLESS === "1",
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 800) },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
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
