/**
 * Smoke tests for the studio's static asset mount. The Hono server
 * exposes:
 *   - `/static/css/<file>.css` — the source CSS verbatim from `public/css/`
 *   - `/static/dist/<file>.js`  — the runtime-cached, esbuild-bundled
 *     client module from `<pluginRoot>/.runtime-cache/dist/`.
 *
 * Phase 23e (source-shipped re-architecture) replaced the committed
 * `public/dist/` with an on-startup esbuild that writes to
 * `.runtime-cache/dist/`. These tests trigger that build explicitly
 * (the test app is constructed via `createApp`, which doesn't go
 * through `main()`'s boot path) so the runtime cache is populated
 * before the test fetches a client module.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../src/server.ts';
import { buildClientAssets } from '../src/build-client-assets.ts';

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

function studioPluginRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', 'plugins', 'deskwork-studio');
}

describe('studio static assets', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    // The `/static/dist/*` mount serves from `<pluginRoot>/.runtime-cache/dist/`,
    // which is populated by `buildClientAssets` at server boot. Test apps
    // skip `main()`, so we trigger the build here instead.
    await buildClientAssets({ pluginRoot: studioPluginRoot() });
  });

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

  it('GET /static/dist/editorial-review-client.js serves the runtime-built module', async () => {
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
