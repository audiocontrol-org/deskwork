/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the per-lane Compose chip —
 * Phase 5 Task 5.1C.
 *
 * Exercises `initSwimlaneCompose` against a synthesised DOM mirroring
 * the server-rendered swim-head + compose-chip markup.
 *
 * Coverage:
 *   - Click writes the exact composed slash command to
 *     `navigator.clipboard.writeText`.
 *   - After click the chip enters `.copied` flash state: `.sc-icon`
 *     becomes `✓`; `.sc-label` becomes `Copied — paste in chat`.
 *   - After 2000ms (fake timers) the flash reverts: `.copied` is
 *     dropped; `.sc-icon` is `+`; `.sc-label` is `new`.
 *   - Rapid double-click resets the timer — chip stays in `.copied`
 *     until 2000ms after the SECOND click, not the first.
 *   - Space activates the chip and calls `preventDefault` (page-
 *     scroll suppression per WCAG 2.1 SC 2.1.1).
 *   - Click does NOT bubble to a `.swim-head` parent listener (the
 *     stopPropagation contract that prevents lane-collapse toggle).
 *   - When `navigator.clipboard.writeText` rejects, the chip does
 *     NOT enter `.copied` state AND the rejection propagates (the
 *     no-fallback contract — no `document.execCommand('copy')`
 *     paper-over).
 *   - Collapse precedence: when the parent swim is `.collapsed`,
 *     click is a no-op + clipboard is not written.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSwimlaneCompose } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-compose';

interface BuildOptions {
  readonly laneId: string;
  readonly laneName: string;
  readonly firstStage: string;
  /** When true, the swim is pre-collapsed (for collapse-precedence tests). */
  readonly collapsed?: boolean;
}

function buildSwim(opts: BuildOptions): HTMLElement {
  const swim = document.createElement('article');
  swim.classList.add('swim', `swim--${opts.laneId}`, 'view-kanban');
  if (opts.collapsed === true) swim.classList.add('collapsed');
  swim.dataset.laneId = opts.laneId;

  const head = document.createElement('div');
  head.classList.add('swim-head');
  const name = document.createElement('span');
  name.classList.add('name');
  name.textContent = opts.laneName;
  head.appendChild(name);

  // Compose chip — matches the server-rendered markup contract.
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.classList.add('swim-compose');
  chip.setAttribute('aria-label', `Compose new entry in ${opts.laneName}`);
  chip.dataset.swimCompose = '';
  chip.dataset.laneId = opts.laneId;
  chip.dataset.firstStage = opts.firstStage;
  const icon = document.createElement('span');
  icon.classList.add('sc-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '+';
  const label = document.createElement('span');
  label.classList.add('sc-label');
  label.textContent = 'new';
  chip.appendChild(icon);
  chip.appendChild(label);
  head.appendChild(chip);

  swim.appendChild(head);
  return swim;
}

function buildShell(
  swims: readonly BuildOptions[],
  projectKey: string = 'task-5-1c-test-key',
): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = projectKey;
  for (const opts of swims) {
    shell.appendChild(buildSwim(opts));
  }
  document.body.appendChild(shell);
}

/**
 * Stub `navigator.clipboard` so the controller's clipboard write can
 * be observed deterministically. jsdom does not implement the
 * Clipboard API — we install our own under `Object.defineProperty`
 * (mirrors the `setMatchMediaMatches` shim pattern in
 * `dashboard-swimlane-view-toggle-client.test.ts:153–199`). The
 * `writer` parameter lets a test inject a rejection path.
 */
interface ClipboardShim {
  writeText: (text: string) => Promise<void>;
}

function installClipboard(
  writer: (text: string) => Promise<void>,
): { calls: string[] } {
  const calls: string[] = [];
  const shim: ClipboardShim = {
    writeText: async (text) => {
      calls.push(text);
      await writer(text);
    },
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: shim,
  });
  return { calls };
}

