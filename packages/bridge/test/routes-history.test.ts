/**
 * GET /api/chat/state and GET /api/chat/history route tests against the
 * package-local Hono mount. The "bridge router is opt-in" check is
 * intrinsically a studio-side concern (it asserts createApp does NOT
 * mount /api/chat when ctx.bridge is undefined) and lives in
 * packages/studio/test/.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatLogRow } from '@/types.ts';
import {
  makeFixture,
  cleanupFixture,
  getJson,
  type Fixture,
} from './fixture.ts';

let fx: Fixture;

beforeEach(() => {
  fx = makeFixture();
});

afterEach(() => {
  cleanupFixture(fx);
});

function rowsOf(body: unknown): ChatLogRow[] {
  if (
    body === null ||
    typeof body !== 'object' ||
    !('rows' in body) ||
    !Array.isArray(body.rows)
  ) {
    throw new Error(`expected {rows: []}, got ${JSON.stringify(body)}`);
  }
  return body.rows;
}

describe('GET /api/chat/state', () => {
  it('returns initial offline state', async () => {
    const r = await getJson(fx, '/api/chat/state');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      mcpConnected: false,
      listenModeOn: false,
      awaitingMessage: false,
    });
  });

  it('reflects state changes', async () => {
    fx.queue.setMcpConnected(true);
    const r = await getJson(fx, '/api/chat/state');
    expect(r.body).toEqual({
      mcpConnected: true,
      listenModeOn: false,
      awaitingMessage: false,
    });
  });
});

describe('GET /api/chat/history', () => {
  async function seedRows(rows: ChatLogRow[]): Promise<void> {
    for (const r of rows) await fx.log.append(r);
  }

  it('empty log returns {rows: []}', async () => {
    const r = await getJson(fx, '/api/chat/history');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ rows: [] });
  });

  it('returns 3 rows in order after 3 appends', async () => {
    await seedRows([
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { kind: 'prose', seq: 2, ts: 200, text: 'two' },
      { seq: 3, ts: 300, role: 'operator', text: 'three' },
    ]);
    const r = await getJson(fx, '/api/chat/history');
    expect(r.status).toBe(200);
    const body = { rows: rowsOf(r.body) };
    expect(body.rows.length).toBe(3);
    expect(body.rows[0]).toMatchObject({ seq: 1, text: 'one' });
    expect(body.rows[2]).toMatchObject({ seq: 3, text: 'three' });
  });

  it('?since=2 filters out rows with seq <= 2', async () => {
    await seedRows([
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { seq: 2, ts: 200, role: 'operator', text: 'two' },
      { seq: 3, ts: 300, role: 'operator', text: 'three' },
    ]);
    const r = await getJson(fx, '/api/chat/history?since=2');
    const body = { rows: rowsOf(r.body) };
    expect(body.rows.length).toBe(1);
    expect(body.rows[0]).toMatchObject({ seq: 3 });
  });

  it('?limit=1 returns 1 row', async () => {
    await seedRows([
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { seq: 2, ts: 200, role: 'operator', text: 'two' },
      { seq: 3, ts: 300, role: 'operator', text: 'three' },
    ]);
    const r = await getJson(fx, '/api/chat/history?limit=1');
    const body = { rows: rowsOf(r.body) };
    expect(body.rows.length).toBe(1);
    expect(body.rows[0]).toMatchObject({ seq: 1 });
  });

  it('?since=0 returns all rows', async () => {
    await seedRows([
      { seq: 1, ts: 100, role: 'operator', text: 'one' },
      { seq: 2, ts: 200, role: 'operator', text: 'two' },
    ]);
    const r = await getJson(fx, '/api/chat/history?since=0');
    const body = { rows: rowsOf(r.body) };
    expect(body.rows.length).toBe(2);
  });

  it('returns 400 on negative since', async () => {
    const r = await getJson(fx, '/api/chat/history?since=-1');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-since' });
  });

  it('returns 400 on non-integer since', async () => {
    const r = await getJson(fx, '/api/chat/history?since=abc');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-since' });
  });

  it('returns 400 on limit=0', async () => {
    const r = await getJson(fx, '/api/chat/history?limit=0');
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'invalid-limit' });
  });

  it('returns 400 on negative limit', async () => {
    const r = await getJson(fx, '/api/chat/history?limit=-3');
    expect(r.status).toBe(400);
  });

  it('returns 400 on non-integer limit', async () => {
    const r = await getJson(fx, '/api/chat/history?limit=foo');
    expect(r.status).toBe(400);
  });

  it('empty ?since= falls back to default (treated as if not supplied)', async () => {
    await fx.log.append({ seq: 1, ts: 100, role: 'operator', text: 'one' });
    await fx.log.append({ seq: 2, ts: 200, role: 'operator', text: 'two' });
    const r = await getJson(fx, '/api/chat/history?since=');
    expect(r.status).toBe(200);
    expect(rowsOf(r.body).length).toBe(2);
  });

  it('empty ?limit= falls back to default (treated as if not supplied)', async () => {
    await fx.log.append({ seq: 1, ts: 100, role: 'operator', text: 'one' });
    const r = await getJson(fx, '/api/chat/history?limit=');
    expect(r.status).toBe(200);
    expect(rowsOf(r.body).length).toBe(1);
  });
});

