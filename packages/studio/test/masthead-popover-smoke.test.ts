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

  it('marks the popover container with role=menu and links it to the trigger', () => {
    const out = renderMastheadMenu();
    expect(out.__raw).toMatch(/role="menu"/);
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

  it('decorates every menu item with role=menuitem', () => {
    const out = renderMastheadMenu();
    // Five operator-facing items: Manual, Shortcuts, Configure, Issue, About.
    const menuitemMatches = out.__raw.match(/role="menuitem"/g) ?? [];
    expect(menuitemMatches.length).toBe(5);
  });
});
