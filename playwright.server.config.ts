import { defineConfig, devices } from "@playwright/test";

// The app built for a GlideLine Studio server (VITE_SERVER=1) with the server itself, on an emptied test
// database: sign-in, 2FA, invites and the account dialogs. Needs Postgres (server/compose.dev.yml,
// or the CI service) with a database named hyzerlab_e2e.
const db = process.env.E2E_DATABASE_URL ?? "postgres://hyzerlab:hyzerlab@127.0.0.1:5432/hyzerlab_e2e";
export const SETUP_CODE = "TESTSETUPCODEAAA";

export default defineConfig({
  testDir: "./tests/server",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4175",
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } }],
  webServer: [
    {
      command: "npx tsx test/reset-db.ts && npx tsx src/index.ts",
      cwd: "server",
      url: "http://127.0.0.1:8797/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: db,
        APP_SECRET: Buffer.alloc(32, 9).toString("base64"),
        APP_ORIGINS: "http://localhost:4175",
        PORT: "8797",
        SETUP_CODE
      }
    },
    {
      command: "npx vite build --outDir dist-server && npx vite preview --outDir dist-server --port 4175 --strictPort",
      url: "http://localhost:4175",
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_SERVER: "1", HYZERLAB_API: "http://127.0.0.1:8797" }
    }
  ]
});
