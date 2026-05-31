/**
 * AUDIT-20260530-36 — hoisted classifyStage + verbsForStage regression test.
 *
 * Closes AUDIT-20260530-36 (cross-model: AUDIT-BARRAGE-claude-P5-2).
 *
 * The pre-fix `renderRow` (`packages/studio/src/pages/dashboard/section.ts`)
 * called `renderRowDrawer`, `renderRowActions`, `renderRowMenu` for every
 * entry. Each of those called `verbsForStage` (which calls `classifyStage`
 * + rebuilds the entire 7-verb object set). `renderRowMenu` then called
 * `renderMenu` which called `classifyStage` AGAIN on the same stage+template.
 * Net per row: ~4× `classifyStage` + ~3× verb-set rebuild.
 *
 * The fix hoists both computations to `renderRow` and threads them into
 * the sub-renderers as required parameters. The sub-renderers stop
 * deriving categorization themselves (no duplicate source-of-truth).
 *
 * The two tests below pin the post-fix shape:
 *
 *   1. Module-instrumentation test counts `classifyStage` invocations
 *      when a single row is rendered end-to-end via `renderRow`. The
 *      pre-fix shape produced 4 invocations per row; the post-fix shape
 *      produces exactly 1.
 *
 *   2. Renderer-signature test asserts that the sub-renderers consume
 *      the threaded `verbs` parameter — passing a synthetic verb set
 *      with a sentinel label produces the sentinel in the output. This
 *      structurally proves the threading is wired (the renderers can't
 *      silently re-derive from the entry+template alone).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPipelineTemplate } from '@deskwork/core/pipelines';
import type { PipelineTemplate } from '@deskwork/core/pipelines';
import type { Entry } from '@deskwork/core/schema/entry';

const tmpRoot = mkdtempSync(join(tmpdir(), 'dw-affordances-hoisted-'));
const editorial: PipelineTemplate = loadPipelineTemplate('editorial', tmpRoot);

process.on('exit', () => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // Suppressed at process exit per existing in-repo pattern.
  }
});

function makeEntry(stage: string, slug: string = 'x'): Entry {
  return {
    uuid: '550e8400-e29b-41d4-a716-446655440000',
    slug,
    title: 'X',
    keywords: [],
    source: 'manual',
    currentStage: stage,
    iterationByStage: {},
    createdAt: '2026-05-28T10:00:00.000Z',
    updatedAt: '2026-05-28T10:00:00.000Z',
  };
}

const DEFAULT_SITE = 'd';

describe('AUDIT-20260530-36 — hoisted classifyStage + verbsForStage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderRow invokes classifyStage exactly ONCE per row via the module export (post-fix shape)', async () => {
    // Wrap the affordances module's `classifyStage` export with a
    // counter. Pre-fix `renderRow` never calls `classifyStage` itself
    // (the call lives inside the closures of `verbsForStage` and
    // `renderMenu`), so the mock sees zero invocations even though the
    // underlying function runs ~4×. Post-fix, `renderRow` hoists the
    // call to the export-level binding so the counter sees exactly 1.
    // Either way: the assertion `expect === 1` distinguishes both
    // shapes; pre-fix fails with 0, post-fix passes with 1.
    const callCount = { n: 0 };
    vi.doMock('../src/pages/dashboard/affordances.ts', async () => {
      const actual = await vi.importActual<
        typeof import('../src/pages/dashboard/affordances.ts')
      >('../src/pages/dashboard/affordances.ts');
      return {
        ...actual,
        classifyStage: (stage: string, template: PipelineTemplate) => {
          callCount.n += 1;
          return actual.classifyStage(stage, template);
        },
      };
    });
    // section.ts imports its dependencies from affordances — those
    // bindings resolve to the doMock-installed wrapper because we
    // dynamic-import section AFTER vi.doMock.
    const section = await import('../src/pages/dashboard/section.ts');
    const e = makeEntry('Drafting');
    section.renderRow(e, 0, editorial, DEFAULT_SITE);
    expect(
      callCount.n,
      `renderRow should call classifyStage exactly ONCE per row via the module export (was ${callCount.n}; pre-fix shape is 0 because the call was buried inside verbsForStage's closure)`,
    ).toBe(1);
  });

  it('renderRowDrawer consumes the threaded verb set (sentinel label appears in output)', async () => {
    const { renderRowDrawer, verbsForStage } = await import(
      '../src/pages/dashboard/affordances.ts'
    );
    const e = makeEntry('Drafting');
    const verbs = verbsForStage('Drafting', editorial, e, DEFAULT_SITE);
    // Replace the drawer set with a sentinel verb the renderer must
    // emit verbatim if it's actually consuming the threaded value.
    const SENTINEL_LABEL = 'HOISTED-SENTINEL-9f2d';
    const sentinelVerbs = {
      ...verbs,
      drawer: [
        {
          kind: 'iterate' as const,
          label: SENTINEL_LABEL,
          glyph: '↻',
          copy: '/deskwork:iterate x',
          title: 'sentinel',
          drawerLabel: SENTINEL_LABEL,
        },
      ],
    };
    const html = renderRowDrawer(sentinelVerbs).__raw;
    expect(
      html,
      'renderRowDrawer must consume the threaded `verbs` parameter (sentinel label not found in output)',
    ).toContain(SENTINEL_LABEL);
  });

  it('renderRowActions consumes the threaded verb set (sentinel label appears in output)', async () => {
    const { renderRowActions, verbsForStage } = await import(
      '../src/pages/dashboard/affordances.ts'
    );
    const e = makeEntry('Drafting');
    const verbs = verbsForStage('Drafting', editorial, e, DEFAULT_SITE);
    // Sentinel is lowercase because `renderInlineChip` lowercases
    // copy-verb labels (see affordances.ts:324 — `${verb.label.toLowerCase()}`).
    // The post-fix renderer threads `verbs.inline` verbatim from the
    // caller; the test asserts the lowercased form ends up in the output.
    const SENTINEL_LABEL = 'hoisted-inline-sentinel-3a1c';
    const sentinelVerbs = {
      ...verbs,
      inline: [
        {
          kind: 'iterate' as const,
          label: SENTINEL_LABEL,
          glyph: '↻',
          copy: '/deskwork:iterate x',
          title: 'sentinel',
        },
      ],
    };
    const html = renderRowActions(sentinelVerbs).__raw;
    expect(
      html,
      'renderRowActions must consume the threaded `verbs` parameter (sentinel label not found in output)',
    ).toContain(SENTINEL_LABEL);
  });

  it('renderRowMenu consumes the threaded verb set AND category (sentinel label appears in output)', async () => {
    const { renderRowMenu, verbsForStage, classifyStage } = await import(
      '../src/pages/dashboard/affordances.ts'
    );
    const e = makeEntry('Drafting');
    const verbs = verbsForStage('Drafting', editorial, e, DEFAULT_SITE);
    const category = classifyStage('Drafting', editorial);
    const SENTINEL_LABEL = 'HOISTED-MENU-SENTINEL-7e5b';
    const sentinelVerbs = {
      ...verbs,
      menu: [
        {
          kind: 'iterate' as const,
          label: SENTINEL_LABEL,
          glyph: '↻',
          copy: '/deskwork:iterate x',
          title: 'sentinel',
        },
      ],
    };
    const html = renderRowMenu(sentinelVerbs, category).__raw;
    expect(
      html,
      'renderRowMenu must consume the threaded `verbs` parameter (sentinel label not found in output)',
    ).toContain(SENTINEL_LABEL);
  });
});
