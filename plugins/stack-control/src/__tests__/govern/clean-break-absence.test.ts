// 030 US2 (T024/T025/T027) — the clean break is verifiable: the per-phase
// invocation surfaces ERROR (no silent accept), no per-phase checkpoint is
// written, and the removed per-phase symbols are absent from the source they
// lived in (SC-002 — zero per-phase surfaces on the govern path + gate).

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../_run-helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..'); // plugins/stack-control/src

/** Read a source file with comments stripped, so an assertion fires on CODE, not a note that mentions the symbol. */
function source(rel: string): string {
  const raw = readFileSync(join(SRC, rel), 'utf8');
  return raw
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*'))
    .join('\n');
}

describe('030 T024 — per-phase invocation surfaces are rejected (FR-017)', () => {
  it('govern --phase is an unknown-flag usage error (no silent accept)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cb-phase-'));
    try {
      const r = runCli(['govern', '--mode', 'implement', '--phase', '1'], { cwd });
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toMatch(/unknown flag/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('setting GOVERN_CHECKPOINT is rejected (retired with the per-phase path)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cb-ckpt-'));
    try {
      const r = runCli(['govern', '--mode', 'implement'], { cwd, env: { GOVERN_CHECKPOINT: 'after_plan' } });
      expect(r.status).toBe(2);
      expect(r.stdout + r.stderr).toMatch(/GOVERN_CHECKPOINT is retired/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('030 T027 — removed per-phase surfaces are absent from source (SC-002)', () => {
  it('the graduate gate + criterion vocabulary have no per-phase surface', () => {
    const gate = source('workflow/gate-eval.ts');
    const types = source('workflow/workflow-types.ts');
    expect(gate).not.toMatch(/allPhaseCheckpointsCurrent/);
    expect(gate).not.toMatch(/all-phase-checkpoints-current/);
    expect(types).not.toMatch(/all-phase-checkpoints-current/);
  });

  it('the boundary-too-large FATAL terminal + error type are deleted', () => {
    const protocol = source('govern/protocol.ts');
    const sizing = source('govern/phase-boundary-sizing.ts');
    expect(protocol).not.toMatch(/BoundaryTooLargeError/);
    expect(protocol).not.toMatch(/\| 'boundary-too-large'/); // not a GovernTerminalKind member
    expect(sizing).not.toMatch(/BoundaryTooLargeError/);
    expect(sizing).not.toMatch(/assertBoundaryFits/);
    // the measurement disposition 'boundary-too-large' legitimately survives in sizing.
  });

  it('the govern command has no per-phase invocation / checkpoint / composition surface', () => {
    const govern = source('subcommands/govern.ts');
    for (const sym of [
      'featureCheckpointKey',
      'carriedFilesForComposition',
      'resolvePhaseCheckpointStatuses',
      'assertPriorPhaseCheckpointsCurrent',
      'writePhaseCheckpoint',
      'compositionExcludePaths',
      "'--phase'",
    ]) {
      expect(govern, `'${sym}' must be gone from govern.ts`).not.toContain(sym);
    }
  });
});
