/**
 * @vitest-environment jsdom
 *
 * Phase 5 Task 5.6 — integration test against a multi-lane fixture
 * (client-side / jsdom env).
 *
 * Companion to `dashboard-swimlane-integration.test.ts` (node env,
 * server contract). The split is forced by the esbuild + jsdom
 * Uint8Array invariant conflict — see the header in
 * `dashboard-swimlane-integration-fixture.ts` for the rationale.
 *
 * This file mounts a synthesised multi-lane DOM (via the structural
 * mirror in `dashboard-swimlane-integration-dom-builder.ts`) and
 * exercises the real client controllers (`initSwimlane`,
 * `initSwimlaneCollapse`, `initSwimlaneViewToggle`,
 * `initSwimlaneCompose`) against it.
 *
 * Coverage in this file (controller integration):
 *   - Step 5.6.2: hidden-lane scenario — pre-seed visibility-hidden
 *     state in localStorage, mount controllers, verify the chip +
 *     swim + rail row all carry the visibility signals.
 *   - Step 5.6.3: per-lane collapse — click `.collapse-chev` on a
 *     swim flips `.collapsed`; per-stage chevron flips
 *     `.stage-col.collapsed`.
 *   - Step 5.6.4: per-lane view-toggle — click `.vt-cell--list` on
 *     one lane flips `.view-list`; clicking `.vt-cell--kanban` on
 *     another keeps it kanban; both modes preserve entries in the
 *     DOM (dual-body server contract).
 *   - Step 5.6.5: compose-chip — click `.swim-compose` writes the
 *     exact `/deskwork:add <SLUG> --lane <id> --stage <first-linear-
 *     stage>` string to the (stubbed) clipboard, chip flashes
 *     `.copied`, reverts after 2000ms via fake timers.
 *   - Step 5.6.6: phone-viewport — with `matchMedia` stubbed to
 *     phone, controllers init without errors, the lane-sheet
 *     trigger is in the DOM.
 *
 * Per `.claude/rules/ui-verification.md`, the phone-viewport
 * assertion below is the jsdom-deterministic half of the dual-
 * viewport verification. The companion full-browser smoke is
 * `scripts/smoke-er-viewport-regressions.mjs`. To exercise the
 * multi-lane fixture against that smoke manually:
 *
 *   1. Boot the studio against a sandbox project mirroring the
 *      same 3-lane configuration as the shared fixture.
 *   2. Run `node scripts/smoke-er-viewport-regressions.mjs
 *      --base http://localhost:<port>`.
 *   3. Confirm exit 0 — no horizontal-overflow / no hidden-
 *      affordance / no fixed-position offenders across desktop
 *      (1920×1080) and phone (390×844) viewports.
 *
 * The full-browser smoke is local-only per `.claude/rules/agent-
 * discipline.md` "No test infrastructure in CI".
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { initSwimlane } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane';
import { initSwimlaneCollapse } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-collapse';
import { initSwimlaneViewToggle } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle';
import { initSwimlaneCompose } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-compose';
import {
  UUID_DEFAULT_DRAFTING,
  UUID_DEFAULT_FINAL,
  UUID_MOCKUPS_SKETCHED,
  UUID_MOCKUPS_APPROVED,
} from './dashboard-swimlane-integration-fixture';
import {
  PROJECT_KEY,
  buildShell,
} from './dashboard-swimlane-integration-dom-builder';

// jsdom lacks `CSS.escape` — identity shim per
// `dashboard-swimlane-client.test.ts:98–107`.
interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

interface MediaQueryListShim {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener(
    type: 'change',
    listener: (ev: MediaQueryListEvent) => void,
  ): void;
  removeEventListener(
    type: 'change',
    listener: (ev: MediaQueryListEvent) => void,
  ): void;
  addListener(listener: (ev: MediaQueryListEvent) => void): void;
  removeListener(listener: (ev: MediaQueryListEvent) => void): void;
  dispatchEvent(ev: Event): boolean;
}

/**
 * Stub `window.matchMedia` so the view-toggle controller's viewport-
 * default branch resolves deterministically. Mirrors the shim in
 * `dashboard-swimlane-view-toggle-client.test.ts:153–199`.
 */
