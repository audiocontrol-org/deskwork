// specs/015-audit-protocol-convergence — T026 (RED→GREEN, SC-006 / FR-009): a
// per-phase payload's derived timeout for a lane is < the whole-feature payload's,
// and it flows through the SAME 014 timeout primitive — the smaller unit only
// scales the derived timeout DOWN; no reliability guarantee is weakened.

import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleImplementPayload } from '../../../govern/payload-implement.js';
import { deriveTimeoutBasis } from '../../../scope-discovery/audit-barrage/timeout-derivation.js';
import type { ModelConfig } from '../../../scope-discovery/audit-barrage/types.js';

function lane(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    name: 'claude',
    binary: 'claude',
    argsTemplate: '-p --model {{model}} {{prompt-stdin}}',
    model: 'opus',
    readonlyEnforcement: '--permission-mode plan',
    outputMode: 'stream-json',
    livenessSignal: 'stdout',
    livenessWindowSeconds: 60,
    // A low floor so the DERIVED branch dominates for both payload sizes and the
    // size delta is visible (the floor is a separate, unchanged reliability bound).
    timeoutFloorSeconds: 1,
    timeoutSecsPerKb: 13,
    ...overrides,
  };
}

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe('per-phase payload yields a smaller derived timeout (SC-006 / FR-009)', () => {
  it('the phase-scoped payload derives a strictly smaller timeout than the whole-feature payload', () => {
    const repo = mkdtempSync(join(tmpdir(), 'phase-timeout-'));
    dirs.push(repo);
    spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    mkdirSync(join(repo, 'src', 'phase1'), { recursive: true });
    mkdirSync(join(repo, 'src', 'phase2'), { recursive: true });
    // Each phase has a substantial untracked file so the folded payload exceeds
    // the floor in KB terms.
    writeFileSync(join(repo, 'src', 'phase1', 'a.ts'), `// p1\n${'x'.repeat(4000)}\n`);
    writeFileSync(join(repo, 'src', 'phase2', 'b.ts'), `// p2\n${'y'.repeat(4000)}\n`);

    const feature = assembleImplementPayload({ repoRoot: repo, base: 'HEAD' });
    const phase = assembleImplementPayload({ repoRoot: repo, base: 'HEAD', pathScope: ['src/phase1'] });

    // The phase payload is smaller (it folds one phase's file, not both).
    expect(phase.diff.length).toBeLessThan(feature.diff.length);

    const featureBasis = deriveTimeoutBasis(lane(), Buffer.byteLength(feature.diff, 'utf8'));
    const phaseBasis = deriveTimeoutBasis(lane(), Buffer.byteLength(phase.diff, 'utf8'));

    // Same primitive (derived mode) — only the payload size, and thus the derived
    // timeout, changed. No watchdog / terminal-state path is touched here.
    expect(featureBasis.mode).toBe('derived');
    expect(phaseBasis.mode).toBe('derived');
    expect(phaseBasis.effectiveTimeoutSeconds).toBeLessThan(featureBasis.effectiveTimeoutSeconds);
  });
});
