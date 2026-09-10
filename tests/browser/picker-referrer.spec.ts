import { test, expect } from '@playwright/test';

test('Picker iframe receives only the app origin, never the document path or query', async ({ page, baseURL }) => {
  const probe = 'https://docs.google.com/picker?synthetic_referrer_probe=1';
  await page.route(probe, route => route.fulfill({ contentType: 'text/html', body: '<p>Synthetic Picker frame</p>' }));
  await page.goto('/?storage=1&synthetic_private_context=do-not-share');
  const outgoing = page.waitForRequest(probe);
  await page.evaluate(url => {
    const frame = document.createElement('iframe');
    frame.src = url;
    document.body.appendChild(frame);
  }, probe);
  expect((await outgoing).headers().referer).toBe(new URL(baseURL!).origin + '/');
});
