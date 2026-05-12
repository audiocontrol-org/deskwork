/**
 * Smoke tests for Step 2.2.7 — masthead `⋮` popover menu HTML scaffold.
 *
 * Spec-derived (per .claude/rules/ui-verification.md): every assertion
 * here corresponds to a literal clause in DESIGN-STANDARDS.md §
 * Studio navigation model OR the v7 mockup contract
 * (`plugins/deskwork-studio/public/mockups/cross-bar-2-refined-v7-masthead-fixes.html`).
 *
 * The tests cover the HTML the SERVER emits — interactive behavior
 * (open / close / focus management) is verified end-to-end via
 * Playwright in the verification step.
 */

import { describe, it, expect } from 'vitest';
import { renderMastheadMenu } from '../src/pages/masthead-menu.ts';

describe('renderMastheadMenu — popover scaffold', () => {
  it('emits the scrim and popover containers, both hidden by default', () => {
    const out = renderMastheadMenu();
    expect(out.__raw).toMatch(
      /<div\s+class="er-masthead-popover-scrim"[^>]*data-er-masthead-popover-scrim[^>]*hidden/,
    );
    expect(out.__raw).toMatch(
      /<div\s+class="er-masthead-popover"[^>]*data-er-masthead-popover[^>]*hidden/,
    );
  });

  it('labels the popover as a dialog linked to the trigger', () => {
    // ARIA `role="menu"` was downgraded to `role="dialog"` per the
    // 7e03d57 review: a menu role implies arrow-key navigation that
    // this surface doesn't provide. dialog is honest about the
    // settings-panel pattern actually shipped.
    const out = renderMastheadMenu();
    expect(out.__raw).toMatch(/role="dialog"/);
    expect(out.__raw).toMatch(/aria-labelledby="masthead-menu-trigger"/);
  });

  it('renders three sections in the spec order — Operator help · Configure · Connect', () => {
    const out = renderMastheadMenu();
    const labels = [...out.__raw.matchAll(
      /<div class="er-masthead-popover-section-label">([^<]+)<\/div>/g,
    )].map((m) => m[1]);
    expect(labels).toEqual(['Operator help', 'Configure', 'Connect']);
  });

  it('renders the Manual link to /dev/editorial-help', () => {
    const out = renderMastheadMenu();
    expect(out.__raw).toMatch(
      /<a[^>]*class="er-masthead-popover-item"[^>]*href="\/dev\/editorial-help"/,
    );
    expect(out.__raw).toContain('Manual');
  });

  it('renders the Keyboard shortcuts item as an action button (not an anchor)', () => {
    const out = renderMastheadMenu();
    expect(out.__raw).toMatch(
      /<button[^>]*data-er-masthead-popover-action="shortcuts"/,
    );
    expect(out.__raw).toContain('Keyboard shortcuts');
  });

  it('renders the Configure studio item as a disabled placeholder (phase 4 tag)', () => {
    const out = renderMastheadMenu();
    expect(out.__raw).toMatch(
      /<button[^>]*er-masthead-popover-item--future[^>]*data-disabled="true"[^>]*aria-disabled="true"/,
    );
    expect(out.__raw).toContain('Configure studio');
    expect(out.__raw).toContain('phase 4');
  });

  it('renders File an issue as an external anchor (new tab, rel noopener noreferrer)', () => {
    const out = renderMastheadMenu();
    expect(out.__raw).toMatch(
      /<a[^>]*href="https:\/\/github\.com\/audiocontrol-org\/deskwork\/issues\/new"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
    );
    expect(out.__raw).toContain('File an issue');
    // External-arrow modifier class signals new-tab to operators.
    expect(out.__raw).toContain('er-masthead-popover-item-arrow--external');
  });

  it('renders About deskwork as an anchor to the manual', () => {
    const out = renderMastheadMenu();
    expect(out.__raw).toContain('About deskwork');
  });

  it('uses the spec-mandated glyph color modifiers (blue · kraft) on the right items', () => {
    const out = renderMastheadMenu();
    // Shortcuts uses blue (proof-blue) per the v7 mockup.
    expect(out.__raw).toMatch(
      /er-masthead-popover-item-glyph--blue[^"]*"[^>]*>⌘/,
    );
    // Configure uses kraft.
    expect(out.__raw).toMatch(
      /er-masthead-popover-item-glyph--kraft[^"]*"[^>]*>⊞/,
    );
  });

  it('renders exactly 5 popover items in the operator-facing menu', () => {
    // role="menuitem" was dropped from each item along with the
    // popover's role="menu" (see "labels the popover as a dialog" test
    // above for the rationale). Items remain native <a>/<button>; tab
    // order handles navigation. Count is now by class membership.
    const out = renderMastheadMenu();
    const matches = out.__raw.match(/class="er-masthead-popover-item[ "]/g) ?? [];
    expect(matches.length).toBe(5);
  });

  it('marks the Configure (Phase 4) item with tabindex=-1 so keyboard tab order skips it', () => {
    // aria-disabled signals AT-disabled state but does NOT remove the
    // element from sequential tab focus. tabindex="-1" keeps the item
    // AT-discoverable while preventing keyboard tab-traversal from
    // landing on a non-interactive placeholder.
    const out = renderMastheadMenu();
    expect(out.__raw).toMatch(/data-er-masthead-popover-action="configure"[\s\S]*?tabindex="-1"/);
  });
});
