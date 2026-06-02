/**
 * Server-render contract test for the `/dev/lanes` page —
 * Task 0.43, closes AUDIT-20260530-68 (cross-model:
 * AUDIT-BARRAGE-claude-P6-2).
 *
 * The lanes page client controller (`initArchivedSection` in
 * `plugins/deskwork-studio/public/src/lanes/lanes-page.ts`) namespaces
 * its `archived-open` localStorage key by reading the lanes
 * container's `data-project-key` attribute via `resolveProjectKey`.
 * Pre-fix, the server-rendered `<main data-lanes-container>` carried
 * NO `data-project-key` attribute, so `resolveProjectKey` silently
 * fell back to `window.location.pathname` — every project on the
 * machine sharing the same `/dev/lanes` route shared one
 * `archived-open` key. The previous client-controller test masked the
 * gap by assigning `container.dataset.projectKey = 'test-proj'` by
 * hand before invoking `initLanesPage` (the TDD-blind-spot pattern
 * the finding flags).
 *
 * This test asserts the contract against the actual server output —
 * not a hand-built fixture — so the attribute must come from the
 * page renderer.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '../../src/server.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
    },
    defaultSite: 'd',
  };
}

function expectedProjectKey(projectRoot: string): string {
  // Mirror packages/studio/src/pages/dashboard/project-key.ts — sha1
  // of the project root truncated to 12 lowercase hex chars.
  return createHash('sha1').update(projectRoot).digest('hex').slice(0, 12);
}

describe('lanes-page — emits data-project-key (AUDIT-20260530-68)', () => {
  let root: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-lanes-projkey-'));
    mkdirSync(join(root, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root, '.deskwork', 'lanes'), { recursive: true });
    app = createApp({ projectRoot: root, config: makeConfig() });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('renders data-project-key="<sha1-12 of projectRoot>" on the lanes container', async () => {
    const res = await app.fetch(new Request('http://x/dev/lanes'));
    expect(res.status).toBe(200);
    const html = await res.text();

    const expected = expectedProjectKey(root);

    // The attribute must live on the same element that carries
    // data-lanes-container — that's the element the client
    // controller's resolveProjectKey() reads.
    const containerMatch = html.match(
      /<main\b[^>]*\bdata-lanes-container\b[^>]*>/,
    );
    expect(containerMatch).not.toBeNull();
    const containerTag = containerMatch![0];
    expect(containerTag).toContain(`data-project-key="${expected}"`);
  });

  it('two projects on the same machine produce different project keys (cross-project isolation)', async () => {
    const root2 = mkdtempSync(join(tmpdir(), 'deskwork-lanes-projkey-other-'));
    mkdirSync(join(root2, '.deskwork', 'entries'), { recursive: true });
    mkdirSync(join(root2, '.deskwork', 'lanes'), { recursive: true });
    const app2 = createApp({ projectRoot: root2, config: makeConfig() });
    try {
      const r1 = await app.fetch(new Request('http://x/dev/lanes'));
      const r2 = await app2.fetch(new Request('http://x/dev/lanes'));
      const h1 = await r1.text();
      const h2 = await r2.text();

      const k1 = expectedProjectKey(root);
      const k2 = expectedProjectKey(root2);
      expect(k1).not.toBe(k2);

      expect(h1).toContain(`data-project-key="${k1}"`);
      expect(h2).toContain(`data-project-key="${k2}"`);

      // And the cross-pollination shape the finding warns about
      // (project A's HTML carrying project B's key) does not happen.
      expect(h1).not.toContain(`data-project-key="${k2}"`);
      expect(h2).not.toContain(`data-project-key="${k1}"`);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });
});
