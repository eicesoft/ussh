import assert from 'node:assert/strict';
// Set PLAYWRIGHT_MODULE to a locally installed Playwright ESM entry if needed.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:5179'}/tests/fixtures/panel-width.html`);
  const width = id => page.locator(`#${id}`).evaluate(el => el.getBoundingClientRect().width);
  for (const [id, index, delta] of [['left', 0, 220], ['right', 1, -180]]) {
    const before = await width(id);
    const handle = await page.getByRole('separator').nth(index).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 100);
    await page.mouse.down();
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(handle.x + handle.width / 2 + delta * step / 20, handle.y + 100);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    const after = await width(id);
    console.log(`${id}: ${before} -> ${after}, expected delta ${Math.abs(delta)}`);
    assert.ok(Math.abs(after - before - Math.abs(delta)) <= 3, `${id} drag stopped before reaching target`);
  }
  const saved = { left: await width('left'), right: await width('right') };
  await page.getByText('Toggle right', { exact: true }).click();
  await page.getByText('Toggle right', { exact: true }).click();
  assert.ok(Math.abs(await width('right') - saved.right) <= 2, 'Right width restored on reopen');
  await page.reload();
  await page.locator('#right').waitFor();
  for (const id of ['left', 'right']) assert.ok(Math.abs(await width(id) - saved[id]) <= 2, `${id} width restored after reload`);
  assert.deepEqual(errors, []);
  console.log('PASS: continuous drag, reopen and reload persistence');
} finally {
  await browser.close();
}
