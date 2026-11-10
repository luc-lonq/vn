import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDb } from '../src/db/index.js';

/** Starts the app on a random port with an in-memory database. */
async function startServer() {
  const config = loadConfig({ APP_PASSWORD: 'secret' });
  const app = createApp({ db: openDb(':memory:'), config });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let cookie = '';

  async function request(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: body && JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json() };
  }

  return { server, request };
}

describe('API', () => {
  let ctx;
  before(async () => {
    ctx = await startServer();
  });
  after(() => ctx.server.close());

  it('rejects unauthenticated requests', async () => {
    assert.equal((await ctx.request('GET', '/notes')).status, 401);
  });

  it('rejects a wrong password', async () => {
    assert.equal((await ctx.request('POST', '/auth/login', { password: 'nope' })).status, 401);
  });

  it('logs in with the right password', async () => {
    const res = await ctx.request('POST', '/auth/login', { password: 'secret' });
    assert.equal(res.status, 200);
    assert.equal((await ctx.request('GET', '/auth/me')).body.authed, true);
  });

  it('creates, updates and searches notes', async () => {
    const { body: note } = await ctx.request('POST', '/notes', {
      title: 'Tons',
      content: 'ngang\n',
    });
    await ctx.request('PUT', `/notes/${note.id}`, { content: 'ngang\nhuyền\n' });

    const { body: found } = await ctx.request('GET', '/notes?q=huyền');
    assert.equal(found.length, 1);
    assert.equal(
      (await ctx.request('GET', '/notes?q=%25')).body.length,
      0,
      'LIKE wildcards are escaped'
    );
    assert.equal((await ctx.request('GET', '/notes/9999')).status, 404);
  });

  it('validates cards', async () => {
    const res = await ctx.request('POST', '/cards', { front: 'xin chào' });
    assert.equal(res.status, 400);
  });

  it('imports cards and skips invalid lines', async () => {
    const { body } = await ctx.request('POST', '/cards/import', {
      text: 'cảm ơn ; merci\nnước | eau | uống nước\ninvalid line',
    });
    assert.deepEqual(body, { imported: 2, skipped: 1 });
  });

  it('serves due cards and records answers', async () => {
    const { body: first } = await ctx.request('GET', '/review/next');
    assert.equal(first.card.front, 'cảm ơn');
    assert.equal(first.previews.length, 4);

    assert.equal(
      (await ctx.request('POST', `/review/${first.card.id}`, { rating: 7 })).status,
      400
    );
    assert.equal(
      (await ctx.request('POST', `/review/${first.card.id}`, { rating: 3 })).status,
      200
    );

    const { body: stats } = await ctx.request('GET', '/stats');
    assert.equal(stats.reviewedToday, 1);
    assert.equal(stats.streak, 1);
  });

  it('returns history with diffs, newest first', async () => {
    const { body } = await ctx.request('GET', '/history');
    assert.deepEqual(
      body.entries.map((e) => e.summary),
      ['Import de 2 cartes', 'Note créée — Tons']
    );
    assert.ok(body.entries[1].hunks[0].lines.includes('+huyền'));
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await ctx.request('GET', '/nope');
    assert.equal(res.status, 404);
  });
});