function setMatchMediaMatches(matches: boolean): void {
  const listeners = new Set<(ev: MediaQueryListEvent) => void>();
  function makeMql(): MediaQueryListShim {
    return {
      matches,
      media: '(max-width: 720px)',
      onchange: null,
      addEventListener(_type, listener): void {
        listeners.add(listener);
      },
      removeEventListener(_type, listener): void {
        listeners.delete(listener);
      },
      addListener(listener): void {
        listeners.add(listener);
      },
      removeListener(listener): void {
        listeners.delete(listener);
      },
      dispatchEvent(_ev: Event): boolean {
        return false;
      },
    };
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: makeMql,
  });
}

interface ClipboardShim {
  writeText: (text: string) => Promise<void>;
}

/**
 * Install a clipboard shim that records every `writeText` call.
 * Mirrors `dashboard-swimlane-compose-client.test.ts:115–119`.
 */
function installClipboard(): { calls: string[] } {
  const calls: string[] = [];
  const shim: ClipboardShim = {
    writeText: async (text) => {
      calls.push(text);
    },
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: shim,
  });
  return { calls };
}

function mountAllControllers(): void {
  initSwimlane();
  initSwimlaneCollapse();
  initSwimlaneViewToggle();
  initSwimlaneCompose();
}

describe('Phase 5 Task 5.6 — multi-lane integration (client)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
    setMatchMediaMatches(false);
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  // ============================================================
  //  Step 5.6.2 — Hidden-lane scenario.
  // ============================================================

  it('Step 5.6.2: pre-seed visibility-hidden state, mount controllers, chip + swim + rail row all carry the hidden signals', () => {
    // Pre-seed BEFORE building the shell (controllers read storage on init).
    const visibilityKey = `deskwork:dashboard:${PROJECT_KEY}:visibility`;
    window.localStorage.setItem(visibilityKey, JSON.stringify(['qa']));
    buildShell();
    mountAllControllers();
    const qaSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="qa"]',
    );
    const qaChip = document.querySelector<HTMLButtonElement>(
      '[data-focus-chip="qa"]',
    );
    const qaRow = document.querySelector<HTMLElement>(
      '[data-rail-lane="qa"]',
    );
    expect(qaSwim).not.toBeNull();
    expect(qaChip).not.toBeNull();
    expect(qaRow).not.toBeNull();
    expect(qaSwim?.classList.contains('is-visibility-hidden')).toBe(true);
    expect(qaChip?.classList.contains('is-visibility-hidden')).toBe(true);
    expect(qaRow?.dataset.laneVisible).toBe('false');
    // Per AUDIT-20260528-38 — the stub also receives the
    // is-visibility-hidden class from the swimlane controller (line
    // 151 of swimlane.ts). Without this assertion the contract is
    // half-covered: a regression that left stubs visible while
    // hiding the full swim would not surface here.
    const qaStub = document.querySelector<HTMLElement>(
      '[data-swim-stub="qa"]',
    );
    expect(qaStub?.classList.contains('is-visibility-hidden')).toBe(true);
    // Other lanes stay visible.
    const defaultSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    expect(defaultSwim?.classList.contains('is-visibility-hidden')).toBe(false);
  });

  // ============================================================
  //  Step 5.6.3 — Per-lane collapse interaction.
  // ============================================================

  it('Step 5.6.3: clicking the .collapse-chev on a swim toggles .collapsed on the swim', () => {
    buildShell();
    mountAllControllers();
    const swim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    const laneChev = swim?.querySelector<HTMLButtonElement>(
      '.swim-head > .collapse-chev[data-collapse-target="lane"]',
    ) ?? null;
    expect(swim).not.toBeNull();
    expect(laneChev).not.toBeNull();
    expect(swim?.classList.contains('collapsed')).toBe(false);
    laneChev?.click();
    expect(swim?.classList.contains('collapsed')).toBe(true);
    expect(laneChev?.getAttribute('aria-expanded')).toBe('false');
  });

  it('Step 5.6.3: clicking the per-stage chevron toggles .collapsed on the stage-col', () => {
    buildShell();
    mountAllControllers();
    const col = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"] .stage-col[data-stage-col="Drafting"]',
    );
    const stageChev = col?.querySelector<HTMLButtonElement>(
      '.stage-head > .collapse-chev[data-collapse-target="stage"]',
    ) ?? null;
    expect(col).not.toBeNull();
    expect(stageChev).not.toBeNull();
    expect(col?.classList.contains('collapsed')).toBe(false);
    stageChev?.click();
    expect(col?.classList.contains('collapsed')).toBe(true);
    expect(stageChev?.getAttribute('aria-expanded')).toBe('false');
  });

  it('Step 5.6.3: lane collapse + per-stage collapse are independent (collapsing the lane does NOT collapse its stage-cols)', () => {
    buildShell();
    mountAllControllers();
    const swim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="mockups"]',
    );
    const laneChev = swim?.querySelector<HTMLButtonElement>(
      '.swim-head > .collapse-chev[data-collapse-target="lane"]',
    );
    laneChev?.click();
    expect(swim?.classList.contains('collapsed')).toBe(true);
    const cols = swim?.querySelectorAll<HTMLElement>('.stage-col') ?? [];
    expect(cols.length).toBeGreaterThan(0);
    for (const col of cols) {
      expect(col.classList.contains('collapsed')).toBe(false);
    }
  });

  // ============================================================
  //  Step 5.6.4 — Per-lane view-toggle interaction.
  // ============================================================

  it('Step 5.6.4: clicking .vt-cell--list flips that lane to .view-list (and aria-checked mirrors)', () => {
    buildShell();
    mountAllControllers();
    const swim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    expect(swim?.classList.contains('view-kanban')).toBe(true);
    expect(swim?.classList.contains('view-list')).toBe(false);
    const listCell = swim?.querySelector<HTMLButtonElement>(
      '.view-toggle .vt-cell--list',
    );
    const kanbanCell = swim?.querySelector<HTMLButtonElement>(
      '.view-toggle .vt-cell--kanban',
    );
    listCell?.click();
    expect(swim?.classList.contains('view-list')).toBe(true);
    expect(swim?.classList.contains('view-kanban')).toBe(false);
    expect(listCell?.getAttribute('aria-checked')).toBe('true');
    expect(kanbanCell?.getAttribute('aria-checked')).toBe('false');
  });

  it('Step 5.6.4: per-lane scope — flipping the default lane to list does NOT affect the mockups lane', () => {
    buildShell();
    mountAllControllers();
    const defaultSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    const mockupsSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="mockups"]',
    );
    const defaultListCell = defaultSwim?.querySelector<HTMLButtonElement>(
      '.view-toggle .vt-cell--list',
    );
    defaultListCell?.click();
    expect(defaultSwim?.classList.contains('view-list')).toBe(true);
    expect(mockupsSwim?.classList.contains('view-kanban')).toBe(true);
    expect(mockupsSwim?.classList.contains('view-list')).toBe(false);
  });

  it('Step 5.6.4: clicking .vt-cell--kanban on a second lane keeps it in kanban', () => {
    buildShell();
    mountAllControllers();
    const mockupsSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="mockups"]',
    );
    const kanbanCell = mockupsSwim?.querySelector<HTMLButtonElement>(
      '.view-toggle .vt-cell--kanban',
    );
    kanbanCell?.click();
    expect(mockupsSwim?.classList.contains('view-kanban')).toBe(true);
    expect(mockupsSwim?.classList.contains('view-list')).toBe(false);
  });

  it('Step 5.6.4: both modes preserve entries in the DOM (dual-body contract)', () => {
    buildShell();
    mountAllControllers();
    const defaultSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="default"]',
    );
    const mockupsSwim = document.querySelector<HTMLElement>(
      '.swim[data-lane-id="mockups"]',
    );
    // Flip default to list, leave mockups in kanban.
    defaultSwim
      ?.querySelector<HTMLButtonElement>('.view-toggle .vt-cell--list')
      ?.click();
    expect(
      defaultSwim?.querySelector(`[data-uuid="${UUID_DEFAULT_DRAFTING}"]`),
    ).not.toBeNull();
    expect(
      defaultSwim?.querySelector(`[data-uuid="${UUID_DEFAULT_FINAL}"]`),
    ).not.toBeNull();
    expect(
      mockupsSwim?.querySelector(`[data-uuid="${UUID_MOCKUPS_SKETCHED}"]`),
    ).not.toBeNull();
    expect(
      mockupsSwim?.querySelector(`[data-uuid="${UUID_MOCKUPS_APPROVED}"]`),
    ).not.toBeNull();
  });

  // ============================================================
  //  Step 5.6.5 — Compose-chip interaction.
  // ============================================================

  it('Step 5.6.5: clicking .swim-compose on the mockups lane writes the exact partial /deskwork:add command, chip flashes .copied, reverts after 2000ms', async () => {
    const { calls } = installClipboard();
    vi.useFakeTimers();
    try {
      buildShell();
      mountAllControllers();
      const chip = document.querySelector<HTMLButtonElement>(
        '.swim[data-lane-id="mockups"] .swim-compose',
      );
      expect(chip).not.toBeNull();
      chip?.click();
      await vi.advanceTimersByTimeAsync(0);
      // Mockups lane's first linear stage is Sketched (visual.json).
      expect(calls).toEqual([
        '/deskwork:add <SLUG> --lane mockups --stage Sketched',
      ]);
      expect(chip?.classList.contains('copied')).toBe(true);
      // After 2000ms, the chip reverts.
      await vi.advanceTimersByTimeAsync(2000);
      expect(chip?.classList.contains('copied')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('Step 5.6.5: each lane composes the lane-correct slash command (default → Ideas, qa → Drafted)', async () => {
    const { calls } = installClipboard();
    vi.useFakeTimers();
    try {
      buildShell();
      mountAllControllers();
      const defaultChip = document.querySelector<HTMLButtonElement>(
        '.swim[data-lane-id="default"] .swim-compose',
      );
      defaultChip?.click();
      await vi.advanceTimersByTimeAsync(0);
      // Advance past the flash so the second click's flash isn't a no-op
      // from the rapid-double-click reset (controller resets the timer).
      await vi.advanceTimersByTimeAsync(2000);
      const qaChip = document.querySelector<HTMLButtonElement>(
        '.swim[data-lane-id="qa"] .swim-compose',
      );
      qaChip?.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(calls).toEqual([
        '/deskwork:add <SLUG> --lane default --stage Ideas',
        '/deskwork:add <SLUG> --lane qa --stage Drafted',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  // ============================================================
  //  Step 5.6.6 — Phone-viewport (jsdom DOM presence half).
  // ============================================================

  it('Step 5.6.6: with matchMedia stubbed to phone, controllers init without errors and the .lane-sheet-trigger is in the DOM', () => {
    setMatchMediaMatches(true);
    buildShell();
    mountAllControllers();
    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-lane-sheet-trigger]',
    );
    expect(trigger).not.toBeNull();
    expect(trigger?.classList.contains('lane-sheet-trigger')).toBe(true);
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger?.getAttribute('aria-controls')).toBe('lane-sheet');
    const sheet = document.querySelector<HTMLElement>('[data-lane-sheet]');
    expect(sheet).not.toBeNull();
    const rail = sheet?.querySelector<HTMLElement>('.lane-rail');
    expect(rail).not.toBeNull();
    // All 3 rail rows are present even on phone (the sheet is the
    // mobile container; the rail's row contract is the same).
    const rows = sheet?.querySelectorAll<HTMLElement>('[data-rail-lane]') ?? [];
    expect(rows.length).toBe(3);
  });
});
