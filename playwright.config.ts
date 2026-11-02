import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against an already-running app (npm run build && npm start).
// Start it with EMAIL_CAPTURE_FILE=/tmp/kithwheel-email-capture.jsonl and no
// RESEND_API_KEY so the password-reset test can read its emails.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Optional: point at an already-installed Chromium instead of `npx playwright install`.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
});
