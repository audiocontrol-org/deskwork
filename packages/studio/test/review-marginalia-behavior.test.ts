/**
 * Issue #154 Dispatch B regression — marginalia behavior.
 *
 * Dispatch A composed the page-grid layout. Dispatch B layers behavior
 * on top: handwritten rotation per note (alternating odd/even),
 * straighten-on-hover/active, prefers-reduced-motion bypass, and a
 * mark->note cross-highlight wired in editorial-review-client.ts via
 * pointerover/pointerout delegation on draftBody.
 *
 * These tests pin the rule existence + wiring so regressions get
 * caught at the unit-test boundary instead of at Playwright walk
 * time. A real DOM walk against the rendered surface still catches
 * cascade-order or computed-style regressions; that's the Playwright
 * verification step in the dispatch report.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/css/editorial-review.css',
);
const CLIENT_PATH = resolve(
  __dirname,
  '../../../plugins/deskwork-studio/public/src/editorial-review-client.ts',
);

describe('longform marginalia behavior (Issue #154 Dispatch B)', () => {
  it('defines a handwritten rotation per saved note', () => {
    // Each .er-marginalia-item rotates a hair off-axis so the column
    // reads as physically pinned slips rather than a flat list.
    // Alternating odd/even produces the irregular hand-pinned look.
    const css = readFileSync(CSS_PATH, 'utf8');
    expect(css).toMatch(/\.er-marginalia-item:nth-child\(odd\)/);
    expect(css).toMatch(/transform:\s*rotate\(-0\.35deg\)/);
    expect(css).toMatch(/\.er-marginalia-item:nth-child\(even\)/);
    expect(css).toMatch(/transform:\s*rotate\(0\.4deg\)/);
  });

  it('respects prefers-reduced-motion for the rotation transform', () => {
    // Reduced-motion users get the neutral state with no rotation and
    // no transition. The reduced-motion block must reference
    // .er-marginalia-item — and live in close proximity to a
    // reduced-motion media query — so the cascade actually undoes
    // the rotation. A simple substring slice + sub-search proves both.
    const css = readFileSync(CSS_PATH, 'utf8');
    const reducedIdx = css.indexOf('prefers-reduced-motion: reduce');
    expect(reducedIdx, 'reduced-motion media query should exist').toBeGreaterThan(0);
    // Pull a window around the reduced-motion query and verify
    // .er-marginalia-item appears inside it.
    const windowStr = css.slice(reducedIdx, reducedIdx + 600);
    expect(windowStr).toMatch(/\.er-marginalia-item/);
    expect(windowStr).toMatch(/transform:\s*none/);
  });

  it('wires mark->note cross-highlight via pointerover/pointerout delegation', () => {
    // The note->mark direction was already wired (sidebar
    // mouseenter/mouseleave handlers); Dispatch B adds the reverse via
    // delegated handlers on draftBody so newly-rendered marks (each
    // iteration re-renders the article body) automatically pick up
    // the behavior without rebinding.
    const ts = readFileSync(CLIENT_PATH, 'utf8');
    expect(ts).toMatch(/draftBody\.addEventListener\(\s*['"]pointerover['"]/);
    expect(ts).toMatch(/draftBody\.addEventListener\(\s*['"]pointerout['"]/);
    expect(ts).toMatch(/mark\[data-annotation-id\]/);
  });
});
