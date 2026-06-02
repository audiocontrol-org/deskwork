/**
 * @vitest-environment jsdom
 *
 * Cascade-order acceptance tests for the dashboard row's "Member of"
 * popover (Phase 7 Task 7.9 / AUDIT-20260529-36 and Task 7.14 /
 * AUDIT-20260529-41).
 *
 * Why this file exists
 * --------------------
 *
 * The original `dashboard-member-row-badge.test.ts` only asserted
 * `toContain('er-row-member-popover')` against the server-rendered
 * HTML string. That string-contains shape proves the markup ships;
 * it does NOT prove the popover is invisible at rest. The cascade
 * bug AUDIT-20260529-36 names (`.er-row-member-popover { display:
 * block }` declared at the same specificity as the UA `[hidden]
 * { display: none }` rule but later by author origin, so author
 * wins and the popover renders unconditionally) was invisible to
 * the existing test even after it shipped.
 *
 * This file closes that gap by injecting the real shipped CSS into
 * a jsdom document, building the row-shell markup the server emits,
 * and asserting the computed `display` AND `margin-left` of the
 * popover at rest and after the row carries `.is-member-expanded`.
 *
 * Per `.claude/rules/ui-verification.md`: the verification protocol
 * for a visual claim measures the property the operator perceives.
 * String-contains is not the property the operator perceives;
 * computed style is.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve + load the actual shipped CSS file from disk. The file
 * served by the studio at `/static/css/dashboard-row-affordances.css`
 * is the same on-disk file, so loading via fs gives us identical
 * bytes without standing up the server.
 */
function loadAffordanceCss(): string {
  const cssPath = join(
    __dirname,
    '..',
    '..',
    '..',
    'plugins',
    'deskwork-studio',
    'public',
    'css',
    'dashboard-row-affordances.css',
  );
  return readFileSync(cssPath, 'utf8');
}

/**
 * Build the row-shell markup the server emits for a member entry.
 * Mirrors `packages/studio/src/pages/dashboard/section.ts`
 * `renderRow` (member-tab + popover branch). Returns the shell
 * element so the test can flip `.is-member-expanded`.
 *
 * NOTE on the missing `hidden` attribute on the popover element:
 *
 * The server-rendered markup ships `<div class="er-row-member-popover"
 * data-row-member-popover hidden>`. We deliberately OMIT the HTML
 * `hidden` attribute in this fixture because jsdom diverges from
 * real-browser behavior on the `[hidden]` cascade: jsdom applies
 * `hidden` as a presentational-hint style that strongly wins over
 * an author rule of equal specificity, even when the author rule
 * is declared later. Real browsers apply `[hidden]` via the UA
 * stylesheet at specificity (0,1,0) — equal to a class selector
 * — so an author `.er-row-member-popover { display: block }` rule
 * WINS, which is the cascade bug AUDIT-20260529-36 names.
 *
 * Keeping the test independent of `hidden` gives us a deterministic
 * verification of the actual cascade contract: the author CSS must
 * itself gate the popover's display on the row's state-class,
 * without relying on the `hidden` attribute to mask the bug.
 * The runtime markup keeps `hidden` as a defensive belt-and-braces
 * signal (assistive tech / no-CSS fallback); the cascade gate is
 * what matters for the visual surface.
 */
function buildMemberRowShell(): {
  shell: HTMLElement;
  popover: HTMLElement;
  tab: HTMLElement;
} {
  document.body.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'er-row-shell has-member-tab';
  shell.dataset.rowShell = '';
  shell.dataset.uuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const tab = document.createElement('button');
  tab.className = 'er-row-member-tab';
  tab.type = 'button';
  tab.dataset.rowMemberTab = '';
  tab.setAttribute('aria-expanded', 'false');
  const tabLabel = document.createElement('span');
  tabLabel.className = 'er-row-member-tab-label';
  tabLabel.textContent = 'Member';
  const tabCount = document.createElement('span');
  tabCount.className = 'er-row-member-tab-count';
  tabCount.textContent = '1';
  tab.appendChild(tabLabel);
  tab.appendChild(tabCount);

  const fg = document.createElement('div');
  fg.className = 'er-row-fg er-calendar-row';

  const popover = document.createElement('div');
  popover.className = 'er-row-member-popover';
  popover.dataset.rowMemberPopover = '';
  // Intentionally NOT setting popover.hidden = true — see docblock.
  const head = document.createElement('div');
  head.className = 'er-row-member-popover-head';
  head.textContent = 'Member of 1 group';
  popover.appendChild(head);

  shell.appendChild(tab);
  shell.appendChild(fg);
  shell.appendChild(popover);
  document.body.appendChild(shell);

  return { shell, popover, tab };
}

