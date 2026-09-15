import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real React hooks in an isolated browser. No server, login or database reset needed.
let browser;
let bundle;
before(async () => {
  browser = await chromium.launch({ headless: true });
  const result = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { usePagedList } from './src/hooks/use-paged-list';
      import { useAsync } from './src/hooks/use-async';
      const requests = [];
      const fetchPage = (page) => new Promise((resolve, reject) => requests.push({ page, resolve, reject }));
      function Probe() {
        const state = window.mode === 'async' ? useAsync(() => fetchPage(1), []) : usePagedList({ fetchPage, pageSize: 2, isMobile: window.mode === 'mobile' });
        window.state = state;
        return null;
      }
      window.requests = requests;
      createRoot(document.getElementById('root')).render(<Probe />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"development"' },
  });
  bundle = result.outputFiles[0].text;
});
after(async () => browser?.close());
async function probe(mode = 'desktop') {
  const page = await browser.newPage();
  await page.setContent('<div id="root"></div>');
  await page.evaluate((mode) => { window.mode = mode; }, mode);
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => window.requests.length === 1);
  return page;
}

test('first-page failure is exposed and retry can recover to a genuinely empty list', async () => {
  const page = await probe();
  await page.evaluate(() => window.requests.shift().reject(new Error('offline')));
  await page.waitForFunction(() => !window.state.loading);
  assert.equal(await page.evaluate(() => window.state.error?.message), 'offline');
  await page.evaluate(() => window.state.retry());
  await page.waitForFunction(() => window.requests.length === 1);
  await page.evaluate(() => window.requests.shift().resolve({ items: [], total: 0 }));
  await page.waitForFunction(() => !window.state.loading);
  assert.equal(await page.evaluate(() => window.state.error), null);
  await page.close();
});

for (const mode of ['desktop', 'mobile']) {
  test(`${mode}: failure keeps old rows and retries the requested page`, async () => {
    const page = await probe(mode);
    await page.evaluate(() => window.requests.shift().resolve({ items: ['A', 'B'], total: 4 }));
    await page.waitForFunction(() => !window.state.loading);
    await page.evaluate(() => { if (window.mode === 'mobile') void window.state.loadMore(); else void window.state.setPage(2); });
    await page.waitForFunction(() => window.requests.length === 1);
    await page.evaluate(() => window.requests.shift().reject(new Error('offline')));
    await page.waitForFunction(() => window.state.error !== null);
    assert.deepEqual(await page.evaluate(() => window.state.items), ['A', 'B']);
    assert.equal(await page.evaluate(() => window.state.page), 1);
    await page.evaluate(() => window.state.retry());
    await page.waitForFunction(() => window.requests.length === 1);
    assert.equal(await page.evaluate(() => window.requests[0].page), 2);
    await page.evaluate(() => window.requests.shift().resolve({ items: ['C', 'D'], total: 4 }));
    await page.waitForFunction(() => !window.state.loading && !window.state.isLoadingMore);
    assert.equal(await page.evaluate(() => window.state.error), null);
    assert.deepEqual(await page.evaluate(() => window.state.items), mode === 'mobile' ? ['A', 'B', 'C', 'D'] : ['C', 'D']);
    await page.close();
  });
}

test('a superseded failure cannot overwrite newer successful rows', async () => {
  const page = await probe();
  await page.evaluate(() => { void window.state.setPage(2); });
  await page.waitForFunction(() => window.requests.length === 2);
  await page.evaluate(() => window.requests[1].resolve({ items: ['new'], total: 4 }));
  await page.waitForFunction(() => window.state.page === 2);
  await page.evaluate(() => window.requests[0].reject(new Error('old failure')));
  // A browser round trip flushes the rejection microtask.
  assert.equal(await page.evaluate(() => window.state.error), null);
  assert.deepEqual(await page.evaluate(() => window.state.items), ['new']);
  await page.close();
});

test('useAsync exposes refresh failure while retaining successful data', async () => {
  const page = await probe('async');
  await page.evaluate(() => window.requests.shift().resolve(['old']));
  await page.waitForFunction(() => !window.state.isFetching);
  await page.evaluate(() => window.state.refetch());
  await page.waitForFunction(() => window.requests.length === 1);
  await page.evaluate(() => window.requests.shift().reject(new Error('offline')));
  await page.waitForFunction(() => !window.state.isFetching);
  assert.equal(await page.evaluate(() => window.state.error.message), 'offline');
  assert.deepEqual(await page.evaluate(() => window.state.data), ['old']);
  await page.evaluate(() => window.state.refetch());
  await page.waitForFunction(() => window.requests.length === 1);
  assert.equal(await page.evaluate(() => window.state.error), null);
  await page.evaluate(() => window.requests.shift().resolve(['fresh']));
  await page.waitForFunction(() => !window.state.isFetching);
  assert.deepEqual(await page.evaluate(() => window.state.data), ['fresh']);
  await page.close();
});

// Opt-in checks against an already running development server. Every target API is mocked;
// no inventory writes or test DB reset. Auth state must belong to a local staff account.
const appURL = process.env.UX_APP_URL;
const authState = process.env.UX_AUTH_STATE;
const cases = [
  ['/dispense', '/api/dispense/items', { items: [], total: 0 }],
  ['/receive?tab=return', '/api/returns', { records: [] }],
  ['/receive?tab=in_use', '/api/dispense/in-use', { records: [] }],
  ['/repairs', '/api/repairs', { rows: [] }],
  ['/cart', '/api/cart', { items: [] }],
  ['/items/UX-MISSING', '/api/items/UX-MISSING', null],
  ['/reports?tab=stock-balance', '/api/reports/stock-balance', { rows: [] }],
  ['/reports?tab=usage-by-subject', '/api/reports/usage-by-subject', null],
  ['/reports?tab=annual-cost', '/api/reports/annual-cost', null],
];
for (const [path, api, empty] of cases) {
  test(`page ${path} distinguishes API failure from empty`, { skip: !appURL || !authState }, async () => {
    const context = await browser.newContext({ storageState: authState });
    const page = await context.newPage();
    let fail = true;
    let hits = 0;
    await page.route(`**${api}{,?*}`, async (route) => {
      hits++;
      await route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: 'simulated outage' } : empty });
    });
    // Playwright glob brace support for a literal endpoint + optional query differs by
    // version: a predicate keeps this precise without intercepting item subresources.
    await page.route((url) => url.pathname.endsWith(api), async (route) => {
      hits++;
      await route.fulfill({ status: fail ? 503 : 200, json: fail ? { error: 'simulated outage' } : empty });
    });
    await page.goto(appURL + path);
    const error = page.getByRole('alert').filter({ hasText: 'โหลดข้อมูลไม่สำเร็จ' }).filter({ visible: true });
    await error.first().waitFor({ timeout: 30000 });
    assert.ok(hits > 0);
    if (empty) {
      fail = false;
      await error.first().getByRole('button', { name: 'ลองใหม่' }).click();
      await error.first().waitFor({ state: 'hidden' });
      assert.ok(hits > 1);
    }
    await context.close();
  });
}
