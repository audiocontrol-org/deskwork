/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/batch-dispose.test.ts
 *
 * Adversarial scenarios for `batch-dispose`. Ported from the audiocontrol
 * pilot's `batch-dispose.validate.ts`. Plants synthetic clones.yaml
 * fixtures, drives the CLI both programmatically (via `runBatchDispose`)
 * and as a subprocess (via the `dw-lifecycle batch-dispose` dispatcher),
 * and proves:
 *
 *   - dispositions land on the targeted ids;
 *   - already-disposed ids are skipped (with the right stdout shape under
 *     --show-existing);
 *   - unknown ids fail HARD with no writes AND cite the refresh-baseline
 *     prereq (TF-014 amendment per AUDIT-20260525-07);
 *   - empty/invalid/refactor disposition error actionably;
 *   - verify-after-write catches a forged write;
 *   - --dry-run leaves the file unchanged;
 *   - member ordering is preserved across writes;
 *   - the gutted-stub self-check rejects a no-op writer.
 *
 * Fixture helpers live in `batch-dispose.fixtures.ts`.
 */

import { readFile } from 'node:fs/promises';
import { describe, it, expect } from 'vitest';
import { runBatchDispose } from '../../scope-discovery/batch-dispose.js';
import { type CloneGroup } from '../../scope-discovery/clones-yaml.js';
import { runScannerSubprocess } from './util/run-scanner.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLAND_SRC,
  makeCapturedIO,
  makeFixture,
  makeForgedWriteIO,
  makeGuttedWriterIO,
  syntheticGroup,
  writeClonesYaml,
} from './batch-dispose.fixtures.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/ -> src/cli.ts is ../../cli.ts
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');
const R = ROLAND_SRC;

