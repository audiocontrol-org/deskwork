/**
 * @vitest-environment jsdom
 *
 * Client-side controller tests for the per-lane empty-state CTA —
 * Phase 5 Task 5.2.
 *
 * Exercises `initSwimlaneCompose` against a synthesised DOM mirroring
 * the server-rendered empty-lane CTA markup (`.swim-empty-cta` >
 * `.sec-cta`). The CTA carries a different clipboard payload than the
 * compose chip (`/deskwork:add --lane <id>` — no slug placeholder, no
 * stage flag).
 *
 * Originally part of `dashboard-swimlane-compose-client.test.ts`;
 * split out per AUDIT-20260528-14 to satisfy the project's 300-500
 * line file-size cap. The compose-chip describe stays in the original
 * file; this file owns the empty-CTA describe + its dedicated fixture
 * builders.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initSwimlaneCompose } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-compose';

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

interface EmptyShellOptions {
  readonly laneId: string;
  readonly laneName: string;
  readonly collapsed?: boolean;
}

function buildEmptyShellSwim(opts: EmptyShellOptions): HTMLElement {
  const swim = document.createElement('article');
  swim.classList.add('swim', `swim--${opts.laneId}`, 'view-kanban');
  if (opts.collapsed === true) swim.classList.add('collapsed');
  swim.dataset.laneId = opts.laneId;

  const head = document.createElement('div');
  head.classList.add('swim-head');
  swim.appendChild(head);

  const cta = document.createElement('div');
  cta.classList.add('swim-empty-cta');
  cta.dataset.swimEmptyCta = '';

  const msg = document.createElement('p');
  msg.classList.add('sec-msg');
  msg.textContent = 'Create your first entry in this lane.';
  cta.appendChild(msg);

  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('sec-cta');
  button.setAttribute('aria-label', `Compose first entry in ${opts.laneName}`);
  button.dataset.swimEmptyCopy = '';
  button.dataset.laneId = opts.laneId;

  const icon = document.createElement('span');
  icon.classList.add('sec-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '+';
  const label = document.createElement('span');
  label.classList.add('sec-label');
  label.textContent = 'Create your first entry';
  button.appendChild(icon);
  button.appendChild(label);
  cta.appendChild(button);

  const hint = document.createElement('p');
  hint.classList.add('sec-hint');
  hint.textContent = `copies /deskwork:add --lane ${opts.laneId}`;
  cta.appendChild(hint);

  swim.appendChild(cta);
  return swim;
}

function buildEmptyShell(
  swims: readonly EmptyShellOptions[],
  projectKey: string = 'task-5-2-test-key',
): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = projectKey;
  for (const opts of swims) {
    shell.appendChild(buildEmptyShellSwim(opts));
  }
  document.body.appendChild(shell);
}

describe('swimlane empty-lane CTA client — Task 5.2', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('click writes "/deskwork:add --lane <id>" to the clipboard (no slug placeholder, no stage flag)', async () => {
    const { calls } = installClipboard(() => Promise.resolve());
    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
    initSwimlaneCompose();
    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
    expect(cta).not.toBeNull();
    cta?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['/deskwork:add --lane mockups']);
  });

  it('after click the CTA enters .copied flash state with swapped icon + label', async () => {
    installClipboard(() => Promise.resolve());
    buildEmptyShell([{ laneId: 'qa', laneName: 'QA' }]);
    initSwimlaneCompose();
    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
    cta?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(cta?.classList.contains('copied')).toBe(true);
    expect(cta?.querySelector<HTMLElement>('.sec-icon')?.textContent).toBe('✓');
    expect(cta?.querySelector<HTMLElement>('.sec-label')?.textContent).toBe(
      'Copied — paste in chat',
    );
  });

  it('swaps aria-label to the success message during .copied', async () => {
    installClipboard(() => Promise.resolve());
    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
    initSwimlaneCompose();
    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
    expect(cta?.getAttribute('aria-label')).toBe(
      'Compose first entry in Mockups',
    );
    cta?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(cta?.getAttribute('aria-label')).toBe('Copied — paste in chat');
    await vi.advanceTimersByTimeAsync(2000);
    expect(cta?.getAttribute('aria-label')).toBe(
      'Compose first entry in Mockups',
    );
  });

  it('after ~2000ms the .copied flash reverts to "Create your first entry"', async () => {
    installClipboard(() => Promise.resolve());
    buildEmptyShell([{ laneId: 'qa', laneName: 'QA' }]);
    initSwimlaneCompose();
    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
    cta?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(cta?.classList.contains('copied')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(cta?.classList.contains('copied')).toBe(false);
    expect(cta?.querySelector<HTMLElement>('.sec-icon')?.textContent).toBe('+');
    expect(cta?.querySelector<HTMLElement>('.sec-label')?.textContent).toBe(
      'Create your first entry',
    );
  });

  it('Space on the CTA activates + preventDefaults page scroll', async () => {
    const { calls } = installClipboard(() => Promise.resolve());
    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
    initSwimlaneCompose();
    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');
    const ev = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    });
    cta?.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(['/deskwork:add --lane mockups']);
  });

  it('collapse precedence — click when swim is .collapsed is a no-op', async () => {
    const { calls } = installClipboard(() => Promise.resolve());
    buildEmptyShell([
      { laneId: 'mockups', laneName: 'Mockups', collapsed: true },
    ]);
    initSwimlaneCompose();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="mockups"]');
    expect(swim?.classList.contains('collapsed')).toBe(true);
    const cta = swim?.querySelector<HTMLButtonElement>('.sec-cta');
    cta?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([]);
    expect(cta?.classList.contains('copied')).toBe(false);
  });

  it('click does NOT bubble to the swim body (stopPropagation contract)', async () => {
    installClipboard(() => Promise.resolve());
    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
    initSwimlaneCompose();
    const swim = document.querySelector<HTMLElement>('.swim[data-lane-id="mockups"]');
    let bubbledClicks = 0;
    swim?.addEventListener('click', () => {
      bubbledClicks += 1;
    });
    const cta = swim?.querySelector<HTMLButtonElement>('.sec-cta');
    cta?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(bubbledClicks).toBe(0);
  });

  it('clipboard rejection — CTA does not enter .copied AND error surfaces uncaught', async () => {
    const denied = new Error('clipboard write denied');
    const priorListeners = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    const surfaced: unknown[] = [];
    const capture = (err: unknown): void => {
      surfaced.push(err);
    };
    process.on('uncaughtException', capture);

    const { calls } = installClipboard(() => Promise.reject(denied));
    buildEmptyShell([{ laneId: 'mockups', laneName: 'Mockups' }]);
    initSwimlaneCompose();
    const cta = document.querySelector<HTMLButtonElement>('.sec-cta');

    try {
      cta?.click();
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
      expect(calls).toEqual(['/deskwork:add --lane mockups']);
      expect(cta?.classList.contains('copied')).toBe(false);
      expect(cta?.querySelector<HTMLElement>('.sec-icon')?.textContent).toBe('+');
      expect(surfaced).toContain(denied);
    } finally {
      process.removeListener('uncaughtException', capture);
      for (const l of priorListeners) {
        process.on('uncaughtException', l);
      }
    }
  });
});
