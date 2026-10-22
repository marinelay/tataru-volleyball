const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const fixturePath = path.resolve('dist/cache-regression-worker.js');

test.beforeAll(() => {
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  // Reproduce a browser retaining an obsolete HTML build in its offline cache.
  fs.writeFileSync(
    fixturePath,
    `const cacheName = 'workbox-precache-v2-' + self.registration.scope;
    self.addEventListener('install', event => event.waitUntil((async () => {
      const cache = await caches.open(cacheName);
      await cache.put('/ko/', new Response('<h1>Obsolete cached game</h1>', {
        headers: { 'Content-Type': 'text/html' }
      }));
      await self.skipWaiting();
    })()));
    self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
    self.addEventListener('fetch', event => {
      if (new URL(event.request.url).pathname === '/ko/') {
        event.respondWith(caches.open(cacheName).then(cache => cache.match('/ko/')));
      }
    });`
  );
});

test.afterAll(() => {
  fs.unlinkSync(fixturePath);
});

test('recovers a stale offline build and keeps the game open without reloads', async ({
  page,
  request,
}) => {
  for (const language of ['ko', 'en', 'zh']) {
    const response = await request.get(`/${language}/`);
    expect(await response.text()).not.toContain('new Workbox');
  }
  await page.goto('/ko/');
  await page.evaluate(async () => {
    localStorage.setItem('cache-recovery-sentinel', 'keep-settings');
    await caches.open('unrelated-test-cache');
    await navigator.serviceWorker.register('/cache-regression-worker.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Obsolete cached game' })
  ).toBeVisible();
  await page.goto('/__reset-game-cache');
  await page.waitForURL('**/ko/');
  await expect(page.locator('#game-guide')).toBeVisible();
  await expect(page.locator('#loading-box')).toBeHidden();
  await expect(page.locator('#about-box')).toHaveCount(0);
  const recovered = await page.evaluate(async () => ({
    registrations: (await navigator.serviceWorker.getRegistrations()).length,
    controller: navigator.serviceWorker.controller,
    caches: await caches.keys(),
    setting: localStorage.getItem('cache-recovery-sentinel'),
  }));
  expect(recovered).toEqual({
    registrations: 0,
    controller: null,
    caches: ['unrelated-test-cache'],
    setting: 'keep-settings',
  });
  let navigations = 0;
  let sockets = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  page.on('websocket', () => sockets++);
  // The reported loop reloaded multiple times a second. Observe live animation.
  await page.evaluate(
    () => new Promise((resolve) => setTimeout(resolve, 3000))
  );
  expect(navigations).toBe(0);
  expect(sockets).toBe(0);
});
