// 028 T091 (US3) — RED: observable fail-open (FR-025; contract T6).
//
// When the interceptor cannot reach `stackctl` (spawn / evaluation failure), the
// adapter PERMITS (best-effort, 026 FR-014 — the load-bearing guarantee is the per-phase
// graduate gate) but emits a VISIBLE skip notice — NEVER a silent permit. The shipped
// bin/intercept adapter, on a non-zero exit from the verb, must surface a diagnosable
// notice rather than `exit 0` with no output.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { failOpenSignal } from '../../capability/intercept.js';

const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

describe('failOpenSignal (028 T091)', () => {
  it('produces a non-empty, diagnosable skip notice (never silent)', () => {
    const notice = failOpenSignal('spawn ENOENT');
    expect(notice.length).toBeGreaterThan(0);
    expect(notice).toMatch(/stack-control/i);
    expect(notice).toContain('spawn ENOENT'); // the underlying reason is surfaced
  });

  it('names the mediation skip explicitly (so the permit is observable)', () => {
    const notice = failOpenSignal('exit 3');
    expect(notice).toMatch(/mediation|skip|could not/i);
  });
});

describe('bin/intercept fail-open is observable (028 T091)', () => {
  const shim = readFileSync(join(PLUGIN_ROOT, 'bin', 'intercept'), 'utf8');

  it('emits a visible notice on a non-zero verb exit — never a silent exit 0', () => {
    // On RC != 0 the shim must write SOMETHING observable (a notice to stderr or a
    // PreToolUse output), not fall through silently to `exit 0` with no signal.
    expect(shim).toMatch(/RC.*-ne 0|"\$RC" -ne 0|\$RC -ne 0/);
    // A diagnosable reason is surfaced (the underlying exit code and the front-door hint).
    expect(shim).toMatch(/could not be evaluated|mediation/i);
  });
});
