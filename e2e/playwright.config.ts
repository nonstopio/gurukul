import { defineConfig, devices } from '@playwright/test';
import { APP_URL } from './support/env';

// Proxies in the environment (CI sandboxes, corporate laptops) must not sit between the Firebase
// CLI and the emulators it starts: it talks to them on 127.0.0.1.
const NO_PROXY = {
  HTTP_PROXY: '',
  HTTPS_PROXY: '',
  http_proxy: '',
  https_proxy: '',
  ALL_PROXY: '',
  all_proxy: '',
};

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // One emulator, one app: tests share them, so they run one at a time and reset between tests.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: './playwright-report' }]]
    : [['list']],
  globalSetup: './support/global-setup.ts',
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // E2E_COLOR_SCHEME=dark re-runs every spec, axe contrast checks included, in the dark theme.
    colorScheme: process.env.E2E_COLOR_SCHEME === 'dark' ? 'dark' : 'light',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // A preinstalled browser when PW_CHROMIUM_PATH is set; otherwise the one
        // `npx playwright install chromium` downloads.
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: [
    {
      // Functions are built first: the Functions emulator loads firebase/functions/lib/index.js
      // (E2E_SKIP_FUNCTIONS_BUILD=1 keeps the last build).
      command: `${process.env.E2E_SKIP_FUNCTIONS_BUILD ? '' : 'npm run build -w @gurukul/functions && '}npx firebase emulators:start --only auth,firestore,functions --project demo-gurukul`,
      cwd: '..',
      wait: { stdout: /All emulators ready/ },
      env: NO_PROXY,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
      name: 'emulators',
    },
    {
      command: 'node e2e/support/start-app.mjs',
      cwd: '..',
      url: APP_URL,
      timeout: 180_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
      reuseExistingServer: !process.env.CI,
      name: 'app',
    },
  ],
});