describe('batch-dispose — core scenarios', () => {
  it('applies disposition to 3 pending ids; verify-after-write confirms', async () => {
    const fixture = await makeFixture('apply3');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({ id: 'aaaaaaaaaaa1', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'pending' }),
        syntheticGroup({ id: 'aaaaaaaaaaa2', members: [`${R}C.tsx:1:10`, `${R}D.tsx:1:10`], disposition: 'pending' }),
        syntheticGroup({ id: 'aaaaaaaaaaa3', members: [`${R}E.tsx:1:10`, `${R}F.tsx:1:10`], disposition: 'pending' }),
      ];
      await writeClonesYaml(fixture.path, clones);
      const capt = makeCapturedIO();
      const result = await runBatchDispose(
        [
          '--ids', 'aaaaaaaaaaa1,aaaaaaaaaaa2,aaaaaaaaaaa3',
          '--disposition', 'keep-with-reason',
          '--reason', 'fixture boilerplate; intentional',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      expect(result.code, `stderr=${capt.stderr()}`).toBe(0);
      expect(result.verified).toBe(true);
      expect(result.applied.length).toBe(3);
      const after = await readFile(fixture.path, 'utf8');
      const keepCount = (after.match(/disposition: keep-with-reason/g) ?? []).length;
      expect(keepCount).toBe(3);
      expect(after).toContain('fixture boilerplate; intentional');
    } finally {
      await fixture.cleanup();
    }
  });

  it('already-disposed entry skipped (default) without leaking existing reason', async () => {
    const fixture = await makeFixture('skipdefault');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({ id: 'bbbbbbbbbbb1', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'keep-with-reason', reason: 'existing reason X' }),
        syntheticGroup({ id: 'bbbbbbbbbbb2', members: [`${R}C.tsx:1:10`, `${R}D.tsx:1:10`], disposition: 'pending' }),
        syntheticGroup({ id: 'bbbbbbbbbbb3', members: [`${R}E.tsx:1:10`, `${R}F.tsx:1:10`], disposition: 'pending' }),
      ];
      await writeClonesYaml(fixture.path, clones);
      const capt = makeCapturedIO();
      const result = await runBatchDispose(
        [
          '--ids', 'bbbbbbbbbbb1,bbbbbbbbbbb2,bbbbbbbbbbb3',
          '--disposition', 'ignore-with-justification',
          '--reason', 'new reason Y',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      expect(result.code).toBe(0);
      expect(result.applied.length).toBe(2);
      expect(result.skipped.length).toBe(1);
      const out = capt.stdout();
      expect(out).toContain('bbbbbbbbbbb1: skipped (already keep-with-reason');
      expect(out).not.toContain('existing reason X');
      const after = await readFile(fixture.path, 'utf8');
      expect(after).toContain('existing reason X');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--show-existing surfaces existing disposition + reason', async () => {
    const fixture = await makeFixture('showexisting');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({ id: 'ccccccccccc1', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'keep-with-reason', reason: 'PRIOR-REASON' }),
      ];
      await writeClonesYaml(fixture.path, clones);
      const capt = makeCapturedIO();
      const result = await runBatchDispose(
        [
          '--ids', 'ccccccccccc1',
          '--disposition', 'ignore-with-justification',
          '--reason', 'unused',
          '--show-existing',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      expect(result.code, `stderr=${capt.stderr()}`).toBe(0);
      expect(capt.stdout()).toContain('ccccccccccc1: already disposed as keep-with-reason: PRIOR-REASON');
    } finally {
      await fixture.cleanup();
    }
  });

  it('unknown id fails HARD with exit 2 + no writes + cites refresh-baseline prereq', async () => {
    const fixture = await makeFixture('unknown');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({ id: 'ddddddddddd1', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'pending' }),
      ];
      await writeClonesYaml(fixture.path, clones);
      const beforeText = await readFile(fixture.path, 'utf8');
      const capt = makeCapturedIO();
      const result = await runBatchDispose(
        [
          '--ids', 'ddddddddddd1,UNKNOWN-ID-XYZ',
          '--disposition', 'keep-with-reason',
          '--reason', 'r',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      expect(result.code).toBe(2);
      const stderr = capt.stderr();
      expect(stderr).toContain('UNKNOWN-ID-XYZ');
      // TF-014 (AUDIT-20260525-07): unknown-id error MUST cite the
      // refresh-baseline prereq so the operator's recovery path is
      // discoverable.
      expect(stderr).toContain('dw-lifecycle check-clones --refresh-baseline');
      expect(stderr).toContain('pending');
      // File must not be modified despite the unknown id.
      const afterText = await readFile(fixture.path, 'utf8');
      expect(afterText).toBe(beforeText);
    } finally {
      await fixture.cleanup();
    }
  });

  it('empty --ids list fails with exit 2 + actionable error', async () => {
    const capt = makeCapturedIO();
    const result = await runBatchDispose(
      ['--ids', ' , , ', '--disposition', 'keep-with-reason', '--reason', 'r'],
      capt.io,
    );
    expect(result.code).toBe(2);
    expect(capt.stderr()).toContain('--ids must contain at least one id');
  });

  it('invalid disposition lists the valid options', async () => {
    const capt = makeCapturedIO();
    const result = await runBatchDispose(
      ['--ids', 'x', '--disposition', 'bogus', '--reason', 'r'],
      capt.io,
    );
    expect(result.code).toBe(2);
    const stderr = capt.stderr();
    for (const expected of ['pending', 'keep-with-reason', 'ignore-with-justification']) {
      expect(stderr).toContain(expected);
    }
  });

  it('refactor disposition rejected with redirect to manual editing', async () => {
    const capt = makeCapturedIO();
    const result = await runBatchDispose(
      ['--ids', 'x', '--disposition', 'refactor', '--reason', 'r'],
      capt.io,
    );
    expect(result.code).toBe(2);
    const stderr = capt.stderr();
    for (const f of [
      'manual editing',
      'check-refactor-preconditions',
      'canonical_side',
      'tests',
      'tests_proof',
    ]) {
      expect(stderr).toContain(f);
    }
  });

  it('verify-after-write catches a forged write (exit 1, verified=false)', async () => {
    const fixture = await makeFixture('forged');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({ id: 'eeeeeeeeeee1', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'pending' }),
      ];
      await writeClonesYaml(fixture.path, clones);
      const capt = makeForgedWriteIO({
        findReason: 'forged-write-target',
        replaceReason: 'SOMEONE-ELSE-WROTE-THIS',
      });
      const result = await runBatchDispose(
        [
          '--ids', 'eeeeeeeeeee1',
          '--disposition', 'keep-with-reason',
          '--reason', 'forged-write-target',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      expect(result.code).toBe(1);
      expect(result.verified).toBe(false);
      expect(capt.stderr()).toContain('verify-after-write detected');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--dry-run leaves file unchanged + reports N/A verified', async () => {
    const fixture = await makeFixture('dryrun');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({ id: 'fffffffffff1', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'pending' }),
      ];
      await writeClonesYaml(fixture.path, clones);
      const beforeText = await readFile(fixture.path, 'utf8');
      const capt = makeCapturedIO();
      const result = await runBatchDispose(
        [
          '--ids', 'fffffffffff1',
          '--disposition', 'keep-with-reason',
          '--reason', 'r',
          '--dry-run',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      expect(result.code).toBe(0);
      const afterText = await readFile(fixture.path, 'utf8');
      expect(afterText).toBe(beforeText);
      expect(capt.stdout()).toContain('dry-run: would apply');
      expect(capt.stdout()).toContain('N/A (dry-run)');
    } finally {
      await fixture.cleanup();
    }
  });

  it('partial batch (5 of 10 pending) leaves the other 5 pending', async () => {
    const fixture = await makeFixture('partial');
    try {
      const clones: CloneGroup[] = [];
      for (let i = 0; i < 10; i += 1) {
        const idx = i.toString().padStart(2, '0');
        clones.push(
          syntheticGroup({
            id: `gggggggggg${idx}`,
            members: [`${R}A${idx}.tsx:1:10`, `${R}B${idx}.tsx:1:10`],
            disposition: 'pending',
          }),
        );
      }
      await writeClonesYaml(fixture.path, clones);
      const targets = [
        'gggggggggg00',
        'gggggggggg02',
        'gggggggggg04',
        'gggggggggg06',
        'gggggggggg08',
      ];
      const capt = makeCapturedIO();
      const result = await runBatchDispose(
        [
          '--ids', targets.join(','),
          '--disposition', 'keep-with-reason',
          '--reason', 'even-indexed; intentional',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      expect(result.code).toBe(0);
      expect(result.applied.length).toBe(5);
      const after = await readFile(fixture.path, 'utf8');
      const keepCount = (after.match(/disposition: keep-with-reason/g) ?? []).length;
      const pendingCount = (after.match(/disposition: pending/g) ?? []).length;
      expect(keepCount).toBe(5);
      expect(pendingCount).toBe(5);
    } finally {
      await fixture.cleanup();
    }
  });

  it('member ordering preserved through write', async () => {
    const fixture = await makeFixture('ordering');
    try {
      // Bypass syntheticGroup's sort so we control the on-write order.
      const clones: CloneGroup[] = [
        {
          id: 'hhhhhhhhhhh1',
          lines: 8,
          members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`, `${R}C.tsx:1:10`],
          disposition: 'pending',
          reason: null,
          // Phase 11 Task 2 — pending → status: pending; install-seed
          // provenance so the synthesized-suppression branch of
          // serializeClonesYaml fires (no Loop fields written).
          status: 'pending',
          provenance: {
            source: 'install-seed',
            authored_at: '1970-01-01T00:00:00Z',
          },
        },
      ];
      await writeClonesYaml(fixture.path, clones);
      const capt = makeCapturedIO();
      const result = await runBatchDispose(
        [
          '--ids', 'hhhhhhhhhhh1',
          '--disposition', 'keep-with-reason',
          '--reason', 'r',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      expect(result.code, `stderr=${capt.stderr()}`).toBe(0);
      const after = await readFile(fixture.path, 'utf8');
      const aIdx = after.indexOf(`${R}A.tsx:1:10`);
      const bIdx = after.indexOf(`${R}B.tsx:1:10`);
      const cIdx = after.indexOf(`${R}C.tsx:1:10`);
      expect(aIdx).toBeGreaterThanOrEqual(0);
      expect(bIdx).toBeGreaterThan(aIdx);
      expect(cIdx).toBeGreaterThan(bIdx);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('batch-dispose — gutted-stub self-check', () => {
  it('rejects a gutted writer (no-op writer must fail verify-after-write)', async () => {
    const fixture = await makeFixture('gutted');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({ id: 'iiiiiiiiiii1', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'pending' }),
      ];
      await writeClonesYaml(fixture.path, clones);
      const capt = makeGuttedWriterIO();
      const result = await runBatchDispose(
        [
          '--ids', 'iiiiiiiiiii1',
          '--disposition', 'keep-with-reason',
          '--reason', 'r',
          '--clones', fixture.path,
        ],
        capt.io,
      );
      // A no-op writer must NOT report success + verified=true.
      expect(result.code === 0 && result.verified === true).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('batch-dispose — subprocess (cli dispatcher)', () => {
  it('boots via `dw-lifecycle batch-dispose` and reports Applied:1 + Verified:Y', async () => {
    const fixture = await makeFixture('subproc');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({ id: 'jjjjjjjjjjj1', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'pending' }),
      ];
      await writeClonesYaml(fixture.path, clones);
      const run = await runScannerSubprocess(
        CLI_ENTRY,
        [
          'batch-dispose',
          '--ids', 'jjjjjjjjjjj1',
          '--disposition', 'keep-with-reason',
          '--reason', 'subprocess smoke',
          '--clones', fixture.path,
        ],
      );
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(run.stdout).toContain('Applied: 1');
      expect(run.stdout).toContain('Verified: Y');
    } finally {
      await fixture.cleanup();
    }
  });
});
