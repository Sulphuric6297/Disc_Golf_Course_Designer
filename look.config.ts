import { defineConfig, devices } from "@playwright/test";

// `npm run look`: screenshots of the main screens (into look/), to see the real UI.
// Not part of `npm run check`; it is for looking, not asserting.
export default defineConfig({
  testDir: "./tests/look",
  timeout: 120_000,
  workers: 2,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", viewport: { width: 1600, height: 1000 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } }],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
