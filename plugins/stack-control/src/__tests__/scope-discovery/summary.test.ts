/**
 * 010 — scope-summary tests (ported + adapted from dw-lifecycle).
 *
 * Covers the pure `computeSummary` math + `formatSummaryLine` shape (verbatim
 * port) and the programmatic `runSummary` entrypoint exercised through the
 * generalized per-codebase baseline resolution: the clones baseline resolves
 * under the enclosing installation, and `--clones` overrides relative to it.
 * On-disk fixtures only.
 *
 * Subprocess CLI surface (`--json` / `--verbose` via the dispatcher) is
 * intentionally not asserted here — that path depends on cli.ts wiring owned
 * by the integrator.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import {
  computeSummary,
  formatSummaryLine,
  runSummary,
  type SummaryCounts,
} from '../../scope-discovery/summary.js';
import {
  type CloneGroup,
  serializeClonesYaml,
} from '../../scope-discovery/clones-yaml.js';
import { globToRegex } from '../../scope-discovery/util/glob.js';

const SD_REL = '.stack-control/scope-discovery';
const ROLAND_GLOB = 'modules/roland-sxx0-editor/**';
const R = 'modules/roland-sxx0-editor/src/';
const A = 'modules/akai-s3k-editor/src/';

let fixtures: Fixture[] = [];
function fx(): Fixture {
  const f = makeFixture('sd-summary-');
  fixtures.push(f);
  return f;
}
afterEach(() => {
  for (const f of fixtures.splice(0)) f.cleanup();
});

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
    status:
      args.disposition === 'pending'
        ? 'pending'
        : args.disposition === 'keep-with-reason'
          ? 'blessed'
          : 'ignore',
    provenance: { source: 'install-seed', authored_at: '1970-01-01T00:00:00Z' },
    auditHistory: [],
  };
}

function mixedFixture(): CloneGroup[] {
  return [
    syntheticGroup({ id: 'mix000000001', members: [`${R}PatchEditor.tsx:1:10`, `${A}Other.tsx:1:10`], disposition: 'pending' }),
    syntheticGroup({ id: 'mix000000002', members: [`${R}A.tsx:1:10`, `${R}B.tsx:1:10`], disposition: 'pending' }),
    syntheticGroup({ id: 'mix000000003', members: [`${A}Foo.tsx:1:10`, `${A}Bar.tsx:1:10`], disposition: 'pending' }),
    syntheticGroup({ id: 'mix000000004', members: [`${R}C.tsx:1:10`, `${A}D.tsx:1:10`], disposition: 'keep-with-reason', reason: 'cross-editor' }),
    syntheticGroup({ id: 'mix000000005', members: [`${R}E.tsx:1:10`, `${R}F.tsx:1:10`], disposition: 'ignore-with-justification', reason: 'boilerplate' }),
    syntheticGroup({ id: 'mix000000006', members: [`${A}G.tsx:1:10`, `${A}H.tsx:1:10`], disposition: 'keep-with-reason', reason: 'akai-only' }),
  ];
}

const MIXED_EXPECTED: SummaryCounts = {
  total: 6,
  pendingTouching: 2,
  pendingIntra: 1,
  dispositionedTouching: 2,
};

function expectCounts(actual: SummaryCounts, expected: SummaryCounts): void {
  expect(actual.total).toBe(expected.total);
  expect(actual.pendingTouching).toBe(expected.pendingTouching);
  expect(actual.pendingIntra).toBe(expected.pendingIntra);
  expect(actual.dispositionedTouching).toBe(expected.dispositionedTouching);
}

describe('scope-summary — pure math', () => {
  it('empty clones — every count zero', () => {
    const result = computeSummary([], globToRegex('modules/**/*.tsx'));
    expectCounts(result.counts, { total: 0, pendingTouching: 0, pendingIntra: 0, dispositionedTouching: 0 });
  });

  it('pending-touching (mixed surfaces) — 1/2 members match', () => {
    const result = computeSummary(
      [syntheticGroup({ id: 'aaa000000002', members: [`${R}PatchEditor.tsx:10:20`, `${A}KeygroupEditor.tsx:30:40`], disposition: 'pending' })],
      globToRegex(ROLAND_GLOB),
    );
    expectCounts(result.counts, { total: 1, pendingTouching: 1, pendingIntra: 0, dispositionedTouching: 0 });
  });

  it('pending-intra — 2/2 members match', () => {
    const result = computeSummary(
      [syntheticGroup({ id: 'aaa000000003', members: [`${R}PatchEditor.tsx:10:20`, `${R}ToneEditor.tsx:30:40`], disposition: 'pending' })],
      globToRegex(ROLAND_GLOB),
    );
    expectCounts(result.counts, { total: 1, pendingTouching: 1, pendingIntra: 1, dispositionedTouching: 0 });
  });

  it('dispositioned-touching — non-pending lands in the right bucket', () => {
    const result = computeSummary(
      [syntheticGroup({ id: 'aaa000000004', members: [`${R}PatchEditor.tsx:10:20`, `${A}KeygroupEditor.tsx:30:40`], disposition: 'keep-with-reason', reason: 'x' })],
      globToRegex(ROLAND_GLOB),
    );
    expectCounts(result.counts, { total: 1, pendingTouching: 0, pendingIntra: 0, dispositionedTouching: 1 });
  });

  it('mixed fixture — every bucket exercised', () => {
    expectCounts(computeSummary(mixedFixture(), globToRegex(ROLAND_GLOB)).counts, MIXED_EXPECTED);
  });

  it('formatSummaryLine emits the exact pipe-separated layout', () => {
    expect(formatSummaryLine(MIXED_EXPECTED)).toBe(
      'total: 6 | pending-touching: 2 | pending-intra: 1 | dispositioned-touching: 2',
    );
  });
});

describe('scope-summary — programmatic runSummary (per-codebase baseline)', () => {
  it('resolves the per-codebase default baseline under the installation', async () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(
      `${SD_REL}/clones.yaml`,
      serializeClonesYaml({ generated_at: '2026-05-22T00:00:00.000Z', clones: mixedFixture() }),
    );
    const result = await runSummary(['--surface', ROLAND_GLOB, '--at', root]);
    expect(result.code).toBe(0);
    expect(result.resolvedClonesPath).toBe(join(root, SD_REL, 'clones.yaml'));
    if (result.summary !== undefined) expectCounts(result.summary.counts, MIXED_EXPECTED);
  });

  it('--clones overrides relative to the installation root', async () => {
    const f = fx();
    const root = f.install('.');
    f.writeFile(
      'custom/elsewhere.yaml',
      serializeClonesYaml({ generated_at: '2026-05-22T00:00:00.000Z', clones: mixedFixture() }),
    );
    const result = await runSummary([
      '--surface',
      ROLAND_GLOB,
      '--at',
      root,
      '--clones',
      'custom/elsewhere.yaml',
    ]);
    expect(result.code).toBe(0);
    expect(result.resolvedClonesPath).toBe(join(root, 'custom', 'elsewhere.yaml'));
    if (result.summary !== undefined) expectCounts(result.summary.counts, MIXED_EXPECTED);
  });

  it('returns code 2 when --surface is missing', async () => {
    const result = await runSummary([]);
    expect(result.code).toBe(2);
  });

  it('returns code 2 when the resolved clones file is unreadable', async () => {
    const f = fx();
    const root = f.install('.');
    const result = await runSummary(['--surface', ROLAND_GLOB, '--at', root]);
    expect(result.code).toBe(2);
  });
});
