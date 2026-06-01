/**
 * @vitest-environment jsdom
 *
 * Phase 8 Task 8.7 — cross-cutting verification of Phase 8 schema
 * fields against the EXISTING markdown review surface.
 *
 * The Phase 8 work added five additive fields to `CommentAnnotation`
 * (`replyTo`, `attachments`, `spatialAnchor`) and `AddressAnnotation`
 * (required `reason` on `disposition === 'addressed'`), plus a per-
 * comment inline diff-expansion affordance on the addressed badge.
 * The additive shape means the existing markdown review surface
 * INHERITS the new behaviors for free — no separate markdown render
 * pass was required to surface threads, addressed reasons, or the
 * diff expansion.
 *
 * This test is the integration superset that proves that inheritance
 * holds. Where individual per-step tests already exist
 * (`thread-render.test.ts`, `addressed-badge-expand.test.ts`,
 * `addressed-badge-legacy.test.ts`, `addressed-badge-empty-diff.test.ts`),
 * those cover the affordance in isolation. This test exercises ALL
 * the additive fields together on a single rendered markdown entry,
 * to catch any cross-cutting regression that a per-step test would
 * miss.
 *
 * Render-side support state as of Phase 8 Task 8.7 (per pre-flight
 * audit in `plugins/deskwork-studio/public/src/entry-review/`):
 *
 *   Field                         | Schema | Render
 *   ------------------------------|--------|-----------------------
 *   replyTo                       |  YES   | YES (Task 8.2)
 *   addressed reason              |  YES   | YES (Step 8.5.3)
 *   inline diff expansion         |  YES   | YES (Task 8.6)
 *   attachments                   |  YES   | NO (Task 8.3 / 8.4 future)
 *   spatialAnchor                 |  YES   | NO (Phase 10 / 11 future)
 *
 * For fields whose render-side has shipped, the assertion form is
 * "the rendered DOM surfaces the field correctly." For fields whose
 * render-side has NOT shipped, the assertion form is "the field
 * survives into the parsed `CommentAnnotation` object so a future
 * Phase 10/11 + Task 8.3/8.4 render pass can read it without a
 * schema-shape migration."
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildSidebarThread } from '../../../../plugins/deskwork-studio/public/src/entry-review/thread-render.ts';
import { groupCommentsIntoThreads } from '../../../../plugins/deskwork-studio/public/src/entry-review/threads.ts';
import {
  type DiffSliceFetcher,
  type DiffSlicePayload,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/sidebar-render.ts';
import type {
  AddressAnnotation,
  CommentAnnotation,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/state.ts';

function comment(over: Partial<CommentAnnotation> = {}): CommentAnnotation {
  return {
    id: over.id ?? 'c-root',
    type: 'comment',
    workflowId: 'entry-uuid',
    version: 1,
    range: { start: 0, end: 10 },
    text: over.text ?? 'a comment',
    createdAt: over.createdAt ?? '2026-05-31T00:00:00.000Z',
    ...over,
  };
}

function makeDeps(
  addressByCommentId: Map<string, AddressAnnotation> = new Map(),
  fetchDiffSlice?: DiffSliceFetcher,
): Parameters<typeof buildSidebarThread>[2] {
  const draftBody = document.createElement('div');
  draftBody.textContent =
    'Paragraph two has the redundant adverb that the operator addressed.';
  document.body.appendChild(draftBody);
  const deps: Parameters<typeof buildSidebarThread>[2] = {
    draftBody,
    addressByCommentId,
    onResolve: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onHoverEnter: vi.fn(),
    onHoverLeave: vi.fn(),
    onScrollTo: vi.fn(),
  };
  if (fetchDiffSlice !== undefined) {
    return { ...deps, fetchDiffSlice };
  }
  return deps;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Phase 8 cross-cutting markdown review benefit (Task 8.7)', () => {
  it(
    'renders a root + two replies + addressed badge with reason on a single ' +
      'markdown entry — every Phase 8 additive field surfaces correctly',
    async () => {
      // Realistic comment graph the markdown surface would receive
      // from the entry-keyed annotations endpoint:
      //   - One root comment.
      //   - Two replies pointing at the root (via replyTo).
      //   - One addressed disposition on the root with a non-empty
      //     reason (Step 8.1.2 + 8.5 contract).
      //   - The root is "addressed" in revision 3, so the diff-slice
      //     fetcher will be invoked when the operator expands the
      //     badge.
      const root = comment({
        id: 'c-root',
        text: 'this paragraph still drifts from the voice guide',
        createdAt: '2026-05-31T00:00:00.000Z',
      });
      const reply1 = comment({
        id: 'c-r1',
        replyTo: 'c-root',
        text: 'agreed — paragraph two is the worst offender',
        createdAt: '2026-05-31T00:01:00.000Z',
      });
      const reply2 = comment({
        id: 'c-r2',
        replyTo: 'c-root',
        text: 'lifted the "obviously" — cleaner now',
        createdAt: '2026-05-31T00:02:00.000Z',
      });

      const addressed: AddressAnnotation = {
        id: 'a-c-root',
        type: 'address',
        workflowId: 'entry-uuid',
        commentId: 'c-root',
        version: 3,
        disposition: 'addressed',
        reason: 'tightened paragraph two — removed the redundant "obviously"',
        createdAt: '2026-05-31T00:05:00.000Z',
      };

      // Sanity: the grouping helper produces a single thread with the
      // root + two replies in createdAt-ascending order. This is the
      // upstream contract Task 8.2 + Task 8.7 inherit.
      const threads = groupCommentsIntoThreads([root, reply1, reply2]);
      expect(threads).toHaveLength(1);
      expect(threads[0].root.id).toBe('c-root');
      expect(threads[0].replies.map((r) => r.id)).toEqual(['c-r1', 'c-r2']);
      expect(threads[0].isOrphan).toBe(false);

      // Wire the diff-slice fetcher with a realistic payload — the
      // markdown surface fires this when the operator clicks the
      // addressed badge. The fetcher's contract is identical
      // regardless of whether the entry is markdown or graphical;
      // markdown entries see the unified-diff hunks here.
      const diffPayload: DiffSlicePayload = {
        reason:
          'tightened paragraph two — removed the redundant "obviously"',
        hunks: [
          {
            oldStart: 12,
            oldLines: 1,
            newStart: 12,
            newLines: 1,
            lines: [
              '-obviously, the answer is unambiguous',
              '+the answer is unambiguous',
            ],
          },
        ],
      };
      const fetchDiffSlice: DiffSliceFetcher = vi.fn(() =>
        Promise.resolve(diffPayload),
      );

      const addressByCommentId = new Map<string, AddressAnnotation>([
        ['c-root', addressed],
      ]);

      const li = buildSidebarThread(
        threads[0],
        'current',
        makeDeps(addressByCommentId, fetchDiffSlice),
      );
      document.body.appendChild(li);

      // ---- Replies + reply badge (Task 8.2) ----
      // The root card carries the reply-count badge inside its
      // actions row (component-attached affordance per
      // `.claude/rules/affordance-placement.md`).
      const badge = li.querySelector<HTMLButtonElement>(
        '.er-marginalia-thread-toggle',
      );
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('2 replies');
      expect(badge?.getAttribute('aria-pressed')).toBe('false');
      expect(li.dataset.hasReplies).toBe('true');
      expect(li.dataset.replyCount).toBe('2');

      // Replies start collapsed.
      const repliesContainer = li.querySelector<HTMLElement>(
        '.er-marginalia-thread-replies',
      );
      expect(repliesContainer).not.toBeNull();
      expect(repliesContainer?.hidden).toBe(true);

      // Both replies rendered as nested reply cards.
      const replyCards = repliesContainer?.querySelectorAll(
        '.er-marginalia-item--reply',
      );
      expect(replyCards?.length).toBe(2);

      // Click the badge → replies become visible.
      badge?.click();
      expect(repliesContainer?.hidden).toBe(false);
      expect(badge?.getAttribute('aria-pressed')).toBe('true');

      // ---- Addressed badge with reason (Step 8.5.3) ----
      // The root card carries an addressed stamp; the reason renders
      // inline as `.er-marginalia-stamp-reason`. New-data path — no
      // `data-legacy-missing-reason` attribute.
      const stamp = li.querySelector<HTMLElement>('.er-marginalia-stamp');
      expect(stamp).not.toBeNull();
      expect(stamp?.dataset.disposition).toBe('addressed');
      const reason = stamp?.querySelector<HTMLElement>(
        '.er-marginalia-stamp-reason',
      );
      expect(reason).not.toBeNull();
      expect(reason?.textContent).toBe(
        'tightened paragraph two — removed the redundant "obviously"',
      );
      expect(reason?.dataset.legacyMissingReason).toBeUndefined();

      // ---- Inline diff expansion on the addressed badge (Task 8.6) ----
      // The stamp is click-interactive (a fetcher was wired). Click
      // it → diff-slice fetched → expansion rendered as the stamp's
      // immediate next sibling per the on-component placement rule.
      expect(stamp?.getAttribute('role')).toBe('button');
      expect(stamp?.dataset.expandable).toBe('true');

      stamp?.click();
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchDiffSlice).toHaveBeenCalledTimes(1);
      expect(fetchDiffSlice).toHaveBeenCalledWith('c-root', 3);

      const expansion = li.querySelector<HTMLElement>(
        '.er-marginalia-diff-expansion',
      );
      expect(expansion).not.toBeNull();
      expect(stamp?.getAttribute('aria-pressed')).toBe('true');

      // Expansion's reason header echoes the disposition reason.
      const expansionReason = expansion?.querySelector(
        '.er-marginalia-diff-reason',
      );
      expect(expansionReason?.textContent).toBe(
        'tightened paragraph two — removed the redundant "obviously"',
      );

      // Diff body renders the two unified-diff lines with kind
      // attribution so CSS can color del / add columns.
      const diffLines = expansion?.querySelectorAll<HTMLElement>(
        '.er-marginalia-diff-line',
      );
      expect(diffLines?.length).toBe(2);
      expect(diffLines?.[0]?.dataset.kind).toBe('del');
      expect(diffLines?.[1]?.dataset.kind).toBe('add');
    },
  );

  it(
    'parsed CommentAnnotation surfaces the attachments field on a markdown ' +
      'entry — schema integration works even though Task 8.3/8.4 has not ' +
      'shipped the render-side',
    () => {
      // Task 8.7's pre-flight audit found that `sidebar-render.ts`
      // does NOT currently surface `attachments` in the rendered DOM.
      // Task 8.3 (capture) + Task 8.4 (rendering) are the future
      // dispatches that close that gap. This test pins the SCHEMA
      // integration: the field reaches the parsed `CommentAnnotation`
      // object and is available for the future renderer to read.
      //
      // The assertion form is shape-only — we DO NOT assert against
      // rendered DOM because no render-side exists. If a future task
      // adds attachment-rendering, the additional DOM assertions
      // land in the per-task test (`packages/studio/test/entry-review/
      // attachment-render.test.ts` or similar); this test continues
      // to guard the schema-integration baseline.
      const withAttachment = comment({
        id: 'c-with-attachment',
        text: 'see the screenshot — the misalignment is on the right edge',
        attachments: [
          'scrapbook/screenshots/comment-c-with-attachment-12345.png',
        ],
      });

      // The TS type allows the field through (declared as
      // `attachments?: string[]` on the client-side
      // CommentAnnotation). The runtime preserves it on round-trip
      // through `groupCommentsIntoThreads` — single-comment input
      // emits a single-root thread whose `root` IS the input object.
      const threads = groupCommentsIntoThreads([withAttachment]);
      expect(threads).toHaveLength(1);
      expect(threads[0].root.id).toBe('c-with-attachment');
      expect(threads[0].root.attachments).toEqual([
        'scrapbook/screenshots/comment-c-with-attachment-12345.png',
      ]);

      // Render the comment — confirm no crash and the DOM contains
      // the comment card (the field is silently carried, not
      // surfaced, until Task 8.3/8.4 adds the render branch).
      const li = buildSidebarThread(threads[0], 'current', makeDeps());
      document.body.appendChild(li);
      expect(li.dataset.annotationId).toBe('c-with-attachment');
    },
  );

  it(
    'parsed CommentAnnotation surfaces the spatialAnchor field on a markdown ' +
      'entry — schema integration works even though Phase 10/11 has not ' +
      'shipped the graphical render-side',
    () => {
      // Phase 10/11 is the graphical-entry review surface; its
      // implementation will surface `spatialAnchor` via on-image
      // pins. As of Phase 8, the field reaches the parsed object
      // but no render path exists — even on a markdown entry, where
      // it could theoretically annotate an embedded image, the
      // renderer ignores it.
      //
      // The assertion form is shape-only: confirm the discriminated-
      // union shape survives through grouping, so a future Phase 10
      // render path can read it without a schema migration.
      const withSpatial = comment({
        id: 'c-spatial',
        text: 'this image alignment is off — see x=240, y=120',
        spatialAnchor: {
          kind: 'pixel',
          x: 240,
          y: 120,
        },
      });

      const threads = groupCommentsIntoThreads([withSpatial]);
      expect(threads).toHaveLength(1);
      expect(threads[0].root.spatialAnchor).toEqual({
        kind: 'pixel',
        x: 240,
        y: 120,
      });

      // Render — confirm no crash; spatialAnchor is silently carried.
      const li = buildSidebarThread(threads[0], 'current', makeDeps());
      document.body.appendChild(li);
      expect(li.dataset.annotationId).toBe('c-spatial');
    },
  );

  it(
    'addressed reply with own reason renders correctly — reply-card-level ' +
      'addressed badges work on markdown entries (cross-cutting threads + ' +
      'addressed-reason + diff-expansion on the SAME reply)',
    async () => {
      // A reply can carry its own addressed disposition independent
      // of the root's. The render path indexes per-comment-id, so a
      // reply card surfaces its own addressed badge with its own
      // reason. The cross-cutting test checks that the per-reply
      // addressed render works on a thread (not just a lone comment).
      const root = comment({
        id: 'c-root',
        text: 'paragraph two needs work',
        createdAt: '2026-05-31T00:00:00.000Z',
      });
      const reply = comment({
        id: 'c-r1',
        replyTo: 'c-root',
        text: 'the sentence at line 14 specifically',
        createdAt: '2026-05-31T00:01:00.000Z',
      });

      // Reply itself is addressed in revision 4 — independent of the
      // root's disposition.
      const replyAddr: AddressAnnotation = {
        id: 'a-c-r1',
        type: 'address',
        workflowId: 'entry-uuid',
        commentId: 'c-r1',
        version: 4,
        disposition: 'addressed',
        reason: 'reworded the sentence at line 14',
        createdAt: '2026-05-31T00:10:00.000Z',
      };

      const addressByCommentId = new Map<string, AddressAnnotation>([
        ['c-r1', replyAddr],
      ]);

      const emptyDiffPayload: DiffSlicePayload = {
        reason: 'reworded the sentence at line 14',
        hunks: [],
      };
      const fetchDiffSlice: DiffSliceFetcher = vi.fn(() =>
        Promise.resolve(emptyDiffPayload),
      );

      const threads = groupCommentsIntoThreads([root, reply]);
      const li = buildSidebarThread(
        threads[0],
        'current',
        makeDeps(addressByCommentId, fetchDiffSlice),
      );
      document.body.appendChild(li);

      // The reply card carries its own addressed badge — index
      // works per-comment-id, not per-thread-root.
      const replyCard = li.querySelector<HTMLElement>(
        '.er-marginalia-item--reply',
      );
      expect(replyCard).not.toBeNull();
      const replyStamp = replyCard?.querySelector<HTMLElement>(
        '.er-marginalia-stamp',
      );
      expect(replyStamp).not.toBeNull();
      expect(replyStamp?.dataset.disposition).toBe('addressed');
      expect(
        replyStamp?.querySelector('.er-marginalia-stamp-reason')?.textContent,
      ).toBe('reworded the sentence at line 14');

      // Click the reply's addressed stamp → empty-hunks payload →
      // the Step 8.6.4 fallback ("addressed without local diff")
      // renders inside the reply card's expansion.
      replyStamp?.click();
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchDiffSlice).toHaveBeenCalledWith('c-r1', 4);
      const fallback = replyCard?.querySelector('.er-marginalia-diff-empty');
      expect(fallback).not.toBeNull();
      expect(fallback?.textContent).toBe(
        'addressed without local diff — see the disposition reason',
      );
    },
  );

  it(
    'legacy addressed annotation (no reason) renders the "no reason recorded" ' +
      'marker on a markdown entry — back-compat read path survives the ' +
      'cross-cutting flow',
    () => {
      // Step 8.5.3 contract: pre-Step-8.1.2 journal data may have
      // addressed annotations without a reason field. The renderer
      // surfaces "no reason recorded" with a
      // `data-legacy-missing-reason="true"` attribute for diagnostic
      // tools to grep. Verify that contract survives when the
      // addressed annotation lives on a threaded markdown entry
      // (not just on a lone comment as the per-step test covers).
      const root = comment({
        id: 'c-root',
        text: 'legacy data — comment from before the reason gate landed',
      });
      const reply = comment({
        id: 'c-r1',
        replyTo: 'c-root',
        text: 'replies should still render',
        createdAt: '2026-05-31T00:01:00.000Z',
      });

      // Legacy addressed annotation — no reason field.
      const legacyAddr: AddressAnnotation = {
        id: 'a-legacy',
        type: 'address',
        workflowId: 'entry-uuid',
        commentId: 'c-root',
        version: 3,
        disposition: 'addressed',
        createdAt: '2026-05-31T00:05:00.000Z',
      };

      const addressByCommentId = new Map<string, AddressAnnotation>([
        ['c-root', legacyAddr],
      ]);

      const threads = groupCommentsIntoThreads([root, reply]);
      const li = buildSidebarThread(
        threads[0],
        'current',
        makeDeps(addressByCommentId),
      );
      document.body.appendChild(li);

      const stamp = li.querySelector<HTMLElement>('.er-marginalia-stamp');
      const reason = stamp?.querySelector<HTMLElement>(
        '.er-marginalia-stamp-reason',
      );
      expect(reason?.textContent).toBe('no reason recorded');
      expect(reason?.dataset.legacyMissingReason).toBe('true');
    },
  );
});
