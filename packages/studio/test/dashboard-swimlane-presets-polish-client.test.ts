/**
 * @vitest-environment jsdom
 *
 * Polish followups for the Phase 5 Task 5.5 saveable focus presets
 * feature, sourced from AUDIT-20260528-37:
 *
 *   - F2: copy-deep-link affordance on each preset row (click writes
 *     `${origin}/dev/editorial-studio?preset=<id>` to the clipboard
 *     and flashes `.copied`).
 *   - F4: URL precedence — when both `?preset=<id>` and `?focus=<csv>`
 *     are present, the preset wins; the operator's focus state ends
 *     up matching the preset's `focusedLanes`, NOT the `?focus=` CSV.
 *   - F6: stage-collapse round-trip with mixed collapsed / uncollapsed
 *     stages. Verifies the array-shape change (`Record<laneId,
 *     readonly string[]>`) doesn't silently drop `false` flags.
 *
 * The original Task-5.5 tests live in
 * `dashboard-swimlane-presets-client.test.ts`. Splitting these
 * followup tests into a separate file keeps both under the project's
 * 300-500 line cap.
 *
 * Mirrors the CSS.escape + matchMedia shims from the sibling test
 * file (the controllers depend on both under jsdom).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initSwimlane } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane';
import { initSwimlaneCollapse } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-collapse';
import { initSwimlaneViewToggle } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-view-toggle';
import {
  initSwimlanePresets,
  type PresetControllerHooks,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets';
import {
  applyPreset,
  readPresets,
  savePresetFromCurrent,
  snapshotCurrentState,
  type FocusPreset,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-presets-store';

const PROJECT_KEY = 'test-project-key';
const PREFIX = `deskwork:dashboard:${PROJECT_KEY}`;

interface CSSShim {
  escape: (id: string) => string;
}
if (typeof (globalThis as { CSS?: unknown }).CSS === 'undefined') {
  (globalThis as { CSS: CSSShim }).CSS = { escape: (s: string) => s };
}

/**
 * Stub `window.matchMedia` to return a deterministic `matches`
 * value. Mirrors the shim in the sibling preset test + the view-
 * toggle test — install via `Object.defineProperty` because jsdom
 * seals `window.matchMedia` against direct assignment.
 */
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

/**
 * Stub `navigator.clipboard.writeText` so the link-copy handler has
 * a target it can write to. Captures the written URLs in a shared
 * array so the test can assert on what was copied. jsdom does not
 * ship `navigator.clipboard`, so we install the shim via
 * `Object.defineProperty` mirroring the matchMedia pattern.
 */
interface ClipboardShim {
  writeText(text: string): Promise<void>;
  readText(): Promise<string>;
}

function installClipboardCapture(): { copied: string[] } {
  const copied: string[] = [];
  const clipboard: ClipboardShim = {
    writeText(text): Promise<void> {
      copied.push(text);
      return Promise.resolve();
    },
    readText(): Promise<string> {
      return Promise.resolve(copied[copied.length - 1] ?? '');
    },
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: clipboard,
  });
  return { copied };
}

/**
 * Build the minimal bay-shell + rail + swim DOM required to exercise
 * the preset controllers. Smaller than the full integration shell —
 * we only need the rail surface (preset row + buttons) plus enough
 * swim chrome that the view-toggle + collapse controllers can apply
 * state without throwing.
 */
