/**
 * Regression: the `missing-frontmatter-id` doctor rule is RETIRED
 * (Issue #219, option 3).
 *
 * Phase 30 reversed the binding direction — per-entry sidecars
 * (`.deskwork/entries/<uuid>.json`) are the source-of-truth and markdown
 * files are downstream artifacts. The retired rule enforced the
 * pre-Phase-30 invariant "every calendar UUID has a matching markdown
 * file with `deskwork.id` frontmatter," which no longer holds: Ideas /
 * Planned entries have no artifact until scaffolded, and non-blog
 * content types (youtube / tool) never have one. The rule therefore
 * false-positived by design.
 *
 * This test pins the retirement so the rule can't silently re-enter the
 * registry:
 *   (a) the runner's `RULES` registry carries no rule with id
 *       'missing-frontmatter-id';
 *   (b) an audit over a fixture project with an unscaffolded Ideas entry
 *       and an unscaffolded youtube/tool entry produces ZERO findings
 *       with ruleId 'missing-frontmatter-id'.
 *
 * Uses a tmp fixture tree on disk (never a mocked filesystem), mirroring
 * the doctor-overrides.test.ts bootstrap pattern.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCalendar, writeCalendar } from '../src/calendar.ts';
import { RULES, runAudit, yesInteraction } from '../src/doctor/runner.ts';
import type { DeskworkConfig } from '../src/config.ts';
import { renderEmptyCalendar } from '../src/calendar.ts';

const IDEAS_ID = '11111111-1111-4111-8111-111111111111';
const YOUTUBE_ID = '22222222-2222-4222-8222-222222222222';
const TOOL_ID = '33333333-3333-4333-8333-333333333333';

function bootstrapFixture(): { root: string; config: DeskworkConfig } {
  const root = mkdtempSync(join(tmpdir(), 'deskwork-mfi-retired-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  const calendarPath = join(root, 'docs', 'calendar.md');
  writeFileSync(calendarPath, renderEmptyCalendar(), 'utf-8');

  // Hand-build a calendar with UUID-bearing entries that have NO markdown
  // artifact on disk:
  //   - an Ideas-stage blog entry (unscaffolded — no artifact yet),
  //   - a youtube entry and a tool entry (non-blog — never have a repo file).
  const calendar = parseCalendar(renderEmptyCalendar());
  calendar.entries.push(
    {
      id: IDEAS_ID,
      slug: 'unscaffolded-idea',
      title: 'Unscaffolded Idea',
      description: '',
      stage: 'Ideas',
      targetKeywords: [],
      source: 'manual',
    },
    {
      id: YOUTUBE_ID,
      slug: 'a-youtube-entry',
      title: 'A YouTube Entry',
      description: '',
      stage: 'Ideas',
      contentType: 'youtube',
      targetKeywords: [],
      source: 'manual',
    },
    {
      id: TOOL_ID,
      slug: 'a-tool-entry',
      title: 'A Tool Entry',
      description: '',
      stage: 'Ideas',
      contentType: 'tool',
      targetKeywords: [],
      source: 'manual',
    },
  );
  writeCalendar(calendarPath, calendar);

  const config: DeskworkConfig = {
    version: 1,
    sites: {
      main: {
        host: 'example.com',
        contentDir: 'src/content',
        calendarPath: 'docs/calendar.md',
      },
    },
    defaultSite: 'main',
  };
  return { root, config };
}

describe('missing-frontmatter-id rule is retired (Issue #219)', () => {
  let root: string;
  let config: DeskworkConfig;

  beforeEach(() => {
    const fixture = bootstrapFixture();
    root = fixture.root;
    config = fixture.config;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('is absent from the doctor RULES registry', () => {
    const present = RULES.some((r) => r.id === 'missing-frontmatter-id');
    expect(present).toBe(false);
  });

  it('produces no missing-frontmatter-id findings for unscaffolded Ideas / youtube / tool entries', async () => {
    const report = await runAudit(
      { projectRoot: root, config },
      yesInteraction,
    );
    const mfiFindings = report.findings.filter(
      (f) => f.ruleId === 'missing-frontmatter-id',
    );
    expect(mfiFindings).toEqual([]);
  });
});
