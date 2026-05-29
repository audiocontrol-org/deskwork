/**
 * Unit tests for the dashboard's Shortform-by-platform section renderer
 * (Step 2.2.9 — studio-mobile-first feature workplan).
 *
 * Assertions derive from the spec at DESIGN-STANDARDS.md § Desk
 * information architecture + the v7 mockup at
 * `plugins/deskwork-studio/public/mockups/desk-states-v7.html`, NOT from
 * implementation details. Per `.claude/rules/ui-verification.md`, every
 * assertion in this file traces back to a visible promise the operator
 * could re-run with their eyes.
 */

import { describe, it, expect } from 'vitest';
import {
  renderShortformSection,
  renderShortformPlatformTile,
  renderShortformSectionHead,
  renderShortformRow,
} from '../src/pages/dashboard/shortform-section.ts';
import type { DraftWorkflowItem } from '@deskwork/core/review/types';
import type { Platform } from '@deskwork/core/types';

function workflow(overrides: Partial<DraftWorkflowItem> = {}): DraftWorkflowItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    site: 'd',
    slug: 'sample-shortform',
    contentKind: 'shortform',
    platform: 'linkedin',
    state: 'in-review',
    currentVersion: 1,
    createdAt: '2026-05-10T12:00:00.000Z',
    updatedAt: '2026-05-12T10:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-05-12T12:00:00.000Z');

function buildMap(
  entries: ReadonlyArray<readonly [Platform, readonly DraftWorkflowItem[]]>,
): ReadonlyMap<Platform, readonly DraftWorkflowItem[]> {
  // Insertion order matters — the renderer iterates DASHBOARD_PLATFORM_ORDER
  // explicitly, but tests pass a Map shaped like the production loader to
  // keep the contract realistic.
  const m = new Map<Platform, readonly DraftWorkflowItem[]>();
  for (const [k, v] of entries) m.set(k, v);
  return m;
}

describe('renderShortformSectionHead', () => {
  it('emits the section glyph (⊟) and the "Shortform · by platform" label', () => {
    const out = renderShortformSectionHead(3).__raw;
    expect(out).toContain('⊟');
    expect(out).toContain('Shortform · by platform');
  });

  it('emits the er-desk-section-head--shortform variant class so CSS applies the blue accent', () => {
    const out = renderShortformSectionHead(3).__raw;
    expect(out).toContain('er-desk-section-head--shortform');
  });

  it('surfaces the total workflow count, singular vs plural', () => {
    expect(renderShortformSectionHead(0).__raw).toContain('0 workflows');
    expect(renderShortformSectionHead(1).__raw).toContain('1 workflow');
    expect(renderShortformSectionHead(7).__raw).toContain('7 workflows');
  });
});

describe('renderShortformPlatformTile', () => {
  it('renders a button with data-stage-tile + data-stage-section-group="shortform"', () => {
    const out = renderShortformPlatformTile('linkedin', 2).__raw;
    expect(out).toMatch(/<button[^>]*data-stage-tile="shortform-linkedin"/);
    expect(out).toContain('data-stage-section-group="shortform"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-controls="shortform-linkedin"');
  });

  it('renders the platform badge with the right variant class per platform', () => {
    expect(renderShortformPlatformTile('linkedin', 1).__raw).toContain(
      'er-platform-badge--linkedin',
    );
    expect(renderShortformPlatformTile('reddit', 1).__raw).toContain(
      'er-platform-badge--reddit',
    );
    expect(renderShortformPlatformTile('youtube', 1).__raw).toContain(
      'er-platform-badge--youtube',
    );
    expect(renderShortformPlatformTile('instagram', 1).__raw).toContain(
      'er-platform-badge--instagram',
    );
  });

  it('renders the per-platform badge text matching the mockup (in / r/ / @ / IG)', () => {
    expect(renderShortformPlatformTile('linkedin', 1).__raw).toContain('>in</span>');
    expect(renderShortformPlatformTile('reddit', 1).__raw).toContain('>r/</span>');
    expect(renderShortformPlatformTile('youtube', 1).__raw).toContain('>@</span>');
    expect(renderShortformPlatformTile('instagram', 1).__raw).toContain('>IG</span>');
  });

  it('renders the platform display names (LinkedIn / Reddit / YouTube / Instagram)', () => {
    expect(renderShortformPlatformTile('linkedin', 1).__raw).toContain('LinkedIn');
    expect(renderShortformPlatformTile('reddit', 1).__raw).toContain('Reddit');
    expect(renderShortformPlatformTile('youtube', 1).__raw).toContain('YouTube');
    expect(renderShortformPlatformTile('instagram', 1).__raw).toContain('Instagram');
  });

  it('surfaces the per-tile count', () => {
    expect(renderShortformPlatformTile('linkedin', 5).__raw).toMatch(
      /<span class="num">5<\/span>/,
    );
  });

  it('empty platforms render disabled + .is-empty', () => {
    const empty = renderShortformPlatformTile('instagram', 0).__raw;
    expect(empty).toContain('is-empty');
    expect(empty).toContain('disabled');
  });

  it('non-empty platforms render WITHOUT disabled + WITHOUT .is-empty', () => {
    const filled = renderShortformPlatformTile('linkedin', 3).__raw;
    expect(filled).not.toContain('is-empty');
    expect(filled).not.toMatch(/<button[^>]*\sdisabled/);
  });
});

