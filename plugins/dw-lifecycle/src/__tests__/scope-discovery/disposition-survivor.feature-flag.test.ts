/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/disposition-survivor.feature-flag.test.ts
 *
 * Phase 18 Task 7 — TDD-first tests for `check-disposition-survivor
 * --feature <slug>`.
 *
 * Refs #417.
 *
 * Cases:
 *   (a)+(c) `--feature hygiene` narrows the survivor check to clone
 *           groups whose ≥1 member is in feature-scope. The
 *           out-of-scope group's non-pending → pending transition is
 *           silently dropped.
 *   (b)     No `--feature` flag preserves baseline behavior (every
 *           non-pending → pending transition reported).
 *   (d)     `--feature unknown-slug` → exits 2 with FeatureNotFoundError.
 */

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  findDestructiveTransitions,
} from '../../scope-discovery/check-disposition-survivor.js';
import {
  type ClonesYaml,
  serializeClonesYaml,
} from '../../scope-discovery/clones-yaml.js';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

const BASELINE_RELPATH = '.dw-lifecycle/scope-discovery/clones.yaml';

function runGit(args: readonly string[], cwd: string): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (status ${r.status}):\n${r.stderr}`,
    );
  }
}

const ID_IN = 'aaaa1111aaaa';
const ID_OUT = 'bbbb2222bbbb';

function keepGroup(args: {
  id: string;
  member: string;
  disposition: 'pending' | 'keep-with-reason';
}) {
  return {
    id: args.id,
    lines: 8,
    members: [args.member + ':1:8', args.member.replace('.ts', '-b.ts') + ':1:8'].sort(),
    disposition: args.disposition,
    reason: args.disposition === 'pending' ? null : 'preserve',
    status:
      args.disposition === 'pending' ? ('pending' as const) : ('blessed' as const),
    provenance: {
      source: 'install-seed' as const,
      authored_at: '1970-01-01T00:00:00Z',
    },
    auditHistory: [] as readonly string[],
  };
}

function doc(...clones: ClonesYaml['clones']): ClonesYaml {
  return { generated_at: '2026-06-04T00:00:00Z', clones };
}

async function plantManifest(
  fixtureDir: string,
  inScopeFiles: readonly string[],
): Promise<void> {
  const featureDir = join(fixtureDir, 'docs', '1.0', '001-IN-PROGRESS', 'hygiene');
  await mkdir(featureDir, { recursive: true });
  const entries = inScopeFiles
    .map(
      (file, idx) =>
        `    - id: scope-${idx}\n      file: ${file}\n      shape: holdout\n      replacement: fix\n      evidence:\n        registry_path: x.yaml\n        registry_id: scope-${idx}\n      status_provenance:\n        source_status: blessed\n        provenance_source: install-seed`,
    )
    .join('\n');
  const body = [
    'kind: code',
    'feature_slug: hygiene',
    'generated_by: curated',
    'generated_at: 2026-06-04T00:00:00.000Z',
    'scenarios:',
    '  - id: default',
    '    label: Default',
    '    description: stub',
    'reference_docs:',
    '  - path: docs/1.0/001-IN-PROGRESS/hygiene/prd.md',
    '    role: prd',
    '    summary: PRD',
    'discovery_themes:',
    '  - hygiene',
    'modules: []',
    'regime_holdouts:',
    '  anti_patterns:',
    entries,
    '  adopter_manifests: []',
    '  module_symmetry: []',
    '  deprecations: []',
    '  meta:',
    `    total: ${inScopeFiles.length}`,
    '    by_source:',
    `      anti_patterns: ${inScopeFiles.length}`,
    '      adopter_manifests: 0',
    '      module_symmetry: 0',
    '      deprecations: 0',
    '',
  ].join('\n');
  await writeFile(join(featureDir, 'scope-manifest.yaml'), body, 'utf8');
}

describe('check-disposition-survivor --feature <slug>', () => {
  it('(b) findDestructiveTransitions without scope reports BOTH transitions', () => {
    const head = doc(
      keepGroup({ id: ID_IN, member: 'in-scope/x.ts', disposition: 'keep-with-reason' }),
      keepGroup({ id: ID_OUT, member: 'out-of-scope/y.ts', disposition: 'keep-with-reason' }),
    );
    const working = doc(
      keepGroup({ id: ID_IN, member: 'in-scope/x.ts', disposition: 'pending' }),
      keepGroup({ id: ID_OUT, member: 'out-of-scope/y.ts', disposition: 'pending' }),
    );
    const transitions = findDestructiveTransitions(head, working);
    expect(transitions.map((t) => t.id).sort()).toEqual([ID_IN, ID_OUT].sort());
  });

  it('(a)+(c) findDestructiveTransitions with scope returns only in-scope transitions', () => {
    const head = doc(
      keepGroup({ id: ID_IN, member: 'in-scope/x.ts', disposition: 'keep-with-reason' }),
      keepGroup({ id: ID_OUT, member: 'out-of-scope/y.ts', disposition: 'keep-with-reason' }),
    );
    const working = doc(
      keepGroup({ id: ID_IN, member: 'in-scope/x.ts', disposition: 'pending' }),
      keepGroup({ id: ID_OUT, member: 'out-of-scope/y.ts', disposition: 'pending' }),
    );
    const scope = new Set(['in-scope/x.ts']);
    const transitions = findDestructiveTransitions(head, working, scope);
    expect(transitions.map((t) => t.id)).toEqual([ID_IN]);
  });

  it('(d) --feature unknown-slug → CLI exits 2 with FeatureNotFoundError', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dw-dispsurv-unknown-'));
    try {
      runGit(['init', '-q', '-b', 'main'], dir);
      runGit(['config', 'user.email', 'test@example.com'], dir);
      runGit(['config', 'user.name', 'Test'], dir);
      runGit(['config', 'commit.gpgsign', 'false'], dir);
      const baselineAbs = join(dir, BASELINE_RELPATH);
      await mkdir(dirname(baselineAbs), { recursive: true });
      const head = doc(
        keepGroup({ id: ID_IN, member: 'in-scope/x.ts', disposition: 'keep-with-reason' }),
      );
      await writeFile(baselineAbs, serializeClonesYaml(head), 'utf8');
      runGit(['add', BASELINE_RELPATH], dir);
      runGit(['commit', '-q', '-m', 'seed'], dir);
      // Flip working tree to pending so the gate would otherwise fire.
      const working = doc(
        keepGroup({ id: ID_IN, member: 'in-scope/x.ts', disposition: 'pending' }),
      );
      await writeFile(baselineAbs, serializeClonesYaml(working), 'utf8');

      const run = await runScannerSubprocess(
        CLI_ENTRY,
        ['check-disposition-survivor', '--feature', 'does-not-exist'],
        { cwd: dir },
      );
      expect(run.code).toBe(2);
      expect(run.stderr).toMatch(/feature 'does-not-exist' not found/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('end-to-end: --feature hygiene narrows the gate to in-scope transitions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dw-dispsurv-e2e-'));
    try {
      runGit(['init', '-q', '-b', 'main'], dir);
      runGit(['config', 'user.email', 'test@example.com'], dir);
      runGit(['config', 'user.name', 'Test'], dir);
      runGit(['config', 'commit.gpgsign', 'false'], dir);
      const baselineAbs = join(dir, BASELINE_RELPATH);
      await mkdir(dirname(baselineAbs), { recursive: true });
      const head = doc(
        keepGroup({ id: ID_IN, member: 'in-scope/x.ts', disposition: 'keep-with-reason' }),
        keepGroup({ id: ID_OUT, member: 'out-of-scope/y.ts', disposition: 'keep-with-reason' }),
      );
      await writeFile(baselineAbs, serializeClonesYaml(head), 'utf8');
      runGit(['add', BASELINE_RELPATH], dir);
      runGit(['commit', '-q', '-m', 'seed'], dir);
      const working = doc(
        keepGroup({ id: ID_IN, member: 'in-scope/x.ts', disposition: 'pending' }),
        keepGroup({ id: ID_OUT, member: 'out-of-scope/y.ts', disposition: 'pending' }),
      );
      await writeFile(baselineAbs, serializeClonesYaml(working), 'utf8');
      await plantManifest(dir, ['in-scope/x.ts']);

      const run = await runScannerSubprocess(
        CLI_ENTRY,
        ['check-disposition-survivor', '--feature', 'hygiene'],
        { cwd: dir },
      );
      // Gate fires (exit 1) because ONE transition (ID_IN) is in scope.
      expect(run.code, `stderr=${run.stderr}; stdout=${run.stdout}`).toBe(1);
      expect(run.stderr).toContain(ID_IN);
      expect(run.stderr, `ID_OUT should be filtered out:\n${run.stderr}`).not.toContain(ID_OUT);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