function buildShell(lanes: readonly string[]): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = PROJECT_KEY;
  document.body.appendChild(shell);

  const rail = document.createElement('aside');
  rail.classList.add('lane-rail');
  rail.dataset.laneRail = '';

  const head = document.createElement('div');
  head.classList.add('rail-head');
  head.textContent = 'Lanes';
  const presetSurface = document.createElement('div');
  presetSurface.classList.add('rail-presets');
  presetSurface.dataset.railPresets = '';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.classList.add('preset-save');
  saveBtn.dataset.presetSave = '';
  saveBtn.textContent = '+ Save as preset';
  presetSurface.appendChild(saveBtn);
  const list = document.createElement('div');
  list.classList.add('preset-list');
  list.dataset.presetList = '';
  presetSurface.appendChild(list);
  head.appendChild(presetSurface);
  rail.appendChild(head);

  for (const id of lanes) {
    const row = document.createElement('div');
    row.classList.add('rail-lane', 'focused');
    row.dataset.railLane = id;
    row.dataset.laneVisible = 'true';
    row.setAttribute('aria-pressed', 'true');
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.classList.add('r-eye-btn');
    eye.setAttribute('aria-label', `Toggle visibility for ${id} lane`);
    row.appendChild(eye);
    rail.appendChild(row);
  }
  shell.appendChild(rail);

  const strip = document.createElement('nav');
  strip.classList.add('focus-strip');
  strip.dataset.focusStrip = '';
  for (const id of lanes) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.classList.add('focus-chip', 'active');
    chip.dataset.focusChip = id;
    chip.setAttribute('aria-pressed', 'true');
    strip.appendChild(chip);
  }
  shell.appendChild(strip);

  for (const id of lanes) {
    const swim = document.createElement('article');
    swim.classList.add('swim', 'view-kanban');
    swim.dataset.laneId = id;
    const swimHead = document.createElement('div');
    swimHead.classList.add('swim-head');
    swim.appendChild(swimHead);
    const stageGrid = document.createElement('div');
    stageGrid.classList.add('stage-grid');
    for (const stageName of ['Drafting', 'Final']) {
      const stageCol = document.createElement('div');
      stageCol.classList.add('stage-col');
      stageCol.dataset.stageCol = stageName;
      const stageHead = document.createElement('div');
      stageHead.classList.add('stage-head');
      const stageChev = document.createElement('button');
      stageChev.type = 'button';
      stageChev.classList.add('collapse-chev');
      stageChev.dataset.collapseTarget = 'stage';
      stageChev.dataset.laneId = id;
      stageChev.dataset.stageName = stageName;
      stageHead.appendChild(stageChev);
      stageCol.appendChild(stageHead);
      stageGrid.appendChild(stageCol);
    }
    swim.appendChild(stageGrid);
    shell.appendChild(swim);

    const stub = document.createElement('button');
    stub.type = 'button';
    stub.classList.add('swim-stub', 'is-focus-hidden');
    stub.dataset.swimStub = id;
    shell.appendChild(stub);
  }
}

function bootControllers(): void {
  initSwimlane();
  initSwimlaneCollapse();
  initSwimlaneViewToggle();
}

function makeHooks(name: string, confirm: boolean = true): PresetControllerHooks {
  return {
    promptForName: () => Promise.resolve(name),
    confirmDelete: () => Promise.resolve(confirm),
  };
}