describe('renderShortformRow', () => {
  it('renders the workflow slug, with the slug linked to /dev/editorial-review/<workflow.id>', () => {
    const w = workflow({ id: 'abc123', slug: 'my-post' });
    const out = renderShortformRow(w, NOW).__raw;
    expect(out).toContain('my-post');
    expect(out).toContain('href="/dev/editorial-review/abc123"');
  });

  it('renders the channel when present, omits it when absent', () => {
    const withChannel = renderShortformRow(
      workflow({ channel: 'r/synthdiy' }),
      NOW,
    ).__raw;
    expect(withChannel).toContain('r/synthdiy');

    const noChannel = renderShortformRow(workflow({ channel: undefined }), NOW).__raw;
    expect(noChannel).not.toContain('er-row-shell-channel');
  });

  it('renders the version as v<n>', () => {
    const out = renderShortformRow(workflow({ currentVersion: 3 }), NOW).__raw;
    expect(out).toContain('v3');
  });

  it('renders a relative-time string for updatedAt', () => {
    // updatedAt is 2 hours before NOW (2026-05-12T12 - 2026-05-12T10 = 2h).
    const out = renderShortformRow(
      workflow({ updatedAt: '2026-05-12T10:00:00.000Z' }),
      NOW,
    ).__raw;
    expect(out).toContain('2h ago');
  });

  it('per DESKWORK-STATE-MACHINE.md Commandment III: rows do NOT render er-stamp / er-stamp-<state> chrome', () => {
    const out = renderShortformRow(
      workflow({ state: 'in-review' }),
      NOW,
    ).__raw;
    expect(out).not.toContain('er-stamp');
  });

  it('per THESIS Consequence 2: rows have no POST-mutation attributes; only navigation anchors', () => {
    const out = renderShortformRow(workflow(), NOW).__raw;
    // No data-action triggers; no form posts; no button[data-copy].
    expect(out).not.toMatch(/data-action=/);
    expect(out).not.toMatch(/<button/);
    expect(out).not.toMatch(/data-copy=/);
  });

  it('emits the trailing ⋮ as a navigation anchor to the review surface (not a popover button)', () => {
    const w = workflow({ id: 'work-id-1', slug: 'placeholder' });
    const out = renderShortformRow(w, NOW).__raw;
    // The ⋮ glyph lives inside an <a class="er-row-shell-link"> per spec.
    expect(out).toMatch(
      /<a class="er-row-shell-link"[^>]*href="\/dev\/editorial-review\/work-id-1"[^>]*>⋮<\/a>/,
    );
  });

  it('row shell carries data-row-shell + workflow metadata (workflowId, platform, slug, site)', () => {
    const w = workflow({
      id: 'abc-def',
      slug: 'mypost',
      platform: 'youtube',
      site: 'd',
    });
    const out = renderShortformRow(w, NOW).__raw;
    expect(out).toContain('data-row-shell');
    expect(out).toContain('data-workflow-id="abc-def"');
    expect(out).toContain('data-platform="youtube"');
    expect(out).toContain('data-slug="mypost"');
    expect(out).toContain('data-site="d"');
  });
});

