/**
 * Smoke tests for the studio's static asset mount. The Hono server
 * exposes `public/` at `/static/*`, so:
 *   - `/static/css/<file>.css` returns the source CSS verbatim
 *   - `/static/dist/<file>.js`  returns the esbuild-bundled module
 *
 * These tests assume `npm run build` has populated `public/dist/`. The
 * package.json `test` script chains the build before vitest, and the
 * `prepare` hook covers fresh `npm install` runs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      a: {
        host: 'a.example',
        contentDir: 'src/sites/a/content/blog',
        calendarPath: 'docs/cal-a.md',
        blogFilenameTemplate: '{slug}.md',
      },
    },
    defaultSite: 'a',
  };
}

describe('studio static assets', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'deskwork-studio-static-'));
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  it('GET /static/css/editorial-review.css serves the source CSS', async () => {
    const res = await app.fetch(
      new Request('http://x/static/css/editorial-review.css'),
    );
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/text\/css/);
    const body = await res.text();
    expect(body).toContain('--er-');
    expect(body.length).toBeGreaterThan(0);
  });

  it('GET /static/dist/editorial-review-client.js serves the bundled module', async () => {
    const res = await app.fetch(
      new Request('http://x/static/dist/editorial-review-client.js'),
    );
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/javascript/);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });
});
