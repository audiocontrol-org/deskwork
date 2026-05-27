/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/dispose-clone.test.ts
 *
 * Tests for the dispose-clone wrapper. Asserts:
 *
 *   - parser accepts a positional <id> + --as <disposition>
 *   - parser rejects unknown --as values
 *   - --as refactor REFUSES without Step 0a/0b flags (lists every missing flag)
 *   - --as refactor STILL refuses when all flags present, with a clear
 *     redirect to manual editing of clones.yaml (refactor's 5 fields
 *     can't be expressed via batch-dispose)
 *   - --as keep-with-reason passes through to batch-dispose (with --reason
 *     forwarded), applying the disposition end-to-end against a fixture
 *   - --as ignore-with-justification passes through similarly
 *   - missing --reason for non-refactor dispositions exits 2
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, parseArgs } from '../../scope-discovery/dispose-clone.js';
import {
  type CloneGroup,
  serializeClonesYaml,
} from '../../scope-discovery/clones-yaml.js';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');
const R = 'modules/roland-sxx0-editor/src/';

function syntheticGroup(args: {
  id: string;
  members: readonly string[];
  disposition: 'pending' | 'keep-with-reason' | 'ignore-with-justification';
  reason?: string | null;
}): CloneGroup {
  return {
    id: args.id,
    lines: 8,
    members: [...args.members].sort(),
    disposition: args.disposition,
    reason: args.reason ?? null,
    // Phase 11 Task 2 — synthetic test groups carry install-seed
    // defaults so serialization roundtrips cleanly.
    status:
      args.disposition === 'pending'
        ? 'pending'
        : args.disposition === 'keep-with-reason'
          ? 'blessed'
          : 'ignore',
    provenance: {
      source: 'install-seed',
      authored_at: '1970-01-01T00:00:00Z',
    },
    // Phase 11 Task 10 — empty audit history (no auditor findings against fixture).
    auditHistory: [],
  };
}

interface Fixture {
  readonly dir: string;
  readonly clonesPath: string;
  cleanup(): Promise<void>;
}

