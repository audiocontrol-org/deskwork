/**
 * Adversarial scenarios for the refactor-preconditions enforcer (Phase 2
 * Family B). Ported from the audiocontrol pilot's
 * `refactor-preconditions.validate.ts` and converted to vitest. Seven
 * pilot-side scenarios + the gutted-stub self-check:
 *
 *   1. happy-path: all preconditions satisfied
 *   2. reject: canonical_side file does not exist
 *   3. reject: tests_proof.sha does not resolve in git history
 *   4. reject: named test command exits non-zero at HEAD
 *   5. reject: refactor marker names a clone-group id not in clones.yaml
 *   6. reject: marker names a clone-group whose disposition is pending
 *   7. accept (silent): commit message has no refactor marker
 *   8. (gutted-stub self-check; teeth for scenarios 2-6)
 *
 * Pilot-map §3 (Family B test entry) + §5 (REAL_SHA / EXISTING_CANONICAL
 * substitution table) + §8 Risk #2 (Family B tests call real `git
 * rev-parse`, so REAL_SHA must resolve from this repo's git history).
 *
 * Unlike Family A and Family C tests, Family B's harness calls `runGate`
 * directly — NO subprocess. The pilot's separation is intentional (see
 * pilot-map §3): runtime-check primitives are easier to drive
 * programmatically than through a CLI flag matrix.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  type Cli,
  type GateResult,
  runGate,
} from '../../scope-discovery/check-refactor-preconditions.js';

// Fixtures use the real git repo (current working tree) for tests_proof.sha
// resolution. REAL_SHA is the v0.2.0 release commit on `main` (reachable
// from feature/scope-discovery via its merge base). Picked from the
// project's early history per pilot-map §5 and §7 Pre-made Decision #2
// — chosen because it's an old release commit unlikely to be rewritten.
// FAKE_SHA must NOT appear in git history.
//
// EXISTING_CANONICAL / MISSING_CANONICAL: resolved relative to
// process.cwd(). Under vitest the cwd is the npm workspace root
// (`plugins/dw-lifecycle/`), so the paths name files INSIDE the
// workspace. The gate calls `resolve(opts.repoRoot, group.canonical_side)`;
// we set `repoRoot: process.cwd()` in the CLI fixture below, which
// keeps these paths consistent.
const REAL_SHA = '14d90ae';
// 40-char fake (least likely to collide with a real abbrev sha).
const FAKE_SHA = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
const EXISTING_CANONICAL = 'src/scope-discovery/clones-yaml.ts';
const MISSING_CANONICAL = 'src/scope-discovery/this-file-does-not-exist.ts';

// 12 hex-char clone-group ids; distinct from any real production id so a
// state leak between harness and prod yaml would be obvious.
const ID_HAPPY = 'aaaaaaaaaaaa';
const ID_MISSING_FILE = 'bbbbbbbbbbbb';
const ID_BAD_SHA = 'cccccccccccc';
const ID_FAILING_TEST = 'dddddddddddd';
const ID_PENDING = 'eeeeeeeeeeee';
const ID_NOT_IN_YAML = 'ffffffffffff';

interface YamlEntryInput {
  readonly id: string;
  readonly disposition: 'pending' | 'refactor';
  readonly canonical_side?: string;
  readonly canonical_reason?: string;
  readonly tests?: readonly string[];
  readonly tests_proof?: { readonly sha: string; readonly demonstration: string };
}

function buildYaml(entries: readonly YamlEntryInput[]): string {
  const lines: string[] = [];
  lines.push(`generated_at: 2026-05-22T00:00:00Z`);
  lines.push(`clones:`);
  for (const e of entries) {
    lines.push(`  - id: ${e.id}`);
    lines.push(`    lines: 7`);
    lines.push(`    members:`);
    // Two synthetic members per group; their existence is not checked
    // by the gate, only their string shape, so any path is fine here.
    lines.push(`      - modules/synthetic-a/src/${e.id}.ts:1:7`);
    lines.push(`      - modules/synthetic-b/src/${e.id}.ts:1:7`);
    lines.push(`    disposition: ${e.disposition}`);
    lines.push(`    reason: null`);
    if (e.disposition === 'refactor') {
      if (e.canonical_side === undefined || e.canonical_reason === undefined) {
        throw new Error(`buildYaml: refactor entry ${e.id} missing canonical_side/canonical_reason`);
      }
      if (e.tests === undefined || e.tests_proof === undefined) {
        throw new Error(`buildYaml: refactor entry ${e.id} missing tests/tests_proof`);
      }
      lines.push(`    canonical_side: ${JSON.stringify(e.canonical_side)}`);
      lines.push(`    canonical_reason: ${JSON.stringify(e.canonical_reason)}`);
      lines.push(`    tests:`);
      for (const t of e.tests) lines.push(`      - ${JSON.stringify(t)}`);
      lines.push(`    tests_proof:`);
      lines.push(`      sha: ${JSON.stringify(e.tests_proof.sha)}`);
      lines.push(`      demonstration: ${JSON.stringify(e.tests_proof.demonstration)}`);
    }
  }
  return lines.join('\n') + '\n';
}

interface ScenarioFixture {
  readonly slug: string;
  readonly yaml: string;
  readonly commitMsg: string;
  readonly skipTestRun: boolean;
}

async function setupFixture(rootDir: string, fixture: ScenarioFixture): Promise<Cli> {
  const dir = join(rootDir, fixture.slug);
  await mkdir(dir, { recursive: true });
  const yamlPath = join(dir, 'clones.yaml');
  await writeFile(yamlPath, fixture.yaml, 'utf8');
  return {
    commitMsgFile: null,
    commitMsgInline: fixture.commitMsg,
    baselinePath: yamlPath,
    repoRoot: process.cwd(),
    testTimeoutSeconds: 60,
    skipTestRun: fixture.skipTestRun,
  };
}

/**
 * Preflight: ensure REAL_SHA resolves and FAKE_SHA does not. If REAL_SHA
 * is missing (e.g. the picked early commit was rewritten or the test runs
 * from a clone without history), bad-sha's expectation is meaningless and
 * we fail loudly. Mirrors the pilot's `preflightShaResolution`, adapted
 * to vitest as a `beforeAll` guard.
 */
