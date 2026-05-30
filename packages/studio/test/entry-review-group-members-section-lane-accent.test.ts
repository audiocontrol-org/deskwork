/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260529-38 — member card + list-row lane-accent CSS must key on
 * `data-template-id` so any lane bound to the editorial / visual template
 * picks up its accent color, regardless of the lane's literal id.
 *
 * The pre-fix surface emitted `<a class="er-members-card lane-${laneId}">`
 * and `<li class="er-member-row lane-${laneId}">` with NO `data-template-id`
 * attribute, even though the CSS at entry-review-members.css declared
 * `.er-members-card[data-template-id="editorial"]` and
 * `.er-member-row[data-template-id="editorial"]` accent rules. Those
 * selectors were dead — they never matched the markup. Lanes whose id
 * was not literally `default` (e.g. `essays`, `articles`) bound to the
 * editorial template got a proof-blue swim head but FADED cards + rows.
 *
 * This test:
 *   1. Calls `renderMembersSection` directly with an `essays` lane
 *      (NOT `default`) bound to the `editorial` template.
 *   2. Asserts the card AND list-row each carry `data-template-id="editorial"`.
 *   3. Loads the actual shipped `entry-review-members.css` and
 *      `editorial-review.css` (for the `--er-proof-blue` token), injects
 *      both into a jsdom doc with the rendered markup, and asserts the
 *      computed `border-left-color` matches the proof-blue token. Per
 *      `.claude/rules/ui-verification.md` the attribute presence is
 *      necessary but not sufficient — the CSS must actually paint
 *      correctly.
 *
 * The test renders directly via `renderMembersSection` rather than
 * booting the studio app because the jsdom environment + esbuild's
 * server-side bootstrap don't compose cleanly (esbuild's TextEncoder
 * invariant trips). Direct render is equivalent for the assertion
 * surface — the section's HTML is the same whether produced via the
 * server route or the renderer function.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  renderMembersSection,
  type RenderMembersSectionInput,
} from '@/pages/entry-review/members-section.ts';
import type { MemberItem } from '@/pages/entry-review/data.ts';
import type { Entry } from '@deskwork/core/schema/entry';
import type { LaneConfig } from '@deskwork/core/lanes';
import type { PipelineTemplate } from '@deskwork/core/pipelines';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadCss(relativePath: string): string {
  const cssPath = join(
    __dirname,
    '..',
    '..',
    '..',
    'plugins',
    'deskwork-studio',
    'public',
    'css',
    relativePath,
  );
  return readFileSync(cssPath, 'utf8');
}

function injectStyle(text: string): void {
  const style = document.createElement('style');
  style.textContent = text;
  document.head.appendChild(style);
}

const GROUP_UUID    = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MEMBER_A_UUID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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

function makeEditorialTemplate(): PipelineTemplate {
  // Mirror the editorial template's structure used elsewhere in the
  // studio tests — linear pipeline + off-pipeline stages. The actual
  // stage list is not under test here; we only need the template
  // bucketing to fire so a swim is rendered.
  return {
    id: 'editorial',
    name: 'Editorial',
    linearStages: ['Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published'],
    offPipelineStages: ['Blocked', 'Cancelled'],
  } as PipelineTemplate;
}

function makeRenderInput(): RenderMembersSectionInput {
  const group = makeEntry({
    uuid: GROUP_UUID,
    slug: 'essays-collection',
    title: 'Essays collection',
    currentStage: 'Drafting',
    lane: 'essays',
    members: [MEMBER_A_UUID],
    artifactPath: 'docs/essays-collection/index.md',
  });
  const member = makeEntry({
    uuid: MEMBER_A_UUID,
    slug: 'essay-on-typography',
    title: 'Essay on typography',
    currentStage: 'Drafting',
    lane: 'essays',
  });
  const laneConfig: LaneConfig = {
    id: 'essays',
    name: 'Essays',
    pipelineTemplate: 'editorial',
    contentDir: 'docs/essays',
  };
  const template = makeEditorialTemplate();
  const orderedMembers: MemberItem[] = [{ kind: 'resolved', entry: member }];
  return {
    group,
    members: [member],
    missingMemberUuids: [],
    corruptMemberUuids: [],
    orderedMembers,
    laneConfigsById: new Map([[laneConfig.id, laneConfig]]),
    templatesById: new Map([[template.id, template]]),
    initialViewMode: 'composed',
  };
}

describe('entry-review Members lane-accent CSS (AUDIT-20260529-38)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('emits data-template-id="editorial" on member cards AND list rows for a non-default lane bound to editorial', () => {
    const html = renderMembersSection(makeRenderInput());
    // Composed-view card carries the template attribute.
    expect(html).toMatch(
      /<a class="er-members-card[^"]*"[^>]*data-template-id="editorial"/,
    );
    // List-view row carries the template attribute.
    expect(html).toMatch(
      /<li class="er-member-row[^"]*"[^>]*data-template-id="editorial"/,
    );
  });

  it('proof-blue accent paints on the card AND list row when the lane binds the editorial template (computed style)', () => {
    const html = renderMembersSection(makeRenderInput());

    // Stage the section inside the press-check parent so the
    // `[data-review-ui="entry-review"]` selectors fire.
    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-review-ui', 'entry-review');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    // Inject the shipped CSS files in the same order the studio serves
    // them: base tokens first (editorial-review.css declares
    // `--er-proof-blue` on `:root`), then the members surface.
    injectStyle(loadCss('editorial-review.css'));
    injectStyle(loadCss('entry-review-members.css'));

    const rootStyle = window.getComputedStyle(document.documentElement);
    const proofBlueRaw = rootStyle.getPropertyValue('--er-proof-blue').trim();
    expect(proofBlueRaw.length).toBeGreaterThan(0);

    // jsdom returns the literal `var(...)` for un-resolved custom-property
    // references inside getComputedStyle. Resolve via the same trick used
    // by dashboard-row-member-popover-visibility.test.ts.
    const resolve = (value: string): string => {
      const m = /var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/.exec(value);
      if (m === null) return value;
      const resolved = rootStyle.getPropertyValue(m[1]).trim();
      return value.replace(m[0], resolved);
    };

    const card = wrapper.querySelector<HTMLElement>('.er-members-card');
    const row = wrapper.querySelector<HTMLElement>('.er-member-row');
    expect(card, 'card should exist').not.toBeNull();
    expect(row, 'row should exist').not.toBeNull();

    const cardBorderLeft = resolve(window.getComputedStyle(card!).borderLeftColor);
    const rowBorderLeft = resolve(window.getComputedStyle(row!).borderLeftColor);

    // The accent test: the card + row must take the proof-blue token,
    // NOT fall back to the faded default. Compare against the resolved
    // token value. Pre-fix this assertion fails because no template
    // selector matches the markup and the `.lane-essays` literal isn't
    // declared anywhere.
    expect(cardBorderLeft).toBe(proofBlueRaw);
    expect(rowBorderLeft).toBe(proofBlueRaw);
  });
});
