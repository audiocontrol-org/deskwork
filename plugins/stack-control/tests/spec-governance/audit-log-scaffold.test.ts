/**
 * Spec 013 US2 (T011 / T012) — first-barrage audit-log scaffold.
 *
 * When a feature root resolves but has NO audit-log.md yet (the case
 * for a brand-new specs/ feature whose first barrage just fired),
 * audit-barrage-lift used to abort with `return 2`, stranding the run.
 * It now scaffolds the canonical header at the resolved root and lands
 * the findings. Composes the REAL verb via the stackctl dispatcher
 * against a tmp fixture (no fs mocking, per .claude/rules/testing.md).
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function findingBlock(model: string, nn: string, heading: string, surface: string, sev = 'high'): string {
  return [
    `### ${heading}`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-${nn}`,
    'Status:     open',
    `Severity:   ${sev}`,
    `Surface:    ${surface}`,
    '',
    `Body for ${model}-${nn}.`,
    '',
  ].join('\n');
}

/** A specs/NNN-<slug> feature with NO audit-log.md, plus a populated run-dir. */
function makeSpeckitRepoWithRun(
  slug: string,
  runDirName: string,
  modelFiles: Record<string, string>,
): { repo: string; runDir: string; featureRoot: string } {
  const repo = mkdtempSync(join(tmpdir(), 'scaffold-lift-'));
  const featureRoot = join(repo, 'specs', `013-${slug}`);
  mkdirSync(featureRoot, { recursive: true });
  writeFileSync(join(featureRoot, 'spec.md'), `# ${slug}\n`, 'utf8');
  // NOTE: deliberately NO audit-log.md here.
  const runDir = join(repo, '.stack-control', 'audit-runs', runDirName);
  mkdirSync(runDir, { recursive: true });
  for (const [name, content] of Object.entries(modelFiles)) {
    writeFileSync(join(runDir, name), content, 'utf8');
  }
  return { repo, runDir, featureRoot };
}

function lift(repo: string, slug: string, runDir: string) {
  return runCli([
    'audit-barrage-lift',
    '--feature',
    slug,
    '--run-dir',
    runDir,
    '--repo-root',
    repo,
    '--date',
    '20260610',
    '--apply',
  ]);
}

describe('audit-barrage-lift scaffold-on-first-lift (spec 013 US2)', () => {
  it('scaffolds the canonical audit-log header at a speckit root that has none, then lands findings (T011)', () => {
    const { repo, runDir, featureRoot } = makeSpeckitRepoWithRun('demo-feature', '20260610T120000000Z-demo', {
      'claude.md': findingBlock('claude', '01', 'A real finding', 'src/x.ts:10'),
    });
    const auditLogPath = join(featureRoot, 'audit-log.md');
    try {
      expect(existsSync(auditLogPath)).toBe(false); // precondition
      const r = lift(repo, 'demo-feature', runDir);
      expect(r.status).toBe(0); // NOT the old `return 2` abort
      expect(existsSync(auditLogPath)).toBe(true);
      const written = readFileSync(auditLogPath, 'utf8');
      // Canonical header: frontmatter (slug + targetVersion) and the title.
      expect(written).toMatch(/^---\n[\s\S]*slug:\s*demo-feature[\s\S]*?\n---\n/);
      expect(written).toMatch(/^targetVersion:/m);
      expect(written).toMatch(/^#\s+Audit log\s+—\s+demo-feature$/m);
      // The run section + the finding landed below the header.
      expect(written).toMatch(/^##\s+2026-06-10\s+—\s+audit-barrage\s+lift\s+\(/m);
      expect(written).toMatch(/AUDIT-20260610-\d+/);
      expect(written).toMatch(/A real finding/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('explicit-run-dir re-lift against an EXISTING audit-log lands findings without stranding (T012 / FR-008)', () => {
    // Barrage already fired (run-dir present); the audit-log already
    // exists with prior content. A re-lift against the explicit run-dir
    // must append the findings — no no-new-diff guard strands them.
    const { repo, runDir, featureRoot } = makeSpeckitRepoWithRun('rerun-feature', '20260610T130000000Z-rerun', {
      'codex.md': findingBlock('codex', '03', 'Re-lift finding', 'src/y.ts:20'),
    });
    const auditLogPath = join(featureRoot, 'audit-log.md');
    writeFileSync(auditLogPath, '---\nslug: rerun-feature\ntargetVersion: ""\n---\n\n# Audit log — rerun-feature\n', 'utf8');
    try {
      const r = lift(repo, 'rerun-feature', runDir);
      expect(r.status).toBe(0);
      const written = readFileSync(auditLogPath, 'utf8');
      // Header NOT rewritten (idempotent), findings appended below it.
      expect(written).toMatch(/^#\s+Audit log\s+—\s+rerun-feature$/m);
      expect(written).toMatch(/Re-lift finding/);
      expect(written).toMatch(/AUDIT-20260610-\d+/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