describe('AUDIT-20260528-37 — preset polish followups', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.localStorage.clear();
    window.history.replaceState({}, '', '/dev/editorial-studio');
    setMatchMediaMatches(false);
  });

  describe('F2 — copy-deep-link affordance', () => {
    it('renders a link button on each preset row', () => {
      buildShell(['default']);
      bootControllers();
      installClipboardCapture();

      const hooks = makeHooks('MyPreset');
      initSwimlanePresets(hooks);

      // Save a preset so the row renders.
      const saveBtn = document.querySelector<HTMLButtonElement>(
        '[data-preset-save]',
      );
      saveBtn?.click();
      return Promise.resolve().then(() => Promise.resolve().then(() => {
        const linkBtn = document.querySelector<HTMLButtonElement>(
          '[data-preset-link]',
        );
        expect(linkBtn).not.toBeNull();
        // Per WCAG 2.2 SC 2.5.8 the hit target is >=24x24. CSS sets
        // min-width / min-height; here we only assert the button is
        // present with an accessible label.
        expect(linkBtn?.getAttribute('aria-label')).toContain('Copy deep-link URL');
      }));
    });

    it('clicking the link button writes the expected URL to clipboard + flashes copied', async () => {
      buildShell(['default']);
      bootControllers();
      const { copied } = installClipboardCapture();

      const hooks = makeHooks('MyPreset');
      initSwimlanePresets(hooks);

      // Save a preset to materialise the row.
      const saveBtn = document.querySelector<HTMLButtonElement>(
        '[data-preset-save]',
      );
      saveBtn?.click();
      await Promise.resolve();
      await Promise.resolve();

      const linkBtn = document.querySelector<HTMLButtonElement>(
        '[data-preset-link]',
      );
      expect(linkBtn).not.toBeNull();
      const presetId = linkBtn?.dataset.presetLink;
      expect(presetId).toBeDefined();

      linkBtn?.click();
      // Let the async handler resolve through writeText + flash.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Origin under jsdom is `http://localhost:3000` by default;
      // assert the URL ends with the expected suffix rather than
      // hard-coding the origin (matches the controller's composer).
      expect(copied.length).toBe(1);
      expect(copied[0]).toBe(
        `${window.location.origin}/dev/editorial-studio?preset=${encodeURIComponent(presetId ?? '')}`,
      );
      // The flash state was applied during the await chain; the
      // setTimeout (2000ms) hasn't fired yet under the test's fake
      // clock, so the class is still present.
      expect(linkBtn?.classList.contains('copied')).toBe(true);
      expect(linkBtn?.textContent).toBe('✓');
    });
  });

  describe('F4 — URL precedence: `?preset=` overrides `?focus=`', () => {
    it('when both params present, applied focus state matches preset, not focus CSV', () => {
      buildShell(['default', 'mockups', 'qa']);
      bootControllers();

      // Seed a preset whose focusedLanes is [`qa`] only.
      const preset: FocusPreset = {
        id: 'precedence',
        name: 'Precedence',
        createdAt: '2026-05-28T12:00:00.000Z',
        visibleLanes: ['default', 'mockups', 'qa'],
        focusedLanes: ['qa'],
        viewModePerLane: {},
        laneCollapseState: {},
        stageCollapseState: {},
      };
      window.localStorage.setItem(
        `${PREFIX}:focus-presets`,
        JSON.stringify({ precedence: preset }),
      );

      // URL carries BOTH `?preset=` (matches the seeded preset) AND
      // `?focus=` (claims `default,mockups` should be focused). Per
      // AUDIT-20260528-37 (F4), the preset wins.
      window.history.replaceState(
        {},
        '',
        '/dev/editorial-studio?preset=precedence&focus=default,mockups',
      );

      initSwimlanePresets(makeHooks(''));

      // Focus storage key reflects the preset, not the focus CSV.
      expect(window.localStorage.getItem(`${PREFIX}:focus`)).toBe(
        JSON.stringify(['qa']),
      );

      // DOM mirrors: only `qa` swim is unhidden, default + mockups
      // are focus-hidden.
      const qaSwim = document.querySelector<HTMLElement>(
        '.swim[data-lane-id="qa"]',
      );
      const defaultSwim = document.querySelector<HTMLElement>(
        '.swim[data-lane-id="default"]',
      );
      const mockupsSwim = document.querySelector<HTMLElement>(
        '.swim[data-lane-id="mockups"]',
      );
      expect(qaSwim?.classList.contains('is-focus-hidden')).toBe(false);
      expect(defaultSwim?.classList.contains('is-focus-hidden')).toBe(true);
      expect(mockupsSwim?.classList.contains('is-focus-hidden')).toBe(true);
    });
  });

  describe('F6 — stage-collapse round-trip with mixed collapsed/uncollapsed', () => {
    it('snapshot/apply preserves collapsed stages and does NOT collapse uncollapsed stages', () => {
      buildShell(['default']);
      bootControllers();

      // Seed stage-collapse storage so that `Drafting` is collapsed
      // and `Final` is NOT collapsed. Under the old boolean-map
      // shape, an inner `{ Drafting: true, Final: false }` would
      // serialise out the `false` flag and a round-trip could drop
      // it; the new array shape carries only `['Drafting']`.
      window.localStorage.setItem(
        `${PREFIX}:stage-collapse`,
        JSON.stringify({ default: ['Drafting'] }),
      );
      // Reapply so the DOM picks up the seeded state.
      initSwimlaneCollapse();

      const snapshot = snapshotCurrentState(PROJECT_KEY);
      // The snapshot reports only the collapsed names — `Final` is
      // absent. Under the old boolean-map shape `Final: false` could
      // have been emitted and a stale round-trip might re-collapse
      // it later.
      expect(snapshot.stageCollapseState).toEqual({ default: ['Drafting'] });

      // Now save + restore through the full preset path and verify
      // the DOM ends up in the same shape: Drafting collapsed,
      // Final not collapsed.
      const saved = savePresetFromCurrent(PROJECT_KEY, 'F6 round-trip');
      expect(saved.stageCollapseState).toEqual({ default: ['Drafting'] });

      // Wipe storage + DOM, rebuild, then apply.
      window.localStorage.clear();
      document.body.innerHTML = '';
      setMatchMediaMatches(false);
      buildShell(['default']);
      bootControllers();
      // Re-seed the presets so applyPreset finds the saved one.
      window.localStorage.setItem(
        `${PREFIX}:focus-presets`,
        JSON.stringify({ [saved.id]: saved }),
      );
      const presetsAfter = readPresets(PROJECT_KEY);
      const reloaded = presetsAfter.get(saved.id);
      expect(reloaded).toBeDefined();
      if (reloaded === undefined) return;

      applyPreset(PROJECT_KEY, reloaded);

      // Verify storage shape.
      expect(window.localStorage.getItem(`${PREFIX}:stage-collapse`)).toBe(
        JSON.stringify({ default: ['Drafting'] }),
      );
      // Verify DOM: Drafting collapsed, Final NOT collapsed.
      const draftingCol = document.querySelector<HTMLElement>(
        '.swim[data-lane-id="default"] .stage-col[data-stage-col="Drafting"]',
      );
      const finalCol = document.querySelector<HTMLElement>(
        '.swim[data-lane-id="default"] .stage-col[data-stage-col="Final"]',
      );
      expect(draftingCol?.classList.contains('collapsed')).toBe(true);
      expect(finalCol?.classList.contains('collapsed')).toBe(false);
    });

    it('legacy boolean-map shape migrates to array shape on read', () => {
      buildShell(['default']);
      bootControllers();

      // Seed the presets store with a legacy-shape preset (boolean
      // map for stageCollapseState). The `coercePreset` migration
      // converts it on read.
      const legacyPreset = {
        id: 'legacy',
        name: 'Legacy shape',
        createdAt: '2026-05-28T12:00:00.000Z',
        visibleLanes: ['default'],
        focusedLanes: ['default'],
        viewModePerLane: {},
        laneCollapseState: {},
        // Old shape: inner is `{ stageName: boolean }`. The migration
        // drops `false` entries and keeps `true` entries.
        stageCollapseState: { default: { Drafting: true, Final: false } },
      };
      window.localStorage.setItem(
        `${PREFIX}:focus-presets`,
        JSON.stringify({ legacy: legacyPreset }),
      );

      const presets = readPresets(PROJECT_KEY);
      const reloaded = presets.get('legacy');
      expect(reloaded).toBeDefined();
      // After migration the stage-collapse axis carries only the
      // collapsed names.
      expect(reloaded?.stageCollapseState).toEqual({
        default: ['Drafting'],
      });
    });
  });
});
