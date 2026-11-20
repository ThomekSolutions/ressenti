import { defineConfig, devices } from '@playwright/test';

const origin = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  use: {
    baseURL: origin + '/ressenti/',
    locale: 'fr-BE',
    timezoneId: 'Europe/Brussels',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: origin + '/ressenti/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'Chrome mobile', use: { ...devices['Pixel 7'] } },
    { name: 'WebKit mobile', use: { ...devices['iPhone 13'] } },
  ],
});