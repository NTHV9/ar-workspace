import assert from 'node:assert/strict';

// Public health plus unauthenticated boundary checks; never load a session or secret.
const expected = process.argv[2];
assert.match(expected ?? '', /^[0-9a-f]{40}$/, 'Supply the pushed source commit SHA.');
const origin = 'https://ar-workspace.ar-c82.workers.dev';
const id = '00000000-0000-4000-8000-000000000001';
const health = await fetch(origin + '/api/health');
assert.equal(health.status, 200);
const status = await health.json();
assert.equal(status.commit, expected);
assert.equal(status.supabase, 'database_verified');

const routes = [
  ['GET', `/api/email/${id}/threads?revision=0`],
  ['GET', `/api/email/${id}/threads/synthetic?revision=0&offset=0`],
  ['POST', `/api/email/${id}/thread`],
  ['GET', '/api/email/test-conversations'],
  ['GET', `/api/email/test-conversations/${id}?offset=0`],
  ['POST', '/api/email/test-send'],
];
for (const [method, path] of routes) {
  const response = await fetch(origin + path, {
    method, redirect: 'manual',
    ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json', Origin: origin }, body: '{}' } : {}),
  });
  await response.body?.cancel();
  assert.equal(response.status, 401, `${method} ${path} must reject missing authentication`);
}
console.log(JSON.stringify({ commit: expected, health: status.status, supabase: status.supabase, anonymousRoutesRejected: routes.length }));
