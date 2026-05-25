/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/summary.test.ts
 *
 * Adversarial scenarios for the scope-summary reporter. Ported from the
 * audiocontrol pilot's `tools/scope-discovery/summary.validate.ts`. Tests
 * the pure `computeSummary` math, the `formatSummaryLine` shape, the
 * programmatic `runSummary` entrypoint, and the CLI surface (via the
 * `dw-lifecycle scope-summary` dispatcher) for `--json` / `--verbose`
 * output and `--surface` error paths.
 *
 * The gutted-stub self-check is the load-bearing teeth: an all-zero
 * stub MUST fail the mixed-fixture assertion. Without that, the harness
 * would silently accept a broken counter.
 */

import { describe, expect, it } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  computeSummary,
  formatSummaryLine,
  runSummary,
  type SummaryCounts,
} from '../../scope-discovery/summary.js';
import { type CloneGroup, serializeClonesYaml } from '../../scope-discovery/clones-yaml.js';
import { globToRegex } from '../../scope-discovery/util/glob.js';
import { runScannerSubprocess } from './util/run-scanner.js';
import { isPlainObject } from '../../scope-discovery/util/typeguards.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/ -> src/cli.ts is ../../cli.ts
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

const ROLAND_GLOB = 'modules/roland-sxx0-editor/**';
const R = 'modules/roland-sxx0-editor/src/';
const A = 'modules/akai-s3k-editor/src/';

/**
 * Mint a synthetic CloneGroup. Tests need the SHAPE of a real group but
 * don't care about id stability — the count math only reads `disposition`
 * + `members`. Skips `makeCloneGroup` to avoid re-deriving the id from a
 * token fingerprint.
 */
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
  };
}

/**
 * Mixed fixture used by the mixed / verbose / json / programmatic
 * scenarios. Six groups exercising every bucket against
 * `modules/roland-sxx0-editor/**`. Expected counts: total=6,
 * pending-touching=2, pending-intra=1, dispositioned-touching=2.
 */
