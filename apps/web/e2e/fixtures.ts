import { test as base, type APIRequestContext } from '@playwright/test';
import { authHeaders } from './auth';
import { API } from './helpers';

/** `api`: an API client authenticated as the e2e user (the browser context signs in as the same user in global setup). */
export const test = base.extend<{ api: APIRequestContext }>({
  api: async ({ playwright }, provide) => {
    const ctx = await playwright.request.newContext({ baseURL: API, extraHTTPHeaders: authHeaders() });
    await provide(ctx);
    await ctx.dispose();
  },
});
export { expect } from '@playwright/test';