/**
 * Inject the shipped CSS into the jsdom document. The CSS file's
 * mobile rules sit under `@media (max-width: 600px)` — those are
 * NOT relevant to the popover-visibility rules under test (which
 * are unconditional). The member-tab + popover rules live in the
 * unconditional bottom half of the file (after the mobile @media
 * block closes around line 224). jsdom parses the entire file and
 * applies the unconditional rules; the mobile rules don't fire
 * because jsdom's default viewport doesn't satisfy `max-width: 600px`
 * (the matchMedia stub returns false for unknown queries).
 */
function injectCss(): void {
  const style = document.createElement('style');
  style.textContent = loadAffordanceCss();
  document.head.appendChild(style);
}

describe('row member-popover cascade order (AUDIT-20260529-36 + 41)', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('AUDIT-20260529-36: popover.display === "none" at rest', () => {
    // Acceptance criterion derived from the audit-log finding:
    //   "The intended design is collapsed-at-rest, expanded-on-tap."
    // The shipped surface fails this because an unconditional
    // `.er-row-member-popover { display: block }` rule wins the
    // cascade against the UA `[hidden]` rule. The fix gates the
    // popover's display on the row's `.is-member-expanded` class.
    injectCss();
    const { popover } = buildMemberRowShell();
    const computed = window.getComputedStyle(popover);
    expect(computed.display).toBe('none');
  });

  it('AUDIT-20260529-36: popover.display === "block" when the row carries .is-member-expanded', () => {
    // Pair acceptance — once the operator taps the tab and the
    // client controller adds `.is-member-expanded` to the shell,
    // the popover MUST become visible. Without this, the fix
    // would over-correct and break the expanded state.
    injectCss();
    const { shell, popover } = buildMemberRowShell();
    shell.classList.add('is-member-expanded');
    const computed = window.getComputedStyle(popover);
    expect(computed.display).toBe('block');
  });

  it('AUDIT-20260529-41: popover left-margin matches the tab width', () => {
    // Acceptance criterion derived from the audit-log finding:
    // AUDIT-31 widened `.er-row-member-tab` from 22px to 24px
    // (WCAG 2.5.8 target-size minimum) but left
    // `.er-row-member-popover { margin: 0 0 0 22px }` unchanged.
    // The popover starts 2px inside the tab column rather than
    // flush with it. The fix aligns the two by either updating
    // the literal or — preferred — extracting a shared token.
    //
    // The test reads BOTH the popover's computed margin-left AND
    // the tab's computed width via getComputedStyle and asserts
    // equality. A token-based fix (`var(--er-member-tab-width)`)
    // and a literal-aligned fix both satisfy this contract;
    // the contract pins the invariant that matters (alignment),
    // not the mechanism that delivers it.
    //
    // jsdom note: jsdom does NOT resolve CSS custom properties
    // through getComputedStyle — it returns the literal `var(...)`
    // string. We resolve the token's value via
    // getPropertyValue('--er-member-tab-width') on the root, then
    // normalise both sides (literal-pixel-value OR var-reference
    // resolved to its declared value) before comparison. This keeps
    // the test honest regardless of which fix variant the
    // implementer picked.
    injectCss();
    const { popover, tab } = buildMemberRowShell();
    const rootStyle = window.getComputedStyle(document.documentElement);
    const tokenValue = rootStyle.getPropertyValue('--er-member-tab-width').trim();
    // Token MUST be declared and MUST be 24px to satisfy WCAG 2.5.8.
    expect(tokenValue).toBe('24px');

    const resolve = (value: string): string => {
      // jsdom returns the literal `var(--name)` string; resolve by
      // substituting the declared token value. Falls through unchanged
      // when the value is already a literal (e.g. `24px`).
      const m = /var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/.exec(value);
      if (m === null) return value;
      const resolved = rootStyle.getPropertyValue(m[1]).trim();
      return value.replace(m[0], resolved);
    };

    const tabWidth = resolve(window.getComputedStyle(tab).width);
    const popoverMarginLeft = resolve(
      window.getComputedStyle(popover).marginLeft,
    );
    expect(tabWidth).toBe('24px');
    expect(popoverMarginLeft).toBe(tabWidth);
  });
});
