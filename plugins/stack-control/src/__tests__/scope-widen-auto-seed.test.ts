// specs/014 US6 (TASK-28 / gh-448): scope-widen auto-seeds missing
// scope-discovery state.
//
// The recorded defect: the clone-detector-reader hard-fails on a
// missing clones.yaml baseline (ENOENT → remediation error), and that
// abort takes down the WHOLE widen — including the complaint-driven
// arms (pattern-matrix / ui-route-enumerator / prd-themed hunter) that
// need no baseline at all. On a fresh installation a complaint-driven
// widen required two extra setup verbs first.
//
// Contract (cli-contracts §scope-widen US6; research R6; Clarification
// 2026-06-11 — auto-seed, announced): baseline ENOENT → announced
// auto-seed via the install-scope-discovery primitive, then the widen
// proceeds (exit 0 for the previously-aborting case); the seeded empty
// baseline makes the clone arm's "no registered clones" a TRUE result,
// not a fabricated default; baseline-present behavior is byte-identical
// (no seed text); post-seed genuine failures keep the loud remediation.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { scopeWidenMain } from '../scope-discovery/scope-widen.js';
import { synthesize } from '../scope-discovery/synthesis.js';
import type { DiscoveryAgentFinding } from '../scope-discovery/discovery-agents/types.js';

const PRD = [
  '# Feature: widen-fixture',
  '',
  '## Overview',
  '',
  'The widget module is the surface. widget widget widget.',
  '',
].join('\n');

const SEED_ANNOUNCEMENT =
  'scope-widen: scope-discovery state absent — seeding .stack-control/scope-discovery/ (first use)';

interface Fixture {
  readonly root: string;
  readonly prdPath: string;
  readonly manifestPath: string;
  cleanup(): Promise<void>;
}

/**
 * A fresh installation: PRD + prior manifest + module tree, but NO
 * .stack-control/scope-discovery/ state at all (the previously
 * hard-aborting shape).
 */
async function makeFreshFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'widen-seed-'));
  // The fixture root is an INSTALLATION (the marker the --at walk-up
  // resolves; specs/installation-isolation R2 retired --repo-root).
  await mkdir(join(root, '.stack-control'), { recursive: true });
  await writeFile(join(root, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  const docsDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'widen-fixture');
  await mkdir(docsDir, { recursive: true });
  const prdPath = join(docsDir, 'prd.md');
  await writeFile(prdPath, PRD, 'utf8');

  const widgetDir = join(root, 'src', 'widget');
  await mkdir(widgetDir, { recursive: true });
  // The `as Foo` cast gives the live pattern-matrix arm a real hit, and
  // the literal `widget` tokens give the PRD-themed hunter occurrences
  // — so the widen's synthesis has code signal even with ZERO clones
  // (the seeded-empty-baseline case under test).
  await writeFile(
    join(widgetDir, 'a.ts'),
    'export const widget = (x: unknown) => x as Foo;\n',
    'utf8',
  );
  await writeFile(
    join(widgetDir, 'b.ts'),
    'export const widgetCount = 2; // widget helper\n',
    'utf8',
  );

  // Prior manifest synthesized WITHOUT the clone arm (a fresh install
  // has no baseline yet — the inventory that produced this manifest
  // would have been run the same complaint-driven way).
  const priorFindings: ReadonlyArray<DiscoveryAgentFinding> = [
    {
      agent: 'prd-themed-pattern-hunter',
      featureSlug: 'widen-fixture',
      themes: [
        {
          term: 'widget',
          occurrences: [{ file: 'src/widget/a.ts', line: 1, snippet: 'widget' }],
        },
      ],
    },
    {
      agent: 'ast-grep-matrix',
      featureSlug: 'widen-fixture',
      patterns: [
        {
          id: 'as-type-cast',
          description: 'as-cast bypassing the type system',
          regex: '\\bas\\s+[A-Z]',
          hits: [{ file: 'src/widget/a.ts', line: 1, snippet: 'x as Foo' }],
        },
      ],
    },
  ];
  const priorOut = await synthesize({
    featureSlug: 'widen-fixture',
    findings: priorFindings,
    prdPath,
    prdRelPath: 'docs/1.0/001-IN-PROGRESS/widen-fixture/prd.md',
    moduleRoot: 'src',
  });
  const manifestPath = join(docsDir, 'scope-manifest.yaml');
  await writeFile(manifestPath, stringifyYaml(priorOut.manifest), 'utf8');

  return {
    root,
    prdPath,
    manifestPath,
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

function widenArgs(fixture: Fixture): string[] {
  return [
    'gadget module is also affected by this change',
    '--slug',
    'widen-fixture',
    '--at',
    fixture.root,
    '--prd-path',
    fixture.prdPath,
    '--manifest',
    fixture.manifestPath,
    '--evidence-trail',
    'off',
  ];
}

function captureStderr(): { text: () => string } {
  const chunks: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write);
  return { text: () => chunks.join('') };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('US6 — scope-widen auto-seeds missing scope-discovery state', () => {
  it('complaint-driven widen on a no-baseline installation announces the seed, proceeds, exits 0, and leaves state present', async () => {
    const fixture = await makeFreshFixture();
    const stderr = captureStderr();
    try {
      const code = await scopeWidenMain(widenArgs(fixture));
      expect(stderr.text()).toContain(SEED_ANNOUNCEMENT);
      expect(code).toBe(0);
      // The seeded state is present afterward (legitimate empty baseline).
      expect(
        existsSync(join(fixture.root, '.stack-control', 'scope-discovery', 'clones.yaml')),
      ).toBe(true);
      // The clone arm read the seeded-empty baseline as a TRUE
      // "no registered clones" — not a remediation failure.
      expect(stderr.text()).not.toContain('clone-detector-reader failed');
    } finally {
      await fixture.cleanup();
    }
  });

  it('the widen delta still applies over a seeded-empty baseline (--apply path works first-invocation)', async () => {
    const fixture = await makeFreshFixture();
    captureStderr();
    try {
      const code = await scopeWidenMain([...widenArgs(fixture), '--apply']);
      expect(code).toBe(0);
      // The manifest is still valid YAML on disk after the apply path.
      const after = await readFile(fixture.manifestPath, 'utf8');
      expect(after).toContain('feature_slug: widen-fixture');
    } finally {
      await fixture.cleanup();
    }
  });

  it('baseline-present behavior is byte-identical: no seed announcement', async () => {
    const fixture = await makeFreshFixture();
    const sdDir = join(fixture.root, '.stack-control', 'scope-discovery');
    await mkdir(sdDir, { recursive: true });
    await writeFile(
      join(sdDir, 'clones.yaml'),
      'schemaVersion: 1\ngenerated_at: "2026-06-10T00:00:00Z"\nclones: []\n',
      'utf8',
    );
    const stderr = captureStderr();
    try {
      const code = await scopeWidenMain(widenArgs(fixture));
      expect(code).toBe(0);
      expect(stderr.text()).not.toContain('seeding .stack-control/scope-discovery/');
    } finally {
      await fixture.cleanup();
    }
  });
});
