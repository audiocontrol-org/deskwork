/**
 * @vitest-environment jsdom
 *
 * Regression tests for AUDIT-20260530-28 (cross-model:
 * AUDIT-BARRAGE-codex-P5-1) — the per-lane `.swim-compose` chip
 * serialises `--stage <firstStage>` directly into the clipboard
 * command without argument quoting. Pipeline templates allow
 * arbitrary non-empty stage strings (see `uniqueStringArray('linear-
 * Stages', 1)` at `packages/core/src/pipelines/types.ts:108-115`),
 * so a custom lane whose first stage is `QA Review` would emit
 * `/deskwork:add <SLUG> --lane qa --stage QA Review` — argv parsers
 * read that as stage `QA` plus a stray `Review` token.
 *
 * Fix shape (from the audit-log entry + Task 0.4 brief): client-side
 * quoting in `swimlane-compose.ts` (the server `data-first-stage`
 * attribute is a string carrier and stays as-is). The codebase's
 * shared `quoteValue` helper at `plugins/deskwork-studio/public/src/
 * copy-builder.ts:42-44` uses `JSON.stringify` — double-quoted shell-
 * style escapes for `"`, `\`, and control chars. Apply that helper
 * conditionally — only when the stage value contains whitespace,
 * a double-quote, or a backslash — so bare values like `Ideas` /
 * `Sketched` / `Drafted` keep their existing emission shape (back-
 * compat with the pre-existing tests in
 * `dashboard-swimlane-compose-client.test.ts:152, 264, 323`).
 *
 * The canonical convention is double-quotes per the `/deskwork:add`
 * SKILL.md examples: `--stage "QA Review"`, `--stage "Drafting"`,
 * `--stage "Iterating"` (`plugins/deskwork/skills/add/SKILL.md:25,
 * 33-35`).
 *
 * Anchor: `plugins/deskwork-studio/public/src/dashboard/swimlane-
 * compose.ts:90-98` — the `composeChipSlash` builder. The new file
 * (per the Task 0.4 brief) is preferred over editing the existing
 * compose-client test so the regression sits alongside the existing
 * coverage rather than diffused into it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initSwimlaneCompose } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-compose';

interface BuildOptions {
  readonly laneId: string;
  readonly laneName: string;
  readonly firstStage: string;
}

function buildSwim(opts: BuildOptions): HTMLElement {
  const swim = document.createElement('article');
  swim.classList.add('swim', `swim--${opts.laneId}`, 'view-kanban');
  swim.dataset.laneId = opts.laneId;

  const head = document.createElement('div');
  head.classList.add('swim-head');
  const name = document.createElement('span');
  name.classList.add('name');
  name.textContent = opts.laneName;
  head.appendChild(name);

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

function buildShell(swims: readonly BuildOptions[]): void {
  document.body.innerHTML = '';
  const shell = document.createElement('section');
  shell.classList.add('bay-shell');
  shell.dataset.bayShell = '';
  shell.dataset.projectKey = 'task-0-4-quote-test-key';
  for (const opts of swims) {
    shell.appendChild(buildSwim(opts));
  }
  document.body.appendChild(shell);
}

interface ClipboardShim {
  writeText: (text: string) => Promise<void>;
}

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

/**
 * Yield twice — once for the async click handler's first await
 * (the clipboard `writeText` promise), once for the resolved-then
 * microtask. Two yields are sufficient under jsdom + real timers.
 */
async function settleMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('swimlane compose-chip clipboard quoting — AUDIT-20260530-28', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: undefined,
    });
  });

  it('stage names with whitespace are double-quoted (QA Review)', async () => {
    const { calls } = installClipboard();
    buildShell([
      { laneId: 'qa', laneName: 'QA', firstStage: 'QA Review' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    expect(chip).not.toBeNull();
    chip?.click();
    await settleMicrotasks();
    // The bug emits `--stage QA Review` (unquoted); the fix emits
    // `--stage "QA Review"`. Argv parsers split on whitespace, so
    // the unquoted form makes `Review` a stray positional.
    expect(calls).toEqual([
      '/deskwork:add <SLUG> --lane qa --stage "QA Review"',
    ]);
  });

  it('stage names with a double-quote are escaped via JSON-stringify', async () => {
    const { calls } = installClipboard();
    buildShell([
      // Realistic operator-supplied stage names may carry typographic
      // characters; the regression must hold for the simpler ASCII
      // double-quote shape too.
      { laneId: 'qa', laneName: 'QA', firstStage: 'Joe "the" Stage' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await settleMicrotasks();
    // `JSON.stringify('Joe "the" Stage')` →
    // `"Joe \"the\" Stage"` — preserves the embedded quote via
    // backslash-escape inside a double-quoted run.
    expect(calls).toEqual([
      '/deskwork:add <SLUG> --lane qa --stage "Joe \\"the\\" Stage"',
    ]);
  });

  it('stage names with a backslash are escaped via JSON-stringify', async () => {
    const { calls } = installClipboard();
    buildShell([
      { laneId: 'svc', laneName: 'Service', firstStage: 'Path\\Stage' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await settleMicrotasks();
    // `JSON.stringify('Path\\Stage')` → `"Path\\Stage"`.
    expect(calls).toEqual([
      '/deskwork:add <SLUG> --lane svc --stage "Path\\\\Stage"',
    ]);
  });

  it('stage names with a single-quote are double-quoted, no escape needed', async () => {
    const { calls } = installClipboard();
    buildShell([
      { laneId: 'qa', laneName: 'QA', firstStage: "Joe's Stage" },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await settleMicrotasks();
    // Single-quotes are safe inside JSON.stringify's double-quoted
    // output — no escape needed; whitespace alone forces the quote.
    expect(calls).toEqual([
      `/deskwork:add <SLUG> --lane qa --stage "Joe's Stage"`,
    ]);
  });

  it('bare alphanumeric stage names keep the existing unquoted shape (back-compat)', async () => {
    // Back-compat with the pre-existing compose-client tests at
    // `dashboard-swimlane-compose-client.test.ts:152, 264, 323` which
    // pin `--stage Ideas` (unquoted). Unconditional `quoteValue` would
    // emit `--stage "Ideas"` and regress those assertions; the fix is
    // conditional quoting — only when whitespace / `"` / `\` is present.
    const { calls } = installClipboard();
    buildShell([
      { laneId: 'default', laneName: 'Editorial', firstStage: 'Ideas' },
    ]);
    initSwimlaneCompose();
    const chip = document.querySelector<HTMLButtonElement>('.swim-compose');
    chip?.click();
    await settleMicrotasks();
    expect(calls).toEqual([
      '/deskwork:add <SLUG> --lane default --stage Ideas',
    ]);
  });
});