function preflightShaResolution(): string | null {
  const r1 = spawnSync('git', ['rev-parse', '--verify', `${REAL_SHA}^{commit}`], { encoding: 'utf8' });
  if (r1.status !== 0) {
    return `preflight: REAL_SHA ${REAL_SHA} does not resolve via git rev-parse. ` +
      `Pick a different commit from the dw-lifecycle history that is reachable ` +
      `from this branch's merge base with main.`;
  }
  const r2 = spawnSync('git', ['rev-parse', '--verify', `${FAKE_SHA}^{commit}`], { encoding: 'utf8' });
  if (r2.status === 0) {
    return `preflight: FAKE_SHA ${FAKE_SHA} unexpectedly resolves — pick a different fake.`;
  }
  return null;
}

describe('refactor-preconditions enforcer (Family B)', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    const preflightErr = preflightShaResolution();
    if (preflightErr !== null) {
      throw new Error(preflightErr);
    }
    tmpRoot = await mkdtemp(join(tmpdir(), 'refactor-preconditions-validator-'));
  });

  afterAll(async () => {
    if (tmpRoot !== undefined) {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });

  it('happy path: all preconditions satisfied', async () => {
    const fixture: ScenarioFixture = {
      slug: 'happy',
      yaml: buildYaml([
        {
          id: ID_HAPPY,
          disposition: 'refactor',
          canonical_side: EXISTING_CANONICAL,
          canonical_reason: 'synthetic — chosen because this file exists on the branch',
          tests: ['true'], // shell builtin; always exits 0
          tests_proof: {
            sha: REAL_SHA,
            demonstration: 'synthetic — points to v0.2.0 commit which exists in history',
          },
        },
      ]),
      commitMsg: `refactor: collapse clone\n\nCloses clones.yaml ${ID_HAPPY}\n`,
      skipTestRun: false,
    };
    const cli = await setupFixture(tmpRoot, fixture);
    const result = await runGate(cli, fixture.commitMsg);
    expect(result.errors).toEqual([]);
    expect(result.markedIds).toEqual([ID_HAPPY]);
  });

  it('reject: canonical_side file does not exist', async () => {
    const fixture: ScenarioFixture = {
      slug: 'missing-canonical',
      yaml: buildYaml([
        {
          id: ID_MISSING_FILE,
          disposition: 'refactor',
          canonical_side: MISSING_CANONICAL,
          canonical_reason: 'synthetic — deliberately points to a non-existent path',
          tests: ['true'],
          tests_proof: { sha: REAL_SHA, demonstration: 'synthetic' },
        },
      ]),
      commitMsg: `refactor: collapse clone\n\nCloses clones.yaml ${ID_MISSING_FILE}\n`,
      skipTestRun: true,
    };
    const cli = await setupFixture(tmpRoot, fixture);
    const result = await runGate(cli, fixture.commitMsg);
    expect(result.errors.length).toBeGreaterThan(0);
    const combined = result.errors
      .map((e) => `[${e.field}] ${e.detail} — next step: ${e.nextStep}`)
      .join(' || ');
    expect(combined).toContain('canonical_side');
    expect(combined).toContain(MISSING_CANONICAL);
    expect(combined).toContain('does not exist');
    expect(result.errors.some((e) => e.field === 'canonical_side')).toBe(true);
  });

  it('reject: tests_proof.sha does not resolve in git history', async () => {
    const fixture: ScenarioFixture = {
      slug: 'bad-sha',
      yaml: buildYaml([
        {
          id: ID_BAD_SHA,
          disposition: 'refactor',
          canonical_side: EXISTING_CANONICAL,
          canonical_reason: 'synthetic',
          tests: ['true'],
          tests_proof: {
            sha: FAKE_SHA,
            demonstration: 'synthetic — sha is not present in git history',
          },
        },
      ]),
      commitMsg: `refactor: collapse clone\n\nCloses clones.yaml ${ID_BAD_SHA}\n`,
      skipTestRun: true,
    };
    const cli = await setupFixture(tmpRoot, fixture);
    const result = await runGate(cli, fixture.commitMsg);
    expect(result.errors.length).toBeGreaterThan(0);
    const combined = result.errors
      .map((e) => `[${e.field}] ${e.detail} — next step: ${e.nextStep}`)
      .join(' || ');
    expect(combined).toContain('tests_proof.sha');
    expect(combined).toContain(FAKE_SHA);
    expect(combined).toContain('does not resolve');
    expect(result.errors.some((e) => e.field === 'tests_proof.sha')).toBe(true);
  });

  it('reject: named test command exits non-zero at HEAD', async () => {
    const fixture: ScenarioFixture = {
      slug: 'failing-test',
      yaml: buildYaml([
        {
          id: ID_FAILING_TEST,
          disposition: 'refactor',
          canonical_side: EXISTING_CANONICAL,
          canonical_reason: 'synthetic',
          tests: ['false'], // shell builtin; always exits 1
          tests_proof: {
            sha: REAL_SHA,
            demonstration: 'synthetic — but the test command is /usr/bin/false, which fails',
          },
        },
      ]),
      commitMsg: `refactor: collapse clone\n\nCloses clones.yaml ${ID_FAILING_TEST}\n`,
      skipTestRun: false,
    };
    const cli = await setupFixture(tmpRoot, fixture);
    const result = await runGate(cli, fixture.commitMsg);
    expect(result.errors.length).toBeGreaterThan(0);
    const combined = result.errors
      .map((e) => `[${e.field}] ${e.detail} — next step: ${e.nextStep}`)
      .join(' || ');
    expect(combined).toContain('tests[0]');
    expect(combined).toContain('false');
    expect(combined).toContain('exited');
    expect(result.errors.some((e) => e.field === 'tests[0]')).toBe(true);
  });

  it('reject: refactor marker names a clone-group id not in clones.yaml', async () => {
    const fixture: ScenarioFixture = {
      slug: 'not-in-yaml',
      yaml: buildYaml([
        {
          id: ID_HAPPY, // an entry, but a DIFFERENT id from the marker
          disposition: 'refactor',
          canonical_side: EXISTING_CANONICAL,
          canonical_reason: 'synthetic — unrelated entry',
          tests: ['true'],
          tests_proof: { sha: REAL_SHA, demonstration: 'synthetic' },
        },
      ]),
      commitMsg: `refactor: collapse clone\n\nCloses clones.yaml ${ID_NOT_IN_YAML}\n`,
      skipTestRun: true,
    };
    const cli = await setupFixture(tmpRoot, fixture);
    const result = await runGate(cli, fixture.commitMsg);
    expect(result.errors.length).toBeGreaterThan(0);
    const combined = result.errors
      .map((e) => `[${e.field}] ${e.detail} — next step: ${e.nextStep}`)
      .join(' || ');
    expect(combined).toContain(ID_NOT_IN_YAML);
    expect(combined).toContain('no entry exists');
    expect(result.errors.some((e) => e.field === '<entry>')).toBe(true);
  });

  it('reject: marker names a clone-group whose disposition is pending', async () => {
    const fixture: ScenarioFixture = {
      slug: 'pending-disposition',
      yaml: buildYaml([{ id: ID_PENDING, disposition: 'pending' }]),
      commitMsg: `refactor: collapse clone\n\nCloses clones.yaml ${ID_PENDING}\n`,
      skipTestRun: true,
    };
    const cli = await setupFixture(tmpRoot, fixture);
    const result = await runGate(cli, fixture.commitMsg);
    expect(result.errors.length).toBeGreaterThan(0);
    const combined = result.errors
      .map((e) => `[${e.field}] ${e.detail} — next step: ${e.nextStep}`)
      .join(' || ');
    expect(combined).toContain(ID_PENDING);
    expect(combined).toContain("disposition is 'pending'");
    expect(combined).toContain('not');
    expect(result.errors.some((e) => e.field === 'disposition')).toBe(true);
  });

  it('accept (silent): commit message has no refactor marker', async () => {
    const fixture: ScenarioFixture = {
      slug: 'no-marker',
      yaml: buildYaml([{ id: ID_PENDING, disposition: 'pending' }]),
      commitMsg: `feat(foo): unrelated change\n\nFixes a thing in modules/foo/Bar.tsx.\n`,
      skipTestRun: true,
    };
    const cli = await setupFixture(tmpRoot, fixture);
    const result = await runGate(cli, fixture.commitMsg);
    expect(result.errors).toEqual([]);
    expect(result.markedIds).toEqual([]);
  });

  // Gutted-logic self-check — mirrors the pattern from
  // clone-detector.error.test.ts and anti-patterns.core.test.ts. A "gutted
  // gate" returns no errors regardless of input. The probe runs each
  // rejection-shape scenario through BOTH the gutted stub AND the real
  // runGate, and asserts:
  //   - the real runGate flags the rejection (errors.length > 0)
  //   - the gutted stub does NOT flag the rejection (errors.length === 0)
  // If those two diverge as expected, the rejection assertions in the
  // individual `it()` blocks have teeth. If the gutted stub matches the
  // real gate's behavior, the per-scenario asserts could be satisfied
  // by a no-op implementation — the harness has no teeth on that
  // scenario.
  it('gutted-stub self-check: rejection scenarios have teeth against a no-op gate', async () => {
    type GateFn = (cli: Cli, commitMessage: string) => Promise<GateResult>;
    const guttedRunGate: GateFn = async (_cli, commitMessage) => ({
      markedIds: commitMessage.includes('Closes clones.yaml') ? ['guttedstub00'] : [],
      errors: [],
    });

    const rejectionFixtures: ScenarioFixture[] = [
      {
        slug: 'gutted-missing-canonical',
        yaml: buildYaml([
          {
            id: ID_MISSING_FILE,
            disposition: 'refactor',
            canonical_side: MISSING_CANONICAL,
            canonical_reason: 'synthetic',
            tests: ['true'],
            tests_proof: { sha: REAL_SHA, demonstration: 'synthetic' },
          },
        ]),
        commitMsg: `refactor: x\n\nCloses clones.yaml ${ID_MISSING_FILE}\n`,
        skipTestRun: true,
      },
      {
        slug: 'gutted-bad-sha',
        yaml: buildYaml([
          {
            id: ID_BAD_SHA,
            disposition: 'refactor',
            canonical_side: EXISTING_CANONICAL,
            canonical_reason: 'synthetic',
            tests: ['true'],
            tests_proof: { sha: FAKE_SHA, demonstration: 'synthetic' },
          },
        ]),
        commitMsg: `refactor: x\n\nCloses clones.yaml ${ID_BAD_SHA}\n`,
        skipTestRun: true,
      },
      {
        slug: 'gutted-not-in-yaml',
        yaml: buildYaml([
          {
            id: ID_HAPPY,
            disposition: 'refactor',
            canonical_side: EXISTING_CANONICAL,
            canonical_reason: 'synthetic',
            tests: ['true'],
            tests_proof: { sha: REAL_SHA, demonstration: 'synthetic' },
          },
        ]),
        commitMsg: `refactor: x\n\nCloses clones.yaml ${ID_NOT_IN_YAML}\n`,
        skipTestRun: true,
      },
      {
        slug: 'gutted-pending',
        yaml: buildYaml([{ id: ID_PENDING, disposition: 'pending' }]),
        commitMsg: `refactor: x\n\nCloses clones.yaml ${ID_PENDING}\n`,
        skipTestRun: true,
      },
    ];

    const realFlaggedAll: string[] = [];
    const stubFlaggedAny: string[] = [];
    for (const fixture of rejectionFixtures) {
      const cli = await setupFixture(tmpRoot, fixture);
      const real = await runGate(cli, fixture.commitMsg);
      const stub = await guttedRunGate(cli, fixture.commitMsg);
      // The real gate must flag every rejection-shape scenario.
      if (real.errors.length > 0) {
        realFlaggedAll.push(fixture.slug);
      }
      // The stub gate must NOT flag any of them (it returns the
      // "scanner accepted everything" shape; a working assertion on
      // .errors would fail against it).
      if (stub.errors.length > 0) {
        stubFlaggedAny.push(fixture.slug);
      }
    }
    expect(realFlaggedAll).toEqual(rejectionFixtures.map((f) => f.slug));
    expect(stubFlaggedAny).toEqual([]);
  });
});
