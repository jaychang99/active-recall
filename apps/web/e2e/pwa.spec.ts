import { expect, test } from '@playwright/test';

test.describe('PWA', () => {
  test('serves a valid web app manifest, icons and the service worker', async ({ page, request }) => {
    const manifest = await request.get('/manifest.webmanifest');
    expect(manifest.ok()).toBeTruthy();
    const m = (await manifest.json()) as { name: string; display: string; start_url: string; icons: { src: string; sizes: string; purpose?: string }[] };
    expect(m.name).toBe('Recall Studio');
    expect(m.display).toBe('standalone');
    expect(m.icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) expect((await request.get(i.src)).ok(), i.src).toBeTruthy();
    const sw = await request.get('/sw.js');
    expect(sw.ok()).toBeTruthy();
    expect(await sw.text()).toContain("addEventListener('fetch'");
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveCount(1);
  });
});
