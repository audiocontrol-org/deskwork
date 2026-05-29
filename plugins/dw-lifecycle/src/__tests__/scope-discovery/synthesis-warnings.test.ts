/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/synthesis-warnings.test.ts
 *
 * Ported from the audiocontrol pilot's
 * `tools/scope-discovery/synthesis-warnings.validate.ts` (T7.5 polish).
 *
 * Asserts that synthesis.ts surfaces non-fatal warnings into the
 * SynthesisOutput.metadata.warnings field AND that the --notes-out CLI
 * option renders them under a `## Synthesizer notes` markdown heading.
 * Without this gate, synthesizer warnings stay on stderr only —
 * invisible to the operator reading the run-dir's synthesis.md.
 *
 * Five scenarios:
 *   1. synthesize() populates metadata.warnings on missing PRD References
 *   2. synthesis CLI --notes-out writes the markdown section
 *   3. gutted-stub self-check: empty-warnings rendering still emits heading
 *   4. AUDIT-12: missing-References warning includes paste-ready skeleton
 *      (BOTH in-memory + notes file channels)
 *   5. AUDIT-12: skeleton absent when PRD has a References section
 *
 * The subprocess scenarios spawn the synthesis CLI via tsx; entry path
 * is anchored relative to this file (resolves correctly regardless of
 * vitest's CWD).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { synthesize } from '../../scope-discovery/synthesis.js';
import type { DiscoveryAgentFinding } from '../../scope-discovery/discovery-agents/types.js';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// __tests__/scope-discovery/ -> ../../scope-discovery/synthesis-cli.ts
const SYNTHESIS_ENTRY = resolve(HERE, '..', '..', 'scope-discovery', 'synthesis-cli.ts');

/**
 * PRD content with NO `References` section — the synthesizer should
 * emit a warning naming the missing section and default to PRD+LAYOUT.md.
 */
const PRD_NO_REFS =
  '# Feature: warnings-fixture\n\n' +
  '## Overview\n' +
  'A fixture PRD whose Goals section mentions polishtest tones polishtest patches polishtest library.\n\n' +
  '## Goals\n' +
  'The polishtest goals are polishtest-shaped.\n';

/**
 * Discovery findings that route the synthesizer to kind=code (clone
 * findings only). Kept synthetic so the assertion targets the
 * warnings-plumbing, not any specific real-source matrix.
 */
const SYNTHETIC_FINDINGS: ReadonlyArray<DiscoveryAgentFinding> = [
  {
    agent: 'clone-detector-reader',
    featureSlug: 'warnings-fixture',
    clones: [
      {
        id: 'a1b2c3d4',
        lines: 10,
        members: ['modules/test/src/a.ts:1-10', 'modules/test/src/b.ts:1-10'],
        disposition: 'pending',
      },
    ],
  },
  {
    agent: 'prd-themed-pattern-hunter',
    featureSlug: 'warnings-fixture',
    themes: [
      {
        term: 'polishtest',
        occurrences: [
          { file: 'modules/test/src/a.ts', line: 1, snippet: 'polishtest tones' },
        ],
      },
    ],
  },
];

interface Fixture {
  readonly dir: string;
  readonly prdPath: string;
  readonly notesPath: string;
}

let tmpRoot: string;

async function makeFixture(label: string): Promise<Fixture> {
  const dir = await mkdtemp(join(tmpRoot, `synthesis-warnings-${label}-`));
  const prdPath = join(dir, 'prd.md');
  await writeFile(prdPath, PRD_NO_REFS, 'utf8');
  return { dir, prdPath, notesPath: join(dir, 'synthesis-notes.md') };
}

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'dw-synthesis-warnings-'));
});

