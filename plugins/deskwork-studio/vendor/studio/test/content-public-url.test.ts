/**
 * Phase 19d — content tree public-URL hover hint.
 *
 * When a tracked content node lives at an fs path whose leaf segment
 * differs from the entry's slug (e.g. operator renamed the directory
 * but kept the SEO slug), the tree row surfaces the public URL as a
 * hover hint. This test exercises that behavior end-to-end via the
 * studio drilldown route.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { DeskworkConfig } from '@deskwork/core/config';
import { writeCalendar } from '@deskwork/core/calendar';
import type {
  CalendarEntry,
  EditorialCalendar,
} from '@deskwork/core/types';
import { createApp } from '../src/server.ts';

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

const KNOWN_ID = '99999999-9999-4999-8999-999999999999';

describe('content tree — public-URL hover hint (Phase 19d)', () => {
  let root: string;
  let cfg: DeskworkConfig;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deskwork-pubhint-'));
    cfg = makeConfig();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('shows /blog/<slug> hint when fs leaf differs from entry slug', () => {
    // Entry's slug is "the-outbound" (the public URL), but it lives
    // at "the-outbound-novel" on disk (operator renamed for clarity).
    // The tree row should surface the public URL hint.
    const cal: EditorialCalendar = {
      entries: [
        entry({
          id: KNOWN_ID,
          slug: 'the-outbound',
          title: 'The Outbound',
          stage: 'Drafting',
        }),
      ],
      distributions: [],
    };
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeCalendar(join(root, cfg.sites.wc.calendarPath), cal);

    // Filesystem layout: directory name differs from slug; index.md
    // carries the matching frontmatter id so the binding works.
    const fileDir = join(root, 'src/content/projects/the-outbound-novel');
    mkdirSync(fileDir, { recursive: true });
    writeFileSync(
      join(fileDir, 'index.md'),
      `---\ndeskwork:\n  id: ${KNOWN_ID}\ntitle: The Outbound\n---\n\n# The Outbound\n\nBody.\n`,
      'utf-8',
    );

    const app = createApp({ projectRoot: root, config: cfg });
    return Promise.resolve(
      app.fetch(new Request('http://x/dev/content/wc/the-outbound-novel')),
    ).then(async (res) => {
      expect(res.status).toBe(200);
      const html = await res.text();
      // The hint surfaces when path leaf ("the-outbound-novel")
      // differs from the entry's slug ("the-outbound").
      expect(html).toContain('tree-row__public-url');
      expect(html).toContain('/blog/the-outbound');
      expect(html).toContain('public URL on the host site');
    });
  });

  it('omits the public-URL hint when fs leaf matches entry slug', () => {
    // Standard case: directory name === slug. No hint needed.
    const cal: EditorialCalendar = {
      entries: [
        entry({
          id: KNOWN_ID,
          slug: 'flat-post',
          title: 'Flat Post',
          stage: 'Drafting',
        }),
      ],
      distributions: [],
    };
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeCalendar(join(root, cfg.sites.wc.calendarPath), cal);

    const fileDir = join(root, 'src/content/projects/flat-post');
    mkdirSync(fileDir, { recursive: true });
    writeFileSync(
      join(fileDir, 'index.md'),
      `---\ndeskwork:\n  id: ${KNOWN_ID}\ntitle: Flat Post\n---\n\n# Flat\n\nBody.\n`,
      'utf-8',
    );

    const app = createApp({ projectRoot: root, config: cfg });
    return Promise.resolve(
      app.fetch(new Request('http://x/dev/content/wc/flat-post')),
    ).then(async (res) => {
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).not.toContain('tree-row__public-url');
    });
  });
});
