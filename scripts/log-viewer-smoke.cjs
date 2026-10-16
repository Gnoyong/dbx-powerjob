const assert = require('node:assert/strict');

module.exports = async ({ frame, calls, button, failures }) => {
  await frame.evaluate(() => { window.__logTest = true; });
  await frame.locator('.job-item').filter({ hasText: 'Alpha' }).click();
  await button('Instances & logs').click();
  await frame.locator('.instances-table tbody tr').first().click();
  const logs = frame.locator('.logs-pane');
  const control = name => logs.getByRole('button', { name, exact: true });
  await control('To bottom').waitFor({ state: 'visible' });
  await frame.waitForFunction(() => document.querySelector('.log-row')?.textContent.includes('page 1'));
  await control('To bottom').click();
  await frame.waitForFunction(() => window.__calls.some(c => c.method === 'powerjob/log' && c.params.index === 99));
  await frame.waitForFunction(() => document.querySelector('.log-scroll')?.textContent.includes('page 100'));
  assert.equal(await control('Follow').getAttribute('aria-pressed'), 'false', 'bottom is a one-shot action');

  // Remount the viewer to exercise Follow from the first page too.
  await frame.locator('.job-item').filter({ hasText: 'Beta' }).click();
  await frame.evaluate(() => { window.__logInstant = true; window.__logFailIndex = 20; });
  await frame.locator('.job-item').filter({ hasText: 'Alpha' }).click();
  await frame.locator('.instances-table tbody tr').first().click();
  await frame.waitForFunction(() => document.querySelector('.log-row')?.textContent.includes('page 1'));
  await control('Follow').click();
  await control('Retry').waitFor({ state: 'visible' });
  assert.equal(await control('Follow').getAttribute('aria-pressed'), 'true', 'page failure preserves follow for retry');
  const failedCount = (await calls('powerjob/log')).length;
  await frame.waitForTimeout(100);
  assert.equal((await calls('powerjob/log')).length, failedCount, 'failed page does not spin or silently skip');
  await control('Retry').click();
  await frame.waitForFunction(() => document.querySelector('.log-scroll')?.textContent.includes('page 100')).catch(async error => {
    console.error(await frame.evaluate(() => ({
      recentPages: window.__calls.filter(c => c.method === 'powerjob/log').slice(-8).map(c => c.params.index),
      state: document.querySelector('.log-state')?.textContent,
      visible: document.querySelector('.log-scroll')?.textContent.slice(-200),
    })));
    throw error;
  });
  assert.equal(await control('Follow').getAttribute('aria-pressed'), 'true', 'layout scroll must not cancel follow');

  // Poll discovers new pages, including immediate replies batched by React.
  await frame.evaluate(() => { window.__logTotal = 103; });
  await frame.waitForFunction(() => document.querySelector('.log-scroll')?.textContent.includes('page 103'));
  await logs.locator('.log-scroll').dispatchEvent('wheel', { deltaY: -100 });
  assert.equal(await control('Follow').getAttribute('aria-pressed'), 'false', 'manual upward wheel stops follow');
  const count = (await calls('powerjob/log')).length;
  await frame.waitForTimeout(3200);
  assert.equal((await calls('powerjob/log')).length, count, 'manual browsing stops polling');
  assert.deepEqual(failures, []);
  console.log('LogViewer sandbox smoke passed: bottom/follow reach 100 pages despite layout scroll and immediate replies, failure pauses and retries, polling reaches new pages, manual browsing stops follow.');
};
