import { defineConfig, devices } from '@playwright/test';

// UI regressions use deterministic API responses; no database or API server is required.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'mobile-layout.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', screenshot: 'only-on-failure' },
  projects: [
    { name: 'small-mobile', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 740 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'tablet', use: { ...devices['Pixel 7'], viewport: { width: 768, height: 1024 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
