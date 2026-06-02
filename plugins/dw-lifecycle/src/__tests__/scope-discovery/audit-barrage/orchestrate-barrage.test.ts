/**
 * Tests for orchestrate-barrage.ts — exercises the parallel fan-out
 * against fake-CLI fixtures + asserts the on-disk run-dir layout.
 */

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { orchestrateBarrage } from '../../../scope-discovery/audit-barrage/orchestrate-barrage.js';
import type { ModelConfig } from '../../../scope-discovery/audit-barrage/types.js';

const NODE_BIN = process.execPath;

function fakeCli(opts: {
  readonly name: string;
  readonly script: string;
  readonly timeoutSeconds?: number;
}): ModelConfig {
  const b64 = Buffer.from(opts.script, 'utf8').toString('base64');
  const evalArg = `eval(Buffer.from('${b64}','base64').toString('utf8'))`;
  return {
    name: opts.name,
    binary: NODE_BIN,
    argsTemplate: `-e ${evalArg} {{prompt}}`,
    timeoutSeconds: opts.timeoutSeconds ?? 5,
  };
}

describe('orchestrateBarrage', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'audit-barrage-orch-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes the full run-dir layout for an all-success fan-out', async () => {
    const run = await orchestrateBarrage({
      repoRoot: tmp,
      runDirOverride: tmp,
      featureSlug: 'sample',
      prompt: 'AUDIT PROMPT BODY',
      models: [
        fakeCli({
          name: 'mockA',
          script: `process.stdout.write('A says: ' + process.argv[1]);`,
        }),
        fakeCli({
          name: 'mockB',
          script: `process.stdout.write('B says: ' + process.argv[1]);`,
        }),
      ],
    });

    expect(run.results.length).toBe(2);
    expect(run.runDir.startsWith(tmp)).toBe(true);
    // Names + timestamp shape (millisecond resolution, sss suffix).
    expect(run.timestamp).toMatch(/^\d{8}T\d{9}Z$/);
    expect(run.featureSlug).toBe('sample');

    // PROMPT.md verbatim.
    const promptText = await readFile(run.promptPath, 'utf8');
    expect(promptText).toBe('AUDIT PROMPT BODY');

    // INDEX.md exists with per-model rows.
    const indexText = await readFile(run.indexPath, 'utf8');
    expect(indexText).toContain('### mockA');
    expect(indexText).toContain('### mockB');

    // Per-model stdout captures.
    const captureA = await readFile(join(run.runDir, 'mockA.md'), 'utf8');
    expect(captureA).toBe('A says: AUDIT PROMPT BODY');
    const captureB = await readFile(join(run.runDir, 'mockB.md'), 'utf8');
    expect(captureB).toBe('B says: AUDIT PROMPT BODY');

    // Per-model stderr captures (empty for success path) exist.
    const stderrFiles = await readdir(join(run.runDir, 'stderr'));
    expect(stderrFiles.sort()).toEqual(['mockA.txt', 'mockB.txt']);

    // Result records.
    for (const result of run.results) {
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
      expect(result.spawnError).toBeUndefined();
      expect(result.stdoutBytes).toBeGreaterThan(0);
    }
  });

  it('per-model timeout does not affect siblings', async () => {
    const run = await orchestrateBarrage({
      repoRoot: tmp,
      runDirOverride: tmp,
      featureSlug: 'mixed',
      prompt: 'P',
      models: [
        fakeCli({
          name: 'fast',
          script: `process.stdout.write('done');`,
          timeoutSeconds: 5,
        }),
        fakeCli({
          name: 'slow',
          script: `setTimeout(() => process.stdout.write('late'), 4000);`,
          timeoutSeconds: 1,
        }),
      ],
    });
    expect(run.results.length).toBe(2);
    const fast = run.results.find((r) => r.name === 'fast');
    const slow = run.results.find((r) => r.name === 'slow');
    expect(fast).toBeDefined();
    expect(slow).toBeDefined();
    if (fast === undefined || slow === undefined) {
      throw new Error('expected both results');
    }
    expect(fast.exitCode).toBe(0);
    expect(fast.timedOut).toBe(false);
    expect(slow.timedOut).toBe(true);
  }, 20000);

  it('spawn error on one model does not crash the run', async () => {
    const run = await orchestrateBarrage({
      repoRoot: tmp,
      runDirOverride: tmp,
      featureSlug: 'partial',
      prompt: 'P',
      models: [
        fakeCli({
          name: 'good',
          script: `process.stdout.write('ok');`,
        }),
        {
          name: 'bad',
          binary: '/path/does/not/exist/anywhere',
          argsTemplate: '{{prompt}}',
          timeoutSeconds: 5,
        },
      ],
    });
    expect(run.results.length).toBe(2);
    const good = run.results.find((r) => r.name === 'good');
    const bad = run.results.find((r) => r.name === 'bad');
    expect(good).toBeDefined();
    expect(bad).toBeDefined();
    if (good === undefined || bad === undefined) {
      throw new Error('expected both results');
    }
    expect(good.exitCode).toBe(0);
    expect(good.stdoutBytes).toBeGreaterThan(0);
    expect(bad.exitCode).toBe(-2);
    expect(bad.spawnError).toBeDefined();
    // INDEX.md still written.
    const indexText = await readFile(run.indexPath, 'utf8');
    expect(indexText).toContain('### good');
    expect(indexText).toContain('### bad');
    expect(indexText).toContain('spawn error:');
  });

  // Phase 16 Task 2 (#383): the orchestrator writes `<runDir>/tip.sha`
  // at fire-time so the new-diff guard (`check-barrage-tip`) on the
  // next iteration can answer "have new commits accumulated since
  // this barrage?" The tipShaResolver is injectable; the default
  // calls `git rev-parse HEAD` against repoRoot.
  it('writes tip.sha with the resolver-returned HEAD sha', async () => {
    const run = await orchestrateBarrage({
      repoRoot: tmp,
      runDirOverride: tmp,
      featureSlug: 'sample',
      prompt: 'AUDIT',
      models: [
        fakeCli({
          name: 'mock',
          script: `process.stdout.write('ok');`,
        }),
      ],
      tipShaResolver: async () => 'cafef00dcafef00dcafef00dcafef00dcafef00d',
    });
    const tipText = await readFile(join(run.runDir, 'tip.sha'), 'utf8');
    expect(tipText.trim()).toBe('cafef00dcafef00dcafef00dcafef00dcafef00d');
  });

  it('skips the tip.sha write when the resolver returns null', async () => {
    const run = await orchestrateBarrage({
      repoRoot: tmp,
      runDirOverride: tmp,
      featureSlug: 'sample',
      prompt: 'AUDIT',
      models: [
        fakeCli({
          name: 'mock',
          script: `process.stdout.write('ok');`,
        }),
      ],
      tipShaResolver: async () => null,
    });
    const entries = await readdir(run.runDir);
    expect(entries).not.toContain('tip.sha');
  });

  // Per AUDIT-20260531 cross-model finding (claude-03 + codex-02):
  // an outage run (all models 0 bytes) MUST NOT leave a tip.sha,
  // otherwise the next check-barrage-tip iteration sees "no new diff"
  // and skips — silently re-creating the #383 audit-coverage hole
  // for the outage path.
  it('skips the tip.sha write when ALL models produce zero bytes (outage)', async () => {
    const run = await orchestrateBarrage({
      repoRoot: tmp,
      runDirOverride: tmp,
      featureSlug: 'sample',
      prompt: 'AUDIT',
      models: [
        fakeCli({
          name: 'mock-silent',
          // Model exits immediately with no stdout
          script: `process.exit(0);`,
        }),
      ],
      tipShaResolver: async () => 'abcdef1234567890',
    });
    const entries = await readdir(run.runDir);
    expect(entries).not.toContain('tip.sha');
    // Verify the run's tracked outcome: zero stdout bytes.
    expect(run.results[0]?.stdoutBytes).toBe(0);
  });

  it('writes tip.sha when at least ONE model emits (partial outage)', async () => {
    const run = await orchestrateBarrage({
      repoRoot: tmp,
      runDirOverride: tmp,
      featureSlug: 'sample',
      prompt: 'AUDIT',
      models: [
        fakeCli({
          name: 'silent',
          script: `process.exit(0);`,
        }),
        fakeCli({
          name: 'noisy',
          script: `process.stdout.write('AUDIT-x-01: real finding');`,
        }),
      ],
      tipShaResolver: async () => 'cafef00d',
    });
    const tipText = await readFile(join(run.runDir, 'tip.sha'), 'utf8');
    expect(tipText.trim()).toBe('cafef00d');
  });
});