afterAll(async () => {
  if (tmpRoot !== undefined) {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

describe('synthesis — metadata.warnings plumbing', () => {
  it('synthesize() populates metadata.warnings on missing PRD References', async () => {
    const fixture = await makeFixture('output');
    const result = await synthesize({
      featureSlug: 'warnings-fixture',
      findings: SYNTHETIC_FINDINGS,
      prdPath: fixture.prdPath,
      prdRelPath: 'prd.md',
      moduleRoot: 'modules',
    });
    expect(Array.isArray(result.metadata.warnings)).toBe(true);
    expect(
      result.metadata.warnings.length,
      'expected at least one warning (PRD has no References section)',
    ).toBeGreaterThan(0);
    const matched = result.metadata.warnings.some((w) => /no References\/Appendix/i.test(w));
    expect(
      matched,
      `expected a warning mentioning "no References/Appendix"; got: ${result.metadata.warnings.join(' / ')}`,
    ).toBe(true);
  });
});

describe('synthesis-cli — --notes-out rendering', () => {
  it('writes "## Synthesizer notes" markdown fragment with warning body', async () => {
    const fixture = await makeFixture('notesout');
    const manifestPath = join(fixture.dir, 'scope-manifest.yaml');
    const findingsDir = join(fixture.dir, 'findings');
    await mkdir(findingsDir, { recursive: true });
    // Persist findings to disk so the CLI can read them.
    const findingsPaths: string[] = [];
    for (const f of SYNTHETIC_FINDINGS) {
      const p = join(findingsDir, `${f.agent}.json`);
      await writeFile(p, JSON.stringify(f, null, 2), 'utf8');
      findingsPaths.push(p);
    }
    const run = await runScannerSubprocess(SYNTHESIS_ENTRY, [
      '--feature', 'warnings-fixture',
      '--prd-path', fixture.prdPath,
      '--findings', ...findingsPaths,
      '--out', manifestPath,
      '--notes-out', fixture.notesPath,
      '--module-root', 'modules',
    ]);
    expect(run.code, `synthesis exited ${run.code}; stderr:\n${run.stderr}`).toBe(0);
    const notes = await readFile(fixture.notesPath, 'utf8');
    expect(notes).toContain('## Synthesizer notes');
    expect(notes).toMatch(/no References\/Appendix/i);
  });

  it('gutted-stub self-check: empty-warnings rendering still emits the heading', async () => {
    // Run the CLI against a PRD WITH a References section so warnings is
    // empty(-ish), and confirm --notes-out still writes the heading.
    const fixture = await makeFixture('teeth');
    const prdWithRefs =
      '# Feature: teeth-fixture\n\n' +
      'polishtest polishtest polishtest body.\n\n' +
      '## References\n\n' +
      '- [LAYOUT](.dw-lifecycle/scope-discovery/LAYOUT.md)\n';
    await writeFile(fixture.prdPath, prdWithRefs, 'utf8');
    const findingsDir = join(fixture.dir, 'findings');
    await mkdir(findingsDir, { recursive: true });
    const findingsPaths: string[] = [];
    for (const f of SYNTHETIC_FINDINGS) {
      const p = join(findingsDir, `${f.agent}.json`);
      // Rewrite featureSlug to match the new fixture.
      const remapped: DiscoveryAgentFinding = { ...f, featureSlug: 'teeth-fixture' };
      await writeFile(p, JSON.stringify(remapped, null, 2), 'utf8');
      findingsPaths.push(p);
    }
    const manifestPath = join(fixture.dir, 'scope-manifest.yaml');
    const run = await runScannerSubprocess(SYNTHESIS_ENTRY, [
      '--feature', 'teeth-fixture',
      '--prd-path', fixture.prdPath,
      '--findings', ...findingsPaths,
      '--out', manifestPath,
      '--notes-out', fixture.notesPath,
      '--module-root', 'modules',
    ]);
    expect(run.code, `synthesis exited ${run.code}; stderr:\n${run.stderr}`).toBe(0);
    const notes = await readFile(fixture.notesPath, 'utf8');
    expect(notes).toContain('## Synthesizer notes');
    // Either "clean — no notes" or the regime-holdout warning may appear
    // (kind=code synthesis with no regime detector finds emits a warning).
    // The hard requirement is heading presence + at least some body content.
    expect(notes.trim().split('\n').length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * AUDIT-20260524-12: the "PRD has no References/Appendix section"
 * warning must include a paste-ready PRD-augmentation skeleton so the
 * operator gets actionable guidance instead of a single line that's
 * easy to ignore. The skeleton MUST surface in BOTH the in-memory
 * warnings array (synthesize() return) AND the rendered notes file
 * (--notes-out output), since both are operator-facing channels.
 */
const SKELETON_SUBSTRINGS: ReadonlyArray<string> = [
  '## References',
  'Related issues:',
  'Related ADRs:',
  'External docs:',
];

describe('synthesis — AUDIT-12 PRD-skeleton plumbing', () => {
  it('missing-References warning includes paste-ready PRD skeleton (in-memory + notes file)', async () => {
    const fixture = await makeFixture('skeleton-included');
    // In-memory channel: synthesize() return value.
    const result = await synthesize({
      featureSlug: 'warnings-fixture',
      findings: SYNTHETIC_FINDINGS,
      prdPath: fixture.prdPath,
      prdRelPath: 'prd.md',
      moduleRoot: 'modules',
    });
    const referencesWarning = result.metadata.warnings.find((w) =>
      /no References\/Appendix/i.test(w),
    );
    expect(
      referencesWarning,
      `expected a References/Appendix warning; got: ${result.metadata.warnings.join(' / ')}`,
    ).toBeDefined();
    if (referencesWarning === undefined) return;
    const missingInMemory = SKELETON_SUBSTRINGS.filter((s) => !referencesWarning.includes(s));
    expect(
      missingInMemory,
      `in-memory warning missing skeleton substrings; warning was:\n${referencesWarning}`,
    ).toEqual([]);
    // The warning should also reference the PRD path so the operator
    // knows which file to edit (the skeleton is keyed on `prd.md`).
    expect(referencesWarning).toContain('prd.md');

    // Notes-file channel: --notes-out output.
    const manifestPath = join(fixture.dir, 'scope-manifest.yaml');
    const findingsDir = join(fixture.dir, 'findings');
    await mkdir(findingsDir, { recursive: true });
    const findingsPaths: string[] = [];
    for (const f of SYNTHETIC_FINDINGS) {
      const p = join(findingsDir, `${f.agent}.json`);
      await writeFile(p, JSON.stringify(f, null, 2), 'utf8');
      findingsPaths.push(p);
    }
    const run = await runScannerSubprocess(SYNTHESIS_ENTRY, [
      '--feature', 'warnings-fixture',
      '--prd-path', fixture.prdPath,
      '--findings', ...findingsPaths,
      '--out', manifestPath,
      '--notes-out', fixture.notesPath,
      '--module-root', 'modules',
    ]);
    expect(run.code, `synthesis CLI exited ${run.code}; stderr:\n${run.stderr}`).toBe(0);
    const notes = await readFile(fixture.notesPath, 'utf8');
    const missingInNotes = SKELETON_SUBSTRINGS.filter((s) => !notes.includes(s));
    expect(
      missingInNotes,
      `notes file missing skeleton substrings; notes were:\n${notes}`,
    ).toEqual([]);
  });

  it('skeleton absent when PRD has a References section (in-memory + notes file)', async () => {
    const fixture = await makeFixture('skeleton-omitted');
    const prdWithRefs =
      '# Feature: has-refs-fixture\n\n' +
      'polishtest polishtest polishtest body.\n\n' +
      '## References\n\n' +
      '- [LAYOUT](.dw-lifecycle/scope-discovery/LAYOUT.md)\n';
    await writeFile(fixture.prdPath, prdWithRefs, 'utf8');
    // In-memory channel: synthesize() return value.
    const remappedFindings: DiscoveryAgentFinding[] = SYNTHETIC_FINDINGS.map(
      (f) => ({ ...f, featureSlug: 'has-refs-fixture' }),
    );
    const result = await synthesize({
      featureSlug: 'has-refs-fixture',
      findings: remappedFindings,
      prdPath: fixture.prdPath,
      prdRelPath: 'prd.md',
      moduleRoot: 'modules',
    });
    const referencesWarning = result.metadata.warnings.find((w) =>
      /no References\/Appendix/i.test(w),
    );
    expect(
      referencesWarning,
      `expected NO References/Appendix warning (PRD has the section); got: ${String(referencesWarning)}`,
    ).toBeUndefined();
    // The skeleton's load-bearing substrings should be absent from EVERY
    // warning in the array — no other warning channel should accidentally
    // ship the skeleton when the gate isn't tripped.
    for (const w of result.metadata.warnings) {
      for (const s of SKELETON_SUBSTRINGS) {
        expect(
          w.includes(s),
          `unexpected skeleton substring "${s}" present in non-References warning:\n${w}`,
        ).toBe(false);
      }
    }
    // Notes-file channel: --notes-out output.
    const findingsDir = join(fixture.dir, 'findings');
    await mkdir(findingsDir, { recursive: true });
    const findingsPaths: string[] = [];
    for (const f of remappedFindings) {
      const p = join(findingsDir, `${f.agent}.json`);
      await writeFile(p, JSON.stringify(f, null, 2), 'utf8');
      findingsPaths.push(p);
    }
    const manifestPath = join(fixture.dir, 'scope-manifest.yaml');
    const run = await runScannerSubprocess(SYNTHESIS_ENTRY, [
      '--feature', 'has-refs-fixture',
      '--prd-path', fixture.prdPath,
      '--findings', ...findingsPaths,
      '--out', manifestPath,
      '--notes-out', fixture.notesPath,
      '--module-root', 'modules',
    ]);
    expect(run.code, `synthesis CLI exited ${run.code}; stderr:\n${run.stderr}`).toBe(0);
    const notes = await readFile(fixture.notesPath, 'utf8');
    const leakedInNotes = SKELETON_SUBSTRINGS.filter((s) => notes.includes(s));
    expect(
      leakedInNotes,
      `notes file leaked skeleton substrings when PRD has References; notes were:\n${notes}`,
    ).toEqual([]);
  });
});

