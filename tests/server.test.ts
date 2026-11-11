import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createPhaseServer } from '../server.ts';

test('HTTP API returns phases, health and explicit client errors', async (t) => {
  const server = createPhaseServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  for (const [path, status] of [
    ['/phase?date=2026-11-11', 200], ['/phase', 200], ['/health', 200],
    ['/phase?date=2026-02-30', 400], ['/phase?date=', 400],
    ['/phase?date=2026-11-11T12:00:00', 400],
    ['/phase?date=2026-11-11&date=2026-11-12', 400],
    ['/phase?date=1900-01-01', 422], ['/missing', 404],
  ] as const) {
    const result = await fetch(base + path);
    assert.equal(result.status, status, path);
    assert.match(result.headers.get('content-type')!, /application\/json/);
    const body = await result.json();
    if (status !== 200) assert.equal(typeof body.error, 'string');
    else if (path.startsWith('/phase')) {
      assert.equal(typeof body.phase, 'string');
      assert.equal(typeof body.ageDays, 'number');
    }
  }
  const offset = await fetch(base + '/phase?date=' + encodeURIComponent('2026-11-11T14:00:00+02:00'));
  assert.equal(offset.status, 200);
  assert.equal((await offset.json()).utc, '2026-11-11T12:00:00.000Z');
  const post = await fetch(base + '/phase', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET');
  await post.json();
});
