import { defineConfig, devices } from "@playwright/test";

// The real-course checks (tests/real): the demo course, as big as a real one (18 holes, measured
// trees, buildings, woods, the photo), saved to a real HyzerLab server on an emptied test
// database, and used the way a person uses it: picked, dragged, drawn on, painted, flown over and
// saved. Each check has a speed limit, and the key screens are compared with approved pictures.
// One browser and one course for the whole run: a few minutes, not three quarters of an hour.
// Needs Postgres with a database named hyzerlab_e2e (as the server checks do).
const db = process.env.E2E_DATABASE_URL ?? "postgres://hyzerlab:hyzerlab@127.0.0.1:5432/hyzerlab_e2e";
export const SETUP_CODE = "TESTSETUPCODEAAA";

export default defineConfig({
  testDir: "./tests/real",
  timeout: 180_000,
  expect: { timeout: 20_000, toHaveScreenshot: { maxDiffPixelRatio: 0.03, animations: "disabled" } },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/real.json" }]],
  use: {
    baseURL: "http://localhost:4176",
    // (smaller than a desktop: this machine draws 3D without a graphics card)
    viewport: { width: 1280, height: 820 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 820 } } }],
  webServer: [
    {
      command: "npx tsx test/reset-db.ts && npx tsx src/index.ts",
      cwd: "server",
      url: "http://127.0.0.1:8798/api/health",
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DATABASE_URL: db, APP_SECRET: Buffer.alloc(32, 9).toString("base64"), APP_ORIGINS: "http://localhost:4176", PORT: "8798", SETUP_CODE }
    },
    {
      command: "npx vite build --outDir dist-real && npx vite preview --outDir dist-real --port 4176 --strictPort",
      url: "http://localhost:4176",
      reuseExistingServer: false,
      timeout: 180_000,
      env: { VITE_SERVER: "1", HYZERLAB_API: "http://127.0.0.1:8798" }
    }
  ]
});
