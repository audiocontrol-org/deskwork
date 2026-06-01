/**
 * AUDIT-20260601-09 — exhaustiveness regression for the
 * `cloneSpatialAnchor` switch in `packages/core/src/entry/annotations.ts`.
 *
 * The switch narrows over `SpatialAnchor`'s `kind` discriminator. With
 * no `default` arm and no `assertNever` fallback, adding a 4th variant
 * to the union without updating the switch would silently return
 * undefined at runtime and emit a TypeScript "Not all code paths
 * return a value" error — but only if the union has been touched, not
 * as a structural assertion on the switch itself.
 *
 * After AUDIT-20260601-09, the switch carries `default: return
 * assertNever(input, ...)`. `assertNever`'s parameter is typed `never`,
 * which forces the compiler to refuse the call site if any variant of
 * `SpatialAnchor` is unhandled by the cases above. The contract this
 * test pins is:
 *
 *   1. Every existing variant (`pixel` | `dom-selector` | `svg-element`)
 *      round-trips through the public entry-annotations API (which
 *      drives `cloneSpatialAnchor` via `toDraftAnnotation` and
 *      `applyEdits`).
 *   2. The clone produces fresh objects — defensive copy holds.
 *   3. Type-level: a synthetic dispatch function whose `default` arm
 *      hands the narrowed `never` to `assertNever` compiles cleanly,
 *      meaning the union is fully enumerated.
 *
 * The runtime-fallback throw cannot be exercised from public code
 * paths because `JournalEventSchema.safeParse` rejects bad kinds at
 * the read boundary (`readJournalEvents` silently `continue`s past
 * them — AUDIT-20260601-08 is the safety net for the silent skip).
 * The compile-time guarantee is the load-bearing claim; the round-
 * trip tests below are the runtime smoke that the switch itself still
 * fires on every variant.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  addEntryAnnotation,
  listEntryAnnotationsRaw,
  mintEntryAnnotation,
} from '@/entry/annotations';
import type { CommentAnnotation, SpatialAnchor } from '@/review/types';

describe('AUDIT-20260601-09: cloneSpatialAnchor exhaustiveness', () => {
  it('clones a pixel anchor through the public read path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dw-clone-anchor-pixel-'));
    try {
      const draft: Omit<CommentAnnotation, 'id' | 'createdAt'> = {
        type: 'comment',
        workflowId: 'wf_1',
        version: 1,
        range: { start: 0, end: 4 },
        text: 'pixel comment',
        spatialAnchor: { kind: 'pixel', x: 42, y: 84 },
      };
      const minted = mintEntryAnnotation(draft);
      await addEntryAnnotation(root, '11111111-1111-4111-8111-111111111111', minted);
      const raw = await listEntryAnnotationsRaw(root, '11111111-1111-4111-8111-111111111111');
      expect(raw).toHaveLength(1);
      const a = raw[0];
      expect(a.type).toBe('comment');
      if (a.type !== 'comment') return;
      expect(a.spatialAnchor).toEqual({ kind: 'pixel', x: 42, y: 84 });
      // Defensive copy — clone produces a new object reference.
      expect(a.spatialAnchor).not.toBe(draft.spatialAnchor);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('clones a dom-selector anchor through the public read path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dw-clone-anchor-dom-'));
    try {
      const draft: Omit<CommentAnnotation, 'id' | 'createdAt'> = {
        type: 'comment',
        workflowId: 'wf_1',
        version: 1,
        range: { start: 0, end: 4 },
        text: 'dom comment',
        spatialAnchor: { kind: 'dom-selector', selector: '#header > h1' },
      };
      const minted = mintEntryAnnotation(draft);
      await addEntryAnnotation(root, '22222222-2222-4222-8222-222222222222', minted);
      const raw = await listEntryAnnotationsRaw(root, '22222222-2222-4222-8222-222222222222');
      expect(raw).toHaveLength(1);
      const a = raw[0];
      if (a.type !== 'comment') return;
      expect(a.spatialAnchor).toEqual({
        kind: 'dom-selector',
        selector: '#header > h1',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('clones an svg-element anchor through the public read path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dw-clone-anchor-svg-'));
    try {
      const draft: Omit<CommentAnnotation, 'id' | 'createdAt'> = {
        type: 'comment',
        workflowId: 'wf_1',
        version: 1,
        range: { start: 0, end: 4 },
        text: 'svg comment',
        spatialAnchor: {
          kind: 'svg-element',
          selector: 'g.layer > rect#logo',
        },
      };
      const minted = mintEntryAnnotation(draft);
      await addEntryAnnotation(root, '33333333-3333-4333-8333-333333333333', minted);
      const raw = await listEntryAnnotationsRaw(root, '33333333-3333-4333-8333-333333333333');
      expect(raw).toHaveLength(1);
      const a = raw[0];
      if (a.type !== 'comment') return;
      expect(a.spatialAnchor).toEqual({
        kind: 'svg-element',
        selector: 'g.layer > rect#logo',
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('SpatialAnchor union is structurally exhausted by three kinds', () => {
    // This test is the compile-time exhaustiveness lock. The local
    // `dispatch` function narrows `SpatialAnchor` over `kind`. If a
    // new variant lands on the union but no matching `case` is added
    // here, the `default` branch's call to a `never`-typed assertion
    // becomes a compile error at the call site — exactly the same
    // mechanism that protects `cloneSpatialAnchor` in
    // `src/entry/annotations.ts`.
    function assertNever(_input: never): never {
      throw new Error('Unhandled SpatialAnchor variant');
    }
    function dispatch(anchor: SpatialAnchor): string {
      switch (anchor.kind) {
        case 'pixel':
          return `pixel ${anchor.x},${anchor.y}`;
        case 'dom-selector':
          return `dom ${anchor.selector}`;
        case 'svg-element':
          return `svg ${anchor.selector}`;
        default:
          return assertNever(anchor);
      }
    }
    expect(dispatch({ kind: 'pixel', x: 1, y: 2 })).toBe('pixel 1,2');
    expect(dispatch({ kind: 'dom-selector', selector: '#x' })).toBe('dom #x');
    expect(dispatch({ kind: 'svg-element', selector: 'g.y' })).toBe('svg g.y');
  });
});
