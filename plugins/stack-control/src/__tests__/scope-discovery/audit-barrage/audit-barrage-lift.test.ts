// specs/015-audit-protocol-convergence — T012 (RED): the lift persists the
// per-lane severity breakdown + decision alongside the unchanged gate-counted
// `Severity:` line (FR-002 / SC-002). The dampener still reads `Severity:`
// raw; the new `Per-lane:` / `Decision:` lines make the de-inflation auditable.

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runAuditBarrageLift } from '../../../subcommands/audit-barrage-lift.js';

const repos: string[] = [];
afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true });
});

function modelFile(model: string, severity: string, surface: string): string {
  return [
    `### Severity-disagreement seam between the lanes (${model})`,
    '',
    `Finding-ID: AUDIT-BARRAGE-${model}-01`,
    'Status:     open',
    `Severity:   ${severity}`,
    `Surface:    ${surface}`,
    '',
    `Body from ${model}.`,
    '',
  ].join('\n');
}

function makeRepo(slug: string, files: Record<string, string>): { repo: string; runDir: string } {
  const repo = mkdtempSync(join(tmpdir(), 'lift-sev-'));
  repos.push(repo);
  const featureDir = join(repo, 'docs', '1.0', '001-IN-PROGRESS', slug);
  mkdirSync(featureDir, { recursive: true });
  writeFileSync(join(featureDir, 'audit-log.md'), '# Audit Log\n', 'utf8');
  const runDir = join(repo, '.stack-control', 'audit-runs', `20260611T000000000Z-${slug}`);
  mkdirSync(runDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(runDir, name), content, 'utf8');
  }
  return { repo, runDir };
}

async function lift(repo: string, runDir: string, slug: string): Promise<void> {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.resume();
  stderr.resume();
  await runAuditBarrageLift({
    opts: { featureSlug: slug, runDir, date: '20260611', apply: true },
    projectRoot: repo,
    stdout,
    stderr,
  });
}

describe('audit-barrage-lift persists the per-lane severity decision (FR-002)', () => {
  it('writes the gate-counted Severity line PLUS the per-lane breakdown + rule', async () => {
    const { repo, runDir } = makeRepo('sev', {
      'opus.md': modelFile('opus', 'high', 'src/scope-discovery/seam.ts:262'),
      'codex.md': modelFile('codex', 'medium', 'src/scope-discovery/seam.ts:262'),
    });
    await lift(repo, runDir, 'sev');
    const log = readFileSync(join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'sev', 'audit-log.md'), 'utf8');
    // The gate-counted (agreement) severity — dampener reads this, unchanged contract.
    expect(log).toMatch(/^Severity:\s*medium/m);
    // The per-lane raw severities are recoverable on disk (SC-002).
    expect(log).toMatch(/Per-lane:.*opus=high/);
    expect(log).toMatch(/Per-lane:.*codex=medium/);
    // The rule that produced the gate-counted severity.
    expect(log).toMatch(/Decision:\s*agreement/);
  });
});