async function makeFixture(label: string): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), `dispose-clone-${label}-`));
  return {
    dir,
    clonesPath: join(dir, 'clones.yaml'),
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

async function writeClonesYaml(path: string, clones: readonly CloneGroup[]): Promise<void> {
  const text = serializeClonesYaml({
    generated_at: '2026-05-22T00:00:00.000Z',
    clones: [...clones],
  });
  await writeFile(path, text, 'utf8');
}

describe('dispose-clone — parser', () => {
  it('accepts positional id + --as keep-with-reason', () => {
    const args = parseArgs(['aaaaaaaaaaa1', '--as', 'keep-with-reason', '--reason', 'x']);
    expect(args.id).toBe('aaaaaaaaaaa1');
    expect(args.disposition).toBe('keep-with-reason');
    expect(args.reason).toBe('x');
  });

  it('accepts --as ignore-with-justification', () => {
    const args = parseArgs(['id1', '--as', 'ignore-with-justification', '--reason', 'y']);
    expect(args.disposition).toBe('ignore-with-justification');
  });

  it('accepts --as refactor with all Step 0a/0b flags', () => {
    const args = parseArgs([
      'id1',
      '--as',
      'refactor',
      '--canonical-side',
      'existing',
      '--canonical-reason',
      'reuse the akai-side parser; the roland-side is the duplicate',
      '--tests',
      'modules/x/__tests__/parser.test.ts',
      '--tests-proof-sha',
      'abc1234',
      '--tests-proof-demonstration',
      'tests fail before extraction, pass after',
    ]);
    expect(args.disposition).toBe('refactor');
    expect(args.canonicalSide).toBe('existing');
  });

  it('rejects unknown --as value', () => {
    expect(() => parseArgs(['id1', '--as', 'pending', '--reason', 'x'])).toThrow(/--as must/);
  });

  it('rejects missing positional id', () => {
    expect(() => parseArgs(['--as', 'keep-with-reason', '--reason', 'x'])).toThrow(
      /positional <id>/,
    );
  });

  it('rejects missing --as', () => {
    expect(() => parseArgs(['id1', '--reason', 'x'])).toThrow(/--as <kind> is required/);
  });

  it('rejects double positional', () => {
    expect(() =>
      parseArgs(['id1', 'id2', '--as', 'keep-with-reason', '--reason', 'x']),
    ).toThrow(/positional id already set/);
  });

  it('rejects unknown flag', () => {
    expect(() => parseArgs(['id1', '--as', 'keep-with-reason', '--bogus'])).toThrow(
      /unknown flag/,
    );
  });
});

describe('dispose-clone — refactor gate', () => {
  it('refuses --as refactor without any Step 0a/0b flags; lists every missing flag', async () => {
    const result = await main(['id1', '--as', 'refactor']);
    expect(result.code).toBe(2);
  });

  it('refuses --as refactor with partial Step 0a/0b flags', async () => {
    const result = await main([
      'id1',
      '--as',
      'refactor',
      '--canonical-side',
      'existing',
      '--canonical-reason',
      'reason text',
    ]);
    expect(result.code).toBe(2);
  });

  it('refuses --as refactor even with ALL flags (redirect to manual editing)', async () => {
    const result = await main([
      'id1',
      '--as',
      'refactor',
      '--canonical-side',
      'existing',
      '--canonical-reason',
      'reason text',
      '--tests',
      'a/b.test.ts',
      '--tests-proof-sha',
      'abc1234',
      '--tests-proof-demonstration',
      'tests fail before, pass after',
    ]);
    expect(result.code).toBe(2);
  });

  it('--as refactor canonical-side=new requires --new-shape-summary', async () => {
    const result = await main([
      'id1',
      '--as',
      'refactor',
      '--canonical-side',
      'new',
      '--canonical-reason',
      'reason text',
      '--tests',
      'a/b.test.ts',
      '--tests-proof-sha',
      'abc1234',
      '--tests-proof-demonstration',
      'tests fail before, pass after',
    ]);
    expect(result.code).toBe(2);
  });
});

describe('dispose-clone — pass-through to batch-dispose', () => {
  it('applies keep-with-reason on a single pending id', async () => {
    const fixture = await makeFixture('keep');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({
          id: 'aaaaaaaaaaa1',
          members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`],
          disposition: 'pending',
        }),
      ];
      await writeClonesYaml(fixture.clonesPath, clones);
      const result = await main([
        'aaaaaaaaaaa1',
        '--as',
        'keep-with-reason',
        '--reason',
        'intentional parity across modules',
        '--clones',
        fixture.clonesPath,
      ]);
      expect(result.code).toBe(0);
      expect(result.batchResult?.verified).toBe(true);
      const after = await readFile(fixture.clonesPath, 'utf8');
      expect(after).toContain('disposition: keep-with-reason');
      expect(after).toContain('intentional parity across modules');
    } finally {
      await fixture.cleanup();
    }
  });

  it('applies ignore-with-justification on a single pending id', async () => {
    const fixture = await makeFixture('ignore');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({
          id: 'bbbbbbbbbbb1',
          members: [`${R}C.tsx:1:10`, `${R}D.tsx:1:10`],
          disposition: 'pending',
        }),
      ];
      await writeClonesYaml(fixture.clonesPath, clones);
      const result = await main([
        'bbbbbbbbbbb1',
        '--as',
        'ignore-with-justification',
        '--reason',
        'fixture boilerplate; not real duplication',
        '--clones',
        fixture.clonesPath,
      ]);
      expect(result.code).toBe(0);
      const after = await readFile(fixture.clonesPath, 'utf8');
      expect(after).toContain('disposition: ignore-with-justification');
    } finally {
      await fixture.cleanup();
    }
  });

  it('--dry-run does not write the file', async () => {
    const fixture = await makeFixture('dry');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({
          id: 'ccccccccccc1',
          members: [`${R}E.tsx:1:10`, `${R}F.tsx:1:10`],
          disposition: 'pending',
        }),
      ];
      await writeClonesYaml(fixture.clonesPath, clones);
      const before = await readFile(fixture.clonesPath, 'utf8');
      const result = await main([
        'ccccccccccc1',
        '--as',
        'keep-with-reason',
        '--reason',
        'dry-run reason',
        '--clones',
        fixture.clonesPath,
        '--dry-run',
      ]);
      expect(result.code).toBe(0);
      const after = await readFile(fixture.clonesPath, 'utf8');
      expect(after).toBe(before);
    } finally {
      await fixture.cleanup();
    }
  });

  it('non-refactor disposition without --reason exits 2', async () => {
    const result = await main(['id1', '--as', 'keep-with-reason']);
    expect(result.code).toBe(2);
  });

  it('unknown id exits 2 (delegated from batch-dispose)', async () => {
    const fixture = await makeFixture('unknown');
    try {
      const clones: CloneGroup[] = [
        syntheticGroup({
          id: 'realidaaaaa1',
          members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`],
          disposition: 'pending',
        }),
      ];
      await writeClonesYaml(fixture.clonesPath, clones);
      const result = await main([
        'unknownidxx1',
        '--as',
        'keep-with-reason',
        '--reason',
        'x',
        '--clones',
        fixture.clonesPath,
      ]);
      expect(result.code).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('dispose-clone — CLI surface', () => {
  it('--help exits 0 with usage banner', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['dispose-clone', '--help']);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('dispose-clone');
    expect(run.stdout).toContain('--as');
    expect(run.stdout).toContain('refactor');
  });

  it('refactor without flags exits 2 with actionable stderr', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, [
      'dispose-clone',
      'id1',
      '--as',
      'refactor',
    ]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('precondition flag');
    expect(run.stderr).toContain('--canonical-side');
  });
});
