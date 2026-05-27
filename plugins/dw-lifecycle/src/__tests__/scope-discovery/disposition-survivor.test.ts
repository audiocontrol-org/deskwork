/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/disposition-survivor.test.ts
 *
 * Adversarial scenarios for `check-disposition-survivor` (TF-013 /
 * AUDIT-20260525-06 / #289). The gate compares HEAD's version of the
 * baseline (via `git show HEAD:<path>`) against the working tree, and
 * fails the commit if any clone-group's disposition reverted from
 * non-pending (`keep-with-reason`, `refactor`,
 * `ignore-with-justification`) to `pending`.
 *
 * Scenarios:
 *  1. No transitions → exit 0.
 *  2. keep-with-reason → pending → exit 1; output names the group.
 *  3. Multiple losses → exit 1; all listed.
 *  4. --allow-disposition-loss → exit 0 with warning naming the losses.
 *  5. refactor → pending → exit 1 (same as keep-with-reason).
 *  6. ignore-with-justification → pending → exit 1.
 *  7. pending → pending (no-op) → exit 0.
 *  8. pending → keep-with-reason (operator improvement) → exit 0.
 *  9. Gutted-stub teeth: monkey-patch findDestructiveTransitions to
 *     always return [] and confirm the probe would accept the no-op
 *     scanner — proving the real scanner's teeth are load-bearing.
 *
 * Each scenario plants a tiny git repo in a tmpdir, commits a baseline
 * to HEAD, modifies the working tree, and drives the gate via the cli.ts
 * dispatcher.
 */

import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  type ClonesYaml,
  serializeClonesYaml,
} from '../../scope-discovery/clones-yaml.js';
import {
  findDestructiveTransitions,
} from '../../scope-discovery/check-disposition-survivor.js';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

const BASELINE_RELPATH = '.dw-lifecycle/scope-discovery/clones.yaml';

interface GitFixture {
  readonly dir: string;
  readonly baselineAbs: string;
  cleanup(): Promise<void>;
}

/** Plant a tmpdir with `git init`, a HEAD-committed baseline, and the
 * baseline path resolved for the working-tree write step. */
