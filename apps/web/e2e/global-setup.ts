/* Signs the e2e user in once through the dev login form and stores the session cookie for every test. */
import { chromium, expect } from '@playwright/test';
import { E2E_USER, STORAGE_STATE } from './auth';

export default async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/login`);
  await expect(page.getByTestId('dev-email')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('dev-email').fill(E2E_USER.email);
  await page.getByTestId('dev-login').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
  await page.context().storageState({ path: STORAGE_STATE });
  await browser.close();
}
