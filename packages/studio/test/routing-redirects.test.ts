/**
 * Regression tests for studio routing 404 redirects (#143, #144).
 *
 * These URLs were promised by the Index page copy ("address directly",
 * "defaults to the dashboard") but had no matching route. Each is now
 * a 302 redirect to the documented canonical surface.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: {
        contentDir: 'docs',
        calendarPath: '.deskwork/calendar.md',
      },
    },
    defaultSite: 'd',
  };
}

let root: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dw-routing-'));
  mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
  app = createApp({ projectRoot: root, config: makeConfig() });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('studio routing redirects (#143, #144)', () => {
  it('GET /dev/editorial-review redirects to the dashboard (#144)', async () => {
    const res = await app.fetch(new Request('http://x/dev/editorial-review', { redirect: 'manual' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dev/editorial-studio');
  });

  it('GET /dev/editorial-review/ redirects to the dashboard (#144)', async () => {
    const res = await app.fetch(new Request('http://x/dev/editorial-review/', { redirect: 'manual' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dev/editorial-studio');
  });

  it('GET /dev/scrapbook/<site> redirects to /dev/content/<site> (#143)', async () => {
    const res = await app.fetch(new Request('http://x/dev/scrapbook/d', { redirect: 'manual' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dev/content/d');
  });

  it('GET /dev/scrapbook/<site>/ redirects to /dev/content/<site> (#143)', async () => {
    const res = await app.fetch(new Request('http://x/dev/scrapbook/d/', { redirect: 'manual' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/dev/content/d');
  });

  it('per-UUID review URLs are unaffected by the bare-URL redirect', async () => {
    // The redirect must NOT swallow the existing per-UUID route. A
    // valid UUID-shaped URL stays on its own page (404 here because
    // no sidecar exists, but NOT a 302 to the dashboard).
    const res = await app.fetch(
      new Request(
        'http://x/dev/editorial-review/00000000-0000-0000-0000-000000000000',
        { redirect: 'manual' },
      ),
    );
    expect(res.status).not.toBe(302);
  });
});
