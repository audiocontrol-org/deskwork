/**
 * Phase 19d — per-request content-index memoization.
 *
 * The studio builds a content index per HTTP request (not per page
 * render). When multiple renderers in a single request need the index
 * for the same site, only one build should run; subsequent retrievals
 * reuse the cache. A new request rebuilds — keeps the index always-
 * fresh against fs changes between requests.
 *
 * The memo lives on the Hono context. We verify the contract by
 * injecting a spy via `setIndexBuilder` and counting invocations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type {
  CalendarEntry,
  EditorialCalendar,
} from '@deskwork/core/types';
import { buildContentIndex } from '@deskwork/core/content-index';
import type { ContentIndex } from '@deskwork/core/content-index';
import { createApp } from '../src/server.ts';
import { setIndexBuilder, resetIndexBuilder } from '../src/request-context.ts';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: {
      wc: {
        host: 'writingcontrol.example',
        contentDir: 'src/content/projects',
        calendarPath: 'docs/cal.md',
        blogFilenameTemplate: '{slug}/index.md',
      },
    },
    defaultSite: 'wc',
  };
}

function entry(overrides: Partial<CalendarEntry>): CalendarEntry {
  return {
    slug: 'placeholder',
    title: 'Placeholder',
    description: '',
    stage: 'Drafting',
    targetKeywords: [],
    source: 'manual',
    ...overrides,
  };
}

describe('request-context — per-request content-index memoization', () => {
  let root: string;
  let cfg: DeskworkConfig;
  let buildCalls: { site: string }[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-req-ctx-'));
    cfg = makeConfig();
    buildCalls = [];

    // Spy: every call records its (projectRoot, config, site) tuple
    // and delegates to the real builder.
    setIndexBuilder(
      (
        projectRoot: string,
        spyConfig: DeskworkConfig,
        site: string,
      ): ContentIndex => {
        buildCalls.push({ site });
        return buildContentIndex(projectRoot, spyConfig, site);
      },
    );

    // Seed a calendar with one entry so the route does meaningful work.
    const cal: EditorialCalendar = {
      entries: [
        entry({
          id: '11111111-1111-4111-8111-111111111111',
          slug: 'sample',
          title: 'Sample',
          stage: 'Drafting',
        }),
      ],
      distributions: [],
    };
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeCalendar(join(root, cfg.sites.wc.calendarPath), cal);
  });

  afterEach(() => {
    resetIndexBuilder();
    rmSync(root, { recursive: true, force: true });
  });

  it('builds the index once per request even when multiple renderers ask', async () => {
    // The drilldown route renders both the tree (top render) AND the
    // detail panel (selected node). Both call paths reach into
    // buildContentTree / scrapbook lookups. With the per-request memo
    // in place, only ONE buildContentIndex call should fire for `wc`.
    const app = createApp({ projectRoot: root, config: cfg });

    const res = await app.fetch(
      new Request('http://x/dev/content/wc/sample?node=sample'),
    );
    expect(res.status).toBe(200);

    const wcCalls = buildCalls.filter((c) => c.site === 'wc');
    expect(wcCalls.length).toBe(1);
  });

  it('rebuilds the index on a new request', async () => {
    // Each request gets a fresh memo cache. Two requests → two builds
    // (no global cache → no stale-cache invariant to maintain).
    const app = createApp({ projectRoot: root, config: cfg });

    await app.fetch(new Request('http://x/dev/content/wc/sample'));
    await app.fetch(new Request('http://x/dev/content/wc/sample'));

    const wcCalls = buildCalls.filter((c) => c.site === 'wc');
    expect(wcCalls.length).toBe(2);
  });
});
