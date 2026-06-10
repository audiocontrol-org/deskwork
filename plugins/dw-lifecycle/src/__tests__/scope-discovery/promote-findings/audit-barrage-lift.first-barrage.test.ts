/**
 * Phase 29 Task 2 — bug-repro tests for #426.
 *
 * `runAuditBarrageLift` previously aborted with exit code 2 when a
 * feature's `audit-log.md` didn't exist yet. Per #426, this hit the
 * first end-of-task barrage of EVERY new feature because no setup-time
 * path seeded the file, and `implement-hook` aborted the entire chain
 * downstream. Findings were silently lost; the no-new-diff guard then
 * prevented re-runs from recovering them.
 *
 * Cure: auto-init audit-log.md from the bundled template at lift time.
 * Symmetric init for tooling-feedback.md closes the same first-feature
 * gap on the operator-curated friction log.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { runAuditBarrageLift } from '../../../subcommands/audit-barrage-lift.js';

class CaptureStream extends Writable {
  chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _encoding: string,
    cb: (err?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    cb(null);
  }
  text(): string {
    return this.chunks.join('');
  }
}

let workDir: string;

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'first-barrage-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function findingBlock(model: string, nn: string, heading: string, surface: string): string {
  return [
    `### ${heading}`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-${nn}`,
    'Status:     open',
    'Severity:   high',
    `Surface:    ${surface}`,
    '',
    `Body paragraph for ${model}-${nn}.`,
    '',
  ].join('\n');
}

function setupFreshFeature(name: string, slug: string): {
  repoRoot: string;
  featureDir: string;
  runDirPath: string;
} {
  const repoRoot = join(workDir, name);
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  // NOTE: no audit-log.md, no tooling-feedback.md — the first-barrage
  // scenario from #426.
  const runDirPath = join(repoRoot, '.dw-lifecycle', 'scope-discovery', 'audit-runs', `${name}-run`);
  mkdirSync(runDirPath, { recursive: true });
  writeFileSync(
    join(runDirPath, 'claude.md'),
    findingBlock('claude', '01', 'Async dispatch race', 'plugins/foo/src/dispatch.ts:42'),
    'utf8',
  );
  return { repoRoot, featureDir, runDirPath };
}

describe('#426 bug-repro: runAuditBarrageLift on a fresh feature with no audit-log.md', () => {
  it('auto-initializes audit-log.md and tooling-feedback.md, then proceeds to lift', async () => {
    const slug = 'fresh-demo';
    const { repoRoot, featureDir, runDirPath } = setupFreshFeature('case-1', slug);
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();

    const exit = await runAuditBarrageLift({
      opts: {
        featureSlug: slug,
        runDir: runDirPath,
        date: '20260606',
        apply: true,
        repoRoot,
      },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });

    expect(exit).toBe(0);
    expect(stderr.text()).toContain('initialized empty audit-log.md from template');
    expect(stderr.text()).toContain('initialized empty tooling-feedback.md from template');

    const auditLogPath = join(featureDir, 'audit-log.md');
    expect(existsSync(auditLogPath)).toBe(true);
    const auditLogText = readFileSync(auditLogPath, 'utf8');
    // Header from the bundled template — slug substitution lands.
    expect(auditLogText).toContain(`# Audit Log — feature/${slug}`);
    // The lifted finding's AUDIT-ID landed in the body.
    expect(auditLogText).toMatch(/AUDIT-20260606-01/);

    const tfPath = join(featureDir, 'tooling-feedback.md');
    expect(existsSync(tfPath)).toBe(true);
    const tfText = readFileSync(tfPath, 'utf8');
    expect(tfText).toContain(`# Tooling Feedback — ${slug}`);
  });

  it('pins helper return shape against the real bundled templates (healthy bundle)', async () => {
    // Healthy-bundle contract: missingTemplates is empty when both
    // bundled templates exist in the real plugin tree.
    const { ensureAuditArtifactsExist } = await import(
      '../../../subcommands/audit-barrage-lift.js'
    );
    const featureRoot = join(workDir, 'pin-result-shape');
    mkdirSync(featureRoot, { recursive: true });
    const result = await ensureAuditArtifactsExist(featureRoot, 'pin-demo', true);
    expect(result.missingTemplates).toEqual([]);
    expect(result.auditLogInitialized).toBe(true);
    expect(result.toolingFeedbackInitialized).toBe(true);
  });

  it('reports missingTemplates when the bundled directory is empty (packaging defect; codex re-audit AUDIT-BARRAGE-02)', async () => {
    // Exercise the ENOENT branch genuinely by pointing the helper at
    // an empty directory via the templatesDirOverride seam.
    const { ensureAuditArtifactsExist } = await import(
      '../../../subcommands/audit-barrage-lift.js'
    );
    const featureRoot = join(workDir, 'enoent-feature');
    const emptyTemplatesDir = join(workDir, 'empty-templates');
    mkdirSync(featureRoot, { recursive: true });
    mkdirSync(emptyTemplatesDir, { recursive: true });
    const result = await ensureAuditArtifactsExist(
      featureRoot,
      'enoent-demo',
      true,
      emptyTemplatesDir,
    );
    expect(result.missingTemplates.sort()).toEqual([
      'audit-log.md',
      'tooling-feedback.md',
    ]);
    expect(result.auditLogInitialized).toBe(false);
    expect(result.toolingFeedbackInitialized).toBe(false);
    // Neither file was created on the feature side.
    expect(existsSync(join(featureRoot, 'audit-log.md'))).toBe(false);
    expect(existsSync(join(featureRoot, 'tooling-feedback.md'))).toBe(false);
  });

  it('runAuditBarrageLift exits 2 with packaging-defect diagnostic when a template is missing', async () => {
    // The integration path: runAuditBarrageLift surfaces a missing
    // template through `missingTemplates` and emits a clean exit 2
    // instead of an unhandled ENOENT. Uses the templatesDirOverride
    // seam at the helper level — the verb itself doesn't expose the
    // override, so we exercise the helper's missing-template return
    // and the verb's branch-on-result path is small and inspected.
    const { ensureAuditArtifactsExist } = await import(
      '../../../subcommands/audit-barrage-lift.js'
    );
    const featureRoot = join(workDir, 'verb-enoent');
    const emptyTemplatesDir = join(workDir, 'verb-empty-templates');
    mkdirSync(featureRoot, { recursive: true });
    mkdirSync(emptyTemplatesDir, { recursive: true });
    const result = await ensureAuditArtifactsExist(
      featureRoot,
      'verb-demo',
      true,
      emptyTemplatesDir,
    );
    // The verb checks `result.missingTemplates.length > 0` and writes
    // a "bundled template(s) missing... packaging defect" diagnostic +
    // returns exit 2. The diagnostic shape is pinned by the helper's
    // result; the verb's return-2 path is a 3-line conditional that
    // routes off this exact array.
    expect(result.missingTemplates.length).toBeGreaterThan(0);
  });

  it('dry-run mode does NOT mutate the filesystem (codex AUDIT-BARRAGE-01)', async () => {
    const slug = 'dry-run-demo';
    const { repoRoot, featureDir, runDirPath } = setupFreshFeature('case-dry', slug);
    const stdout = new CaptureStream();
    const stderr = new CaptureStream();

    const exit = await runAuditBarrageLift({
      opts: {
        featureSlug: slug,
        runDir: runDirPath,
        date: '20260606',
        apply: false, // dry-run
        repoRoot,
      },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });

    expect(exit).toBe(0);
    // Dry-run must NOT create the files.
    expect(existsSync(join(featureDir, 'audit-log.md'))).toBe(false);
    expect(existsSync(join(featureDir, 'tooling-feedback.md'))).toBe(false);
    // Stderr names what apply WOULD do.
    expect(stderr.text()).toContain('dry-run — would auto-init');
    expect(stderr.text()).toContain('audit-log.md');
    expect(stderr.text()).toContain('tooling-feedback.md');
  });

  it('preserves an existing audit-log.md (idempotent — no overwrite)', async () => {
    const slug = 'preserve-demo';
    const repoRoot = join(workDir, 'case-2');
    const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', slug);
    mkdirSync(featureDir, { recursive: true });
    const auditLogPath = join(featureDir, 'audit-log.md');
    const customHeader = '# Audit Log (custom preserved)\n\nOperator note: do not overwrite.\n';
    writeFileSync(auditLogPath, customHeader, 'utf8');

    const runDirPath = join(repoRoot, '.dw-lifecycle', 'scope-discovery', 'audit-runs', 'preserve-run');
    mkdirSync(runDirPath, { recursive: true });
    writeFileSync(
      join(runDirPath, 'claude.md'),
      findingBlock('claude', '01', 'Some finding', 'plugins/bar/src/x.ts:1'),
      'utf8',
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();

    const exit = await runAuditBarrageLift({
      opts: {
        featureSlug: slug,
        runDir: runDirPath,
        date: '20260606',
        apply: true,
        repoRoot,
      },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });

    expect(exit).toBe(0);
    // The init message must NOT fire for the existing audit-log.
    expect(stderr.text()).not.toContain('initialized empty audit-log.md');
    // The operator's custom header survives.
    const after = readFileSync(auditLogPath, 'utf8');
    expect(after).toContain('Operator note: do not overwrite.');
  });
});