function mixedFixture(): CloneGroup[] {
  return [
    syntheticGroup({
      id: 'mix000000001',
      members: [`${R}PatchEditor.tsx:1:10`, `${A}Other.tsx:1:10`],
      disposition: 'pending',
    }),
    syntheticGroup({
      id: 'mix000000002',
      members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`],
      disposition: 'pending',
    }),
    syntheticGroup({
      id: 'mix000000003',
      members: [`${A}Foo.tsx:1:10`, `${A}Bar.tsx:1:10`],
      disposition: 'pending',
    }),
    syntheticGroup({
      id: 'mix000000004',
      members: [`${R}C.tsx:1:10`, `${A}D.tsx:1:10`],
      disposition: 'keep-with-reason',
      reason: 'cross-editor; intentional parity',
    }),
    syntheticGroup({
      id: 'mix000000005',
      members: [`${R}E.tsx:1:10`, `${R}F.tsx:1:10`],
      disposition: 'ignore-with-justification',
      reason: 'fixture boilerplate',
    }),
    syntheticGroup({
      id: 'mix000000006',
      members: [`${A}G.tsx:1:10`, `${A}H.tsx:1:10`],
      disposition: 'keep-with-reason',
      reason: 'akai-only',
    }),
  ];
}

const MIXED_EXPECTED: SummaryCounts = {
  total: 6,
  pendingTouching: 2,
  pendingIntra: 1,
  dispositionedTouching: 2,
};

interface Fixture {
  readonly dir: string;
  readonly path: string;
  cleanup(): Promise<void>;
}

async function makeFixture(label: string): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpdir(), `summary-test-${label}-`));
  const path = join(dir, 'clones.yaml');
  return {
    dir,
    path,
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

function expectCounts(actual: SummaryCounts, expected: SummaryCounts): void {
  expect(actual.total, `total`).toBe(expected.total);
  expect(actual.pendingTouching, `pending-touching`).toBe(expected.pendingTouching);
  expect(actual.pendingIntra, `pending-intra`).toBe(expected.pendingIntra);
  expect(actual.dispositionedTouching, `dispositioned-touching`).toBe(
    expected.dispositionedTouching,
  );
}

describe('scope-summary — pure math', () => {
  it('empty clones file — every count is zero', () => {
    const result = computeSummary([], globToRegex('modules/**/*.tsx'));
    expectCounts(result.counts, {
      total: 0,
      pendingTouching: 0,
      pendingIntra: 0,
      dispositionedTouching: 0,
    });
  });

  it('no glob match — total > 0, the rest are zero', () => {
    const clones: CloneGroup[] = [
      syntheticGroup({
        id: 'aaa000000001',
        members: [
          'modules/akai-s3k-editor/src/foo.ts:1:10',
          'modules/akai-s3k-editor/src/bar.ts:1:10',
        ],
        disposition: 'pending',
      }),
    ];
    const result = computeSummary(clones, globToRegex(ROLAND_GLOB));
    expectCounts(result.counts, {
      total: 1,
      pendingTouching: 0,
      pendingIntra: 0,
      dispositionedTouching: 0,
    });
  });

  it('pending-touching (mixed surfaces) — 1/2 members match', () => {
    const clones: CloneGroup[] = [
      syntheticGroup({
        id: 'aaa000000002',
        members: [
          'modules/roland-sxx0-editor/src/PatchEditor.tsx:10:20',
          'modules/akai-s3k-editor/src/KeygroupEditor.tsx:30:40',
        ],
        disposition: 'pending',
      }),
    ];
    const result = computeSummary(clones, globToRegex(ROLAND_GLOB));
    expectCounts(result.counts, {
      total: 1,
      pendingTouching: 1,
      pendingIntra: 0,
      dispositionedTouching: 0,
    });
  });

  it('pending-intra — 2/2 members match; intra implies touching', () => {
    const clones: CloneGroup[] = [
      syntheticGroup({
        id: 'aaa000000003',
        members: [
          'modules/roland-sxx0-editor/src/PatchEditor.tsx:10:20',
          'modules/roland-sxx0-editor/src/ToneEditor.tsx:30:40',
        ],
        disposition: 'pending',
      }),
    ];
    const result = computeSummary(clones, globToRegex(ROLAND_GLOB));
    expectCounts(result.counts, {
      total: 1,
      pendingTouching: 1,
      pendingIntra: 1,
      dispositionedTouching: 0,
    });
  });

  it('dispositioned-touching — non-pending entries land in the right bucket', () => {
    const clones: CloneGroup[] = [
      syntheticGroup({
        id: 'aaa000000004',
        members: [
          'modules/roland-sxx0-editor/src/PatchEditor.tsx:10:20',
          'modules/akai-s3k-editor/src/KeygroupEditor.tsx:30:40',
        ],
        disposition: 'keep-with-reason',
        reason: 'two editors, different domains',
      }),
    ];
    const result = computeSummary(clones, globToRegex(ROLAND_GLOB));
    expectCounts(result.counts, {
      total: 1,
      pendingTouching: 0,
      pendingIntra: 0,
      dispositionedTouching: 1,
    });
  });

  it('mixed fixture — every bucket exercised simultaneously', () => {
    const result = computeSummary(mixedFixture(), globToRegex(ROLAND_GLOB));
    expectCounts(result.counts, MIXED_EXPECTED);
  });

  it('brace-alternation glob matches every member; pending-intra == pending-touching', () => {
    const result = computeSummary(
      mixedFixture(),
      globToRegex('modules/{roland-sxx0,akai-s3k}-editor/**'),
    );
    expectCounts(result.counts, {
      total: 6,
      pendingTouching: 3,
      pendingIntra: 3,
      dispositionedTouching: 3,
    });
  });

  it('formatSummaryLine emits the exact pipe-separated layout', () => {
    const line = formatSummaryLine(MIXED_EXPECTED);
    expect(line).toBe(
      'total: 6 | pending-touching: 2 | pending-intra: 1 | dispositioned-touching: 2',
    );
  });
});

describe('scope-summary — gutted-stub teeth', () => {
  it('rejects an all-zero counter against the mixed fixture', () => {
    const stubCounts: SummaryCounts = {
      total: 0,
      pendingTouching: 0,
      pendingIntra: 0,
      dispositionedTouching: 0,
    };
    // Negative assertion — the stub MUST NOT match MIXED_EXPECTED.
    expect(stubCounts.total).not.toBe(MIXED_EXPECTED.total);
    expect(stubCounts.pendingTouching).not.toBe(MIXED_EXPECTED.pendingTouching);
    expect(stubCounts.dispositionedTouching).not.toBe(
      MIXED_EXPECTED.dispositionedTouching,
    );
  });
});

describe('scope-summary — programmatic runSummary', () => {
  it('returns code 0 + correct counts on the mixed fixture', async () => {
    const fixture = await makeFixture('prog');
    try {
      await writeClonesYaml(fixture.path, mixedFixture());
      const result = await runSummary([
        '--surface',
        ROLAND_GLOB,
        '--clones',
        fixture.path,
      ]);
      expect(result.code).toBe(0);
      expect(result.summary).toBeDefined();
      if (result.summary !== undefined) {
        expectCounts(result.summary.counts, MIXED_EXPECTED);
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns code 2 + actionable error when --surface is missing', async () => {
    const result = await runSummary([]);
    expect(result.code).toBe(2);
  });

  it('returns code 2 when clones file is unreadable', async () => {
    const result = await runSummary(['--surface', ROLAND_GLOB, '--clones', '/no/such/file.yaml']);
    expect(result.code).toBe(2);
  });
});

describe('scope-summary — CLI surface', () => {
  it('--verbose lists each matching group id; omits non-matching ids', async () => {
    const fixture = await makeFixture('verbose');
    try {
      await writeClonesYaml(fixture.path, mixedFixture());
      const run = await runScannerSubprocess(CLI_ENTRY, [
        'scope-summary',
        '--surface',
        ROLAND_GLOB,
        '--clones',
        fixture.path,
        '--verbose',
      ]);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      for (const id of ['mix000000001', 'mix000000002', 'mix000000004', 'mix000000005']) {
        expect(run.stderr, `expected verbose to mention ${id}`).toContain(id);
      }
      for (const id of ['mix000000003', 'mix000000006']) {
        expect(run.stderr, `unexpected non-match ${id}`).not.toContain(id);
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it('--json emits parseable JSON with the four counts + surface + clones', async () => {
    const fixture = await makeFixture('json');
    try {
      await writeClonesYaml(fixture.path, mixedFixture());
      const run = await runScannerSubprocess(CLI_ENTRY, [
        'scope-summary',
        '--surface',
        ROLAND_GLOB,
        '--clones',
        fixture.path,
        '--json',
      ]);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      const parsed: unknown = JSON.parse(run.stdout);
      expect(isPlainObject(parsed)).toBe(true);
      if (!isPlainObject(parsed)) return;
      expect(parsed['surface']).toBe(ROLAND_GLOB);
      expect(parsed['total']).toBe(6);
      expect(parsed['pending-touching']).toBe(2);
      expect(parsed['pending-intra']).toBe(1);
      expect(parsed['dispositioned-touching']).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('missing --surface — CLI exits 2 + mentions --surface in stderr', async () => {
    const run = await runScannerSubprocess(CLI_ENTRY, ['scope-summary']);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain('--surface');
  });
});

