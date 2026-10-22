const { test, expect } = require('@playwright/test');

for (const pathname of ['/', '/jp', '/jp/', '/ko/ko/ko/', '/unknown/nested/']) {
  test(`Pages fallback at ${pathname} reaches the game in one redirect`, async ({
    page,
    request,
  }) => {
    const rootResponse = await request.get('/');
    expect(rootResponse.ok()).toBe(true);
    const rootHTML = await rootResponse.text();
    const navigations = [];

    // Cloudflare Pages serves index.html for missing routes in its SPA mode.
    // Model that behavior instead of relying on webpack's development 404 page.
    await page.route('**/*', async (route) => {
      const req = route.request();
      if (!req.isNavigationRequest()) return route.continue();
      const requestedPath = new URL(req.url()).pathname;
      navigations.push(requestedPath);
      if (navigations.length > 4) return route.abort();
      if (requestedPath !== '/ko/') {
        return route.fulfill({ contentType: 'text/html', body: rootHTML });
      }
      return route.continue();
    });

    await page.goto(pathname);
    await page.waitForURL('**/ko/');
    await expect(page.locator('#game-guide')).toBeVisible();
    await expect(page.locator('#loading-box')).toBeHidden();
    expect(navigations).toEqual([pathname, '/ko/']);
  });
}