describe('swimlane compose-chip client — Task 5.1C', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore navigator.clipboard to undefined between tests so one
    // test's shim doesn't leak into another.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('click writes the composed slash command to the clipboard', async () => {
    const { calls } = installClipboard(() => Promise.resolve());
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    expect(chip).not.toBeNull();
    chip?.click();
    // Yield once for the clipboard promise to resolve.
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([
      '/deskwork:add <SLUG> --lane default --stage Ideas',
    ]);
  });

  it('after click the chip enters .copied flash state', async () => {
    installClipboard(() => Promise.resolve());
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(chip?.classList.contains('copied')).toBe(true);
    expect(
      chip?.querySelector<HTMLElement>('.sc-icon')?.textContent,
    ).toBe('✓');
    expect(
      chip?.querySelector<HTMLElement>('.sc-label')?.textContent,
    ).toBe('Copied — paste in chat');
  });

  it('after ~2000ms the .copied flash reverts', async () => {
    installClipboard(() => Promise.resolve());
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(chip?.classList.contains('copied')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(chip?.classList.contains('copied')).toBe(false);
    expect(
      chip?.querySelector<HTMLElement>('.sc-icon')?.textContent,
    ).toBe('+');
    expect(
      chip?.querySelector<HTMLElement>('.sc-label')?.textContent,
    ).toBe('new');
  });

  it('rapid double-click resets the revert timer', async () => {
    installClipboard(() => Promise.resolve());
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await vi.advanceTimersByTimeAsync(0);
    // Advance 1500ms — first timer would fire at 2000ms.
    await vi.advanceTimersByTimeAsync(1500);
    expect(chip?.classList.contains('copied')).toBe(true);
    // Second click — timer should be reset, NOT compound with the
    // first.
    chip?.click();
    await vi.advanceTimersByTimeAsync(0);
    // Advance another 1500ms (3000ms total from first click). If the
    // timer hadn't reset, the chip would have reverted by now (at
    // 2000ms). The reset means the chip is still in .copied at
    // 1500ms after the SECOND click.
    await vi.advanceTimersByTimeAsync(1500);
    expect(chip?.classList.contains('copied')).toBe(true);
    // Advance the remaining 500ms (2000ms after the SECOND click) —
    // the chip reverts now.
    await vi.advanceTimersByTimeAsync(500);
    expect(chip?.classList.contains('copied')).toBe(false);
  });

  it('Space on the chip activates + preventDefaults page scroll', async () => {
    const { calls } = installClipboard(() => Promise.resolve());
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    expect(chip).not.toBeNull();
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    chip?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([
      '/deskwork:add <SLUG> --lane default --stage Ideas',
    ]);
  });

  it('click does not bubble to the swim-head (stopPropagation contract)', async () => {
    installClipboard(() => Promise.resolve());
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    const swimHead = swim?.querySelector<HTMLElement>('.swim-head');
    let bubbledClicks = 0;
    swimHead?.addEventListener('click', () => {
      bubbledClicks += 1;
    });
    const chip = swim?.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(bubbledClicks).toBe(0);
  });

  it('clipboard write rejection — chip does not enter .copied AND the error surfaces as an uncaught exception', async () => {
    // The controller's no-fallback contract: when clipboard.writeText
    // rejects, the controller surfaces the error rather than papering
    // over it. The visible signals are (1) the chip stays out of
    // `.copied` (operator-visible) and (2) the error escapes the
    // click handler via `queueMicrotask(() => { throw err })` so it
    // lands on the process's `uncaughtException` surface — the
    // strongest "this is broken" signal a microtask-bound handler
    // can produce.
    const denied = new Error('clipboard write denied');
    // Capture uncaughtException at the process level. Vitest itself
    // listens for this surface; we install our listener FIRST and
    // remove vitest's during the assertion so we get the error.
    const priorListeners = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    const surfaced: unknown[] = [];
    const capture = (err: unknown): void => {
      surfaced.push(err);
    };
    process.on('uncaughtException', capture);

    const { calls } = installClipboard(() => Promise.reject(denied));
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');

    try {
      chip?.click();
      // Flush microtasks so the queueMicrotask throw fires: click
      // handler → catch → queueMicrotask → throw → uncaughtException.
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
      // Clipboard API was reached (proving no silent skip).
      expect(calls).toEqual([
        '/deskwork:add <SLUG> --lane default --stage Ideas',
      ]);
      // Operator-visible signal: chip stays out of .copied. No
      // `document.execCommand('copy')` paper-over.
      expect(chip?.classList.contains('copied')).toBe(false);
      expect(
        chip?.querySelector<HTMLElement>('.sc-icon')?.textContent,
      ).toBe('+');
      // Implementation signal: the rejected promise's error reached
      // the uncaughtException surface — the controller re-throws via
      // queueMicrotask rather than swallowing.
      expect(surfaced).toContain(denied);
    } finally {
      process.removeListener('uncaughtException', capture);
      for (const l of priorListeners) {
        process.on('uncaughtException', l);
      }
    }
  });

  it('collapse precedence — click when swim is .collapsed is a no-op', async () => {
    const { calls } = installClipboard(() => Promise.resolve());
    buildShell([
      {
        laneId: 'default',
        laneName: 'Editorial',
        firstStage: 'Ideas',
        collapsed: true,
      },
    ]);
    initSwimlaneCompose();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="default"]');
    expect(swim?.classList.contains('collapsed')).toBe(true);
    const chip = swim?.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await vi.advanceTimersByTimeAsync(0);
    // No clipboard write — collapse precedence short-circuited.
    expect(calls).toEqual([]);
    // Chip stays out of .copied — no flash either.
    expect(chip?.classList.contains('copied')).toBe(false);
  });

  it('chip remains a real focusable <button> after flash', async () => {
    installClipboard(() => Promise.resolve());
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    expect(chip?.tagName.toLowerCase()).toBe('button');
    chip?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(chip?.tagName.toLowerCase()).toBe('button');
    expect(chip?.getAttribute('aria-label')).toBe(
      'Compose new entry in Editorial',
    );
  });
});