async function makeGitFixture(
  label: string,
  initialDoc: ClonesYaml,
): Promise<GitFixture> {
  const dir = await mkdtemp(join(tmpdir(), `dw-dispsurv-${label}-`));
  // git init + minimal config so commits work even on a barebones CI.
  runGit(['init', '-q', '-b', 'main'], dir);
  runGit(['config', 'user.email', 'test@example.com'], dir);
  runGit(['config', 'user.name', 'Test'], dir);
  runGit(['config', 'commit.gpgsign', 'false'], dir);

  const baselineAbs = join(dir, BASELINE_RELPATH);
  await mkdir(dirname(baselineAbs), { recursive: true });
  await writeFile(baselineAbs, serializeClonesYaml(initialDoc), 'utf8');
  runGit(['add', BASELINE_RELPATH], dir);
  runGit(['commit', '-q', '-m', 'seed baseline'], dir);
  return {
    dir,
    baselineAbs,
    async cleanup(): Promise<void> {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

function runGit(args: readonly string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (status ${r.status}):\n${r.stderr}`,
    );
  }
}

interface SubprocessResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function runGate(
  fixture: GitFixture,
  extraArgs: readonly string[] = [],
): Promise<SubprocessResult> {
  return runScannerSubprocess(
    CLI_ENTRY,
    ['check-disposition-survivor', ...extraArgs],
    { cwd: fixture.dir },
  );
}

/** Overwrite the working-tree baseline. Does NOT commit; the gate's
 * job is to compare HEAD (committed) against working-tree (uncommitted). */
async function rewriteWorkingBaseline(
  fixture: GitFixture,
  doc: ClonesYaml,
): Promise<void> {
  await writeFile(fixture.baselineAbs, serializeClonesYaml(doc), 'utf8');
}

function group(args: {
  id: string;
  disposition: 'pending' | 'keep-with-reason' | 'ignore-with-justification';
  reason?: string | null;
  members?: readonly string[];
}) {
  return {
    id: args.id,
    lines: 8,
    members: [...(args.members ?? ['src/a.ts:1:8', 'src/b.ts:1:8'])].sort(),
    disposition: args.disposition,
    reason: args.reason ?? null,
    // Phase 11 Task 2 — derived status; install-seed provenance.
    status:
      args.disposition === 'pending'
        ? ('pending' as const)
        : args.disposition === 'keep-with-reason'
          ? ('blessed' as const)
          : ('ignore' as const),
    provenance: {
      source: 'install-seed' as const,
      authored_at: '1970-01-01T00:00:00Z',
    },
  };
}

function refactorGroup(args: {
  id: string;
  members?: readonly string[];
}) {
  return {
    id: args.id,
    lines: 8,
    members: [...(args.members ?? ['src/x.ts:1:8', 'src/y.ts:1:8'])].sort(),
    disposition: 'refactor' as const,
    reason: 'extract shared primitive',
    canonical_side: 'new',
    canonical_reason: 'consolidating duplicated parsing logic',
    new_shape_summary: 'shared parseFoo() in src/foo.ts',
    tests: ['npm test'],
    tests_proof: {
      sha: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      demonstration: 'tests pass against the new primitive',
    },
    // Phase 11 Task 2 — refactor → blessed; install-seed provenance.
    status: 'blessed' as const,
    provenance: {
      source: 'install-seed' as const,
      authored_at: '1970-01-01T00:00:00Z',
    },
  };
}

function doc(...clones: ClonesYaml['clones']): ClonesYaml {
  return { generated_at: '2026-05-25T00:00:00.000Z', clones };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('check-disposition-survivor — core scenarios', () => {
  it('no transitions → exit 0', async () => {
    const fixture = await makeGitFixture(
      'noop',
      doc(
        group({ id: '111111111111', disposition: 'keep-with-reason', reason: 'fixture' }),
        group({ id: '222222222222', disposition: 'pending' }),
      ),
    );
    try {
      // Working tree identical to HEAD.
      const result = await runGate(fixture);
      expect(result.code, `stderr=${result.stderr}`).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('keep-with-reason → pending: exit 1; output names the group + previous disposition', async () => {
    const fixture = await makeGitFixture(
      'keep-to-pending',
      doc(
        group({ id: 'aaaaaaaaaaaa', disposition: 'keep-with-reason', reason: 'intentional dup' }),
      ),
    );
    try {
      await rewriteWorkingBaseline(
        fixture,
        doc(group({ id: 'aaaaaaaaaaaa', disposition: 'pending' })),
      );
      const result = await runGate(fixture);
      expect(result.code, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
      expect(result.stderr).toContain('aaaaaaaaaaaa');
      expect(result.stderr).toContain('keep-with-reason');
      expect(result.stderr).toContain('pending');
      expect(result.stderr).toContain('intentional dup');
    } finally {
      await fixture.cleanup();
    }
  });

  it('multiple losses → exit 1; all listed', async () => {
    const fixture = await makeGitFixture(
      'multi-loss',
      doc(
        group({ id: 'bbbbbbbbbbb1', disposition: 'keep-with-reason', reason: 'r1' }),
        group({ id: 'bbbbbbbbbbb2', disposition: 'ignore-with-justification', reason: 'r2' }),
        group({ id: 'bbbbbbbbbbb3', disposition: 'pending' }),
      ),
    );
    try {
      await rewriteWorkingBaseline(
        fixture,
        doc(
          group({ id: 'bbbbbbbbbbb1', disposition: 'pending' }),
          group({ id: 'bbbbbbbbbbb2', disposition: 'pending' }),
          group({ id: 'bbbbbbbbbbb3', disposition: 'pending' }),
        ),
      );
      const result = await runGate(fixture);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('bbbbbbbbbbb1');
      expect(result.stderr).toContain('bbbbbbbbbbb2');
      // bbbbbbbbbbb3 was already pending; not a loss → must not appear.
      expect(result.stderr).not.toContain('bbbbbbbbbbb3');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--allow-disposition-loss accepts losses with a warning + exit 0', async () => {
    const fixture = await makeGitFixture(
      'allow-loss',
      doc(
        group({ id: 'cccccccccccc', disposition: 'keep-with-reason', reason: 'r' }),
      ),
    );
    try {
      await rewriteWorkingBaseline(
        fixture,
        doc(group({ id: 'cccccccccccc', disposition: 'pending' })),
      );
      const result = await runGate(fixture, ['--allow-disposition-loss']);
      expect(result.code, `stderr=${result.stderr}`).toBe(0);
      // The override path writes a warning to stderr naming the affected ids.
      expect(result.stderr).toContain('--allow-disposition-loss override');
      expect(result.stderr).toContain('cccccccccccc');
      expect(result.stderr).toContain('keep-with-reason');
    } finally {
      await fixture.cleanup();
    }
  });

  it('refactor → pending rejected (same shape as keep-with-reason)', async () => {
    const fixture = await makeGitFixture(
      'refactor-to-pending',
      doc(refactorGroup({ id: 'dddddddddddd' })),
    );
    try {
      await rewriteWorkingBaseline(
        fixture,
        doc(group({ id: 'dddddddddddd', disposition: 'pending' })),
      );
      const result = await runGate(fixture);
      expect(result.code, `stderr=${result.stderr}`).toBe(1);
      expect(result.stderr).toContain('dddddddddddd');
      expect(result.stderr).toContain('refactor');
    } finally {
      await fixture.cleanup();
    }
  });

  it('ignore-with-justification → pending rejected', async () => {
    const fixture = await makeGitFixture(
      'ignore-to-pending',
      doc(
        group({
          id: 'eeeeeeeeeeee',
          disposition: 'ignore-with-justification',
          reason: 'security-controlled audit log',
        }),
      ),
    );
    try {
      await rewriteWorkingBaseline(
        fixture,
        doc(group({ id: 'eeeeeeeeeeee', disposition: 'pending' })),
      );
      const result = await runGate(fixture);
      expect(result.code).toBe(1);
      expect(result.stderr).toContain('eeeeeeeeeeee');
      expect(result.stderr).toContain('ignore-with-justification');
    } finally {
      await fixture.cleanup();
    }
  });

  it('pending → pending (no-op) → exit 0', async () => {
    const fixture = await makeGitFixture(
      'pending-noop',
      doc(group({ id: 'ffffffffffff', disposition: 'pending' })),
    );
    try {
      // Working tree identical (still pending).
      const result = await runGate(fixture);
      expect(result.code, `stderr=${result.stderr}`).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('pending → keep-with-reason (operator improvement) → exit 0', async () => {
    const fixture = await makeGitFixture(
      'pending-to-keep',
      doc(group({ id: '111122223333', disposition: 'pending' })),
    );
    try {
      await rewriteWorkingBaseline(
        fixture,
        doc(
          group({
            id: '111122223333',
            disposition: 'keep-with-reason',
            reason: 'operator added a real disposition',
          }),
        ),
      );
      const result = await runGate(fixture);
      expect(result.code, `stderr=${result.stderr}`).toBe(0);
    } finally {
      await fixture.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// Gutted-stub teeth: confirm findDestructiveTransitions is load-bearing.
// ---------------------------------------------------------------------------

describe('check-disposition-survivor — gutted-stub teeth', () => {
  it('a stub findDestructiveTransitions that always returns [] would silently pass a real loss', () => {
    // Build the head + working docs the real scanner uses in scenario 2.
    const head = doc(
      group({ id: 'aaaaaaaaaaaa', disposition: 'keep-with-reason', reason: 'intentional dup' }),
    );
    const working = doc(group({ id: 'aaaaaaaaaaaa', disposition: 'pending' }));

    // Real comparator returns a non-empty list → gate must fail the commit.
    const real = findDestructiveTransitions(head, working);
    expect(
      real.length,
      'real comparator must detect a non-pending → pending transition',
    ).toBeGreaterThan(0);

    // Gutted-stub: a no-op implementation that always returns [].
    const guttedStub = (_h: ClonesYaml, _w: ClonesYaml) => [] as const;
    const stubResult = guttedStub(head, working);
    expect(
      stubResult.length,
      'gutted stub returns empty list — would silently pass the real loss',
    ).toBe(0);

    // Teeth assertion: the real comparator MUST disagree with the
    // gutted stub on this fixture. If they ever agree, the harness has
    // lost its ability to distinguish a real comparator from a no-op.
    expect(
      real.length === stubResult.length,
      'real comparator and gutted stub returned the same shape — harness has no teeth',
    ).toBe(false);
  });
});