describe('renderShortformSection', () => {
  it('emits the section head with ⊟ glyph + "Shortform · by platform" label', () => {
    const out = renderShortformSection(
      {
        shortformByPlatform: buildMap([
          ['linkedin', []],
          ['reddit', []],
          ['youtube', []],
          ['instagram', []],
        ]),
        totalCount: 0,
      },
      NOW,
    ).__raw;
    expect(out).toContain('⊟');
    expect(out).toContain('Shortform · by platform');
  });

  it('section head count reflects total workflows across platforms', () => {
    const out = renderShortformSection(
      {
        shortformByPlatform: buildMap([
          ['linkedin', [workflow({ id: 'a', platform: 'linkedin' })]],
          ['reddit', [workflow({ id: 'b', platform: 'reddit' })]],
          ['youtube', []],
          ['instagram', []],
        ]),
        totalCount: 2,
      },
      NOW,
    ).__raw;
    expect(out).toContain('2 workflows');
  });

  it('renders all 4 platforms even when zero, in LinkedIn → Reddit → YouTube → Instagram order', () => {
    const out = renderShortformSection(
      {
        shortformByPlatform: buildMap([
          ['linkedin', []],
          ['reddit', []],
          ['youtube', []],
          ['instagram', []],
        ]),
        totalCount: 0,
      },
      NOW,
    ).__raw;
    const liIdx = out.indexOf('data-stage-tile="shortform-linkedin"');
    const rdIdx = out.indexOf('data-stage-tile="shortform-reddit"');
    const ytIdx = out.indexOf('data-stage-tile="shortform-youtube"');
    const igIdx = out.indexOf('data-stage-tile="shortform-instagram"');
    expect(liIdx).toBeGreaterThan(-1);
    expect(rdIdx).toBeGreaterThan(liIdx);
    expect(ytIdx).toBeGreaterThan(rdIdx);
    expect(igIdx).toBeGreaterThan(ytIdx);
  });

  it('empty platforms render as disabled + .is-empty', () => {
    const out = renderShortformSection(
      {
        shortformByPlatform: buildMap([
          ['linkedin', [workflow({ id: 'a', platform: 'linkedin' })]],
          ['reddit', []],
          ['youtube', []],
          ['instagram', []],
        ]),
        totalCount: 1,
      },
      NOW,
    ).__raw;
    // Reddit, YouTube, Instagram are empty.
    expect(out).toMatch(/data-stage-tile="shortform-reddit"[^>]*disabled/);
    expect(out).toMatch(/data-stage-tile="shortform-youtube"[^>]*disabled/);
    expect(out).toMatch(/data-stage-tile="shortform-instagram"[^>]*disabled/);
    // LinkedIn is not.
    expect(out).not.toMatch(/data-stage-tile="shortform-linkedin"[^>]*disabled/);
  });

  it('emits one row per workflow inside its platform row group', () => {
    const out = renderShortformSection(
      {
        shortformByPlatform: buildMap([
          [
            'linkedin',
            [
              workflow({ id: 'one', slug: 'first-post', platform: 'linkedin' }),
              workflow({ id: 'two', slug: 'second-post', platform: 'linkedin' }),
            ],
          ],
          ['reddit', []],
          ['youtube', []],
          ['instagram', []],
        ]),
        totalCount: 2,
      },
      NOW,
    ).__raw;
    expect(out).toContain('first-post');
    expect(out).toContain('second-post');
    expect(out).toContain('data-workflow-id="one"');
    expect(out).toContain('data-workflow-id="two"');
  });

  it('per Commandment III: NO er-stamp chrome anywhere in the section, even with workflows in various states', () => {
    const out = renderShortformSection(
      {
        shortformByPlatform: buildMap([
          [
            'linkedin',
            [
              workflow({ id: 'a', platform: 'linkedin', state: 'in-review' }),
              workflow({ id: 'b', platform: 'linkedin', state: 'iterating' }),
            ],
          ],
          [
            'reddit',
            [workflow({ id: 'c', platform: 'reddit', state: 'approved' })],
          ],
          ['youtube', []],
          ['instagram', []],
        ]),
        totalCount: 3,
      },
      NOW,
    ).__raw;
    expect(out).not.toContain('er-stamp');
  });

  it('emits a row-group container per platform (carries data-stage-section so the controller can collapse it)', () => {
    const out = renderShortformSection(
      {
        shortformByPlatform: buildMap([
          ['linkedin', [workflow({ id: 'a', platform: 'linkedin' })]],
          ['reddit', []],
          ['youtube', []],
          ['instagram', []],
        ]),
        totalCount: 1,
      },
      NOW,
    ).__raw;
    expect(out).toContain('data-stage-section="shortform-linkedin"');
    expect(out).toContain('data-stage-section="shortform-reddit"');
    expect(out).toContain('data-stage-section="shortform-youtube"');
    expect(out).toContain('data-stage-section="shortform-instagram"');
  });
});
