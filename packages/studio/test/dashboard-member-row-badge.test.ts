/**
 * Phase 7 Task 7.3 Step 7.3.3 + 7.3.4 — dashboard row "Member of:"
 * pull-tab + popover (Direction 1 brief).
 *
 * Asserts the lane-dashboard renders an `.er-row-member-tab` on member
 * rows AND attributes the correct parent count for multi-parent
 * members. Non-member rows render NO tab.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry } from '@deskwork/core/schema/entry';
import type { DeskworkConfig } from '@deskwork/core/config';
import { createApp } from '@/server.ts';

const GROUP_A_UUID    = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GROUP_B_UUID    = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MEMBER_SOLO_UUID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MEMBER_MULTI_UUID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const NON_MEMBER_UUID  = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function makeConfig(): DeskworkConfig {
  return {
    version: 1,
    sites: { d: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
    defaultSite: 'd',
  };
}

function makeEntry(
  overrides: Partial<Entry> & Pick<Entry, 'uuid' | 'slug' | 'title' | 'currentStage'>,
): Entry {
  return {
    keywords: [],
    source: 'manual',
    iterationByStage: { [overrides.currentStage]: 1 },
    createdAt: '2026-05-29T10:00:00.000Z',
    updatedAt: '2026-05-29T10:00:00.000Z',
    ...overrides,
  } as Entry;
}

function writeLaneConfig(
  root: string,
  id: string,
  name: string,
  pipeline: string,
  contentDir: string,
): Promise<void> {
  return writeFile(
    join(root, '.deskwork', 'lanes', `${id}.json`),
    JSON.stringify({ id, name, pipelineTemplate: pipeline, contentDir }, null, 2),
  );
}

describe('dashboard row Member-of pull-tab (Phase 7 Task 7.3 Direction 1)', () => {
  let projectRoot: string;
  let cfg: DeskworkConfig;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-dash-member-tab-'));
    cfg = makeConfig();
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    await mkdir(join(projectRoot, '.deskwork', 'lanes'), { recursive: true });
    await writeFile(join(projectRoot, '.deskwork', 'config.json'), JSON.stringify(cfg));
    await writeLaneConfig(projectRoot, 'default', 'Editorial', 'editorial', 'docs');

    // Three entries that participate in the badge:
    //   - solo member (member of group A only)
    //   - multi-parent member (member of both groups A and B — count 2)
    //   - non-member (no group references it)
    await writeSidecar(projectRoot, makeEntry({
      uuid: MEMBER_SOLO_UUID,
      slug: 'solo-member',
      title: 'Solo member entry',
      currentStage: 'Drafting',
      lane: 'default',
    }));
    await writeSidecar(projectRoot, makeEntry({
      uuid: MEMBER_MULTI_UUID,
      slug: 'multi-parent',
      title: 'Multi-parent entry',
      currentStage: 'Drafting',
      lane: 'default',
    }));
    await writeSidecar(projectRoot, makeEntry({
      uuid: NON_MEMBER_UUID,
      slug: 'non-member',
      title: 'Non-member entry',
      currentStage: 'Drafting',
      lane: 'default',
    }));

    // Two groups: A includes both members; B includes only the
    // multi-parent member.
    await writeSidecar(projectRoot, makeEntry({
      uuid: GROUP_A_UUID,
      slug: 'group-a',
      title: 'Group A',
      currentStage: 'Drafting',
      lane: 'default',
      members: [MEMBER_SOLO_UUID, MEMBER_MULTI_UUID],
    }));
    await writeSidecar(projectRoot, makeEntry({
      uuid: GROUP_B_UUID,
      slug: 'group-b',
      title: 'Group B',
      currentStage: 'Drafting',
      lane: 'default',
      members: [MEMBER_MULTI_UUID],
    }));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('renders the pull-tab on member rows with the correct parent count', async () => {
    const app = createApp({ projectRoot, config: cfg });
    const res = await app.fetch(new Request('http://x/dev/editorial-studio'));
    expect(res.status).toBe(200);
    const html = await res.text();

    // Solo-member row carries the tab with count=1.
    const soloRowMatch = sliceRow(html, MEMBER_SOLO_UUID);
    expect(soloRowMatch).toContain('er-row-member-tab');
    expect(soloRowMatch).toContain('data-parent-count="1"');
    expect(soloRowMatch).toMatch(/er-row-member-tab-count[^>]*>1</);

    // Multi-parent row carries the tab with count=2 (group A + group B).
    const multiRowMatch = sliceRow(html, MEMBER_MULTI_UUID);
    expect(multiRowMatch).toContain('er-row-member-tab');
    expect(multiRowMatch).toContain('data-parent-count="2"');
    expect(multiRowMatch).toMatch(/er-row-member-tab-count[^>]*>2</);

    // Multi-parent row's popover lists both parent groups as
    // clipboard-copy links.
    expect(multiRowMatch).toContain('er-row-member-popover');
    expect(multiRowMatch).toContain(`data-parent-uuid="${GROUP_A_UUID}"`);
    expect(multiRowMatch).toContain(`data-parent-uuid="${GROUP_B_UUID}"`);

    // AUDIT-20260529-36 (Phase 7 Task 7.9) — the popover MUST be
    // collapsed at rest. The original test only asserted the
    // popover markup was PRESENT (`toContain('er-row-member-popover')`),
    // which let the cascade-order bug ship: the CSS rule
    // `.er-row-member-popover { display: block }` won over the
    // UA `[hidden]` rule and painted the popover on every member
    // row at all times. Closing the test-coverage gap by checking
    // the CSS contract that gates visibility.
    //
    // The full computed-visibility check (with the CSS injected
    // into jsdom + getComputedStyle) lives in the sibling test
    // `dashboard-row-member-popover-visibility.test.ts`. Here we
    // assert the server-side contract that the popover ships with
    // the `hidden` attribute AND that the row shell does NOT
    // carry `.is-member-expanded` at render time — together these
    // ensure the popover starts in the collapsed state.
    expect(multiRowMatch).toMatch(
      /<div\s+class="er-row-member-popover"[^>]*\bhidden\b/,
    );
    expect(multiRowMatch).not.toContain('is-member-expanded');

    // Non-member row carries NO tab.
    const nonMemberRowMatch = sliceRow(html, NON_MEMBER_UUID);
    expect(nonMemberRowMatch).not.toContain('er-row-member-tab');
  });
});

/**
 * Slice the HTML to a single row's `[data-row-shell]` substring for a
 * given UUID. The dashboard emits each row as a single shell so we can
 * scope assertions per entry.
 */
function sliceRow(html: string, uuid: string): string {
  const anchor = `data-uuid="${uuid}"`;
  const anchorIdx = html.indexOf(anchor);
  if (anchorIdx === -1) return '';
  // Walk backwards to find the row shell's opening `<div class="er-row-shell`.
  const shellStart = html.lastIndexOf('<div class="er-row-shell', anchorIdx);
  if (shellStart === -1) return '';
  // The row shell ends at the next `</div>` whose nesting balance returns to zero.
  let depth = 0;
  let i = shellStart;
  while (i < html.length) {
    const openIdx = html.indexOf('<div', i);
    const closeIdx = html.indexOf('</div>', i);
    if (closeIdx === -1) return html.slice(shellStart);
    if (openIdx !== -1 && openIdx < closeIdx) {
      depth += 1;
      i = openIdx + 4;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return html.slice(shellStart, closeIdx + '</div>'.length);
    }
    i = closeIdx + '</div>'.length;
  }
  return html.slice(shellStart);
}
