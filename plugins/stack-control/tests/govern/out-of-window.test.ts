// T032 (RED-first, 029 Phase 5 US5) — out-of-window false-HIGH elimination
// (FR-021/022, TASK-316).
//
// The false HIGH this pins: a per-phase diff references a file OUTSIDE the phase's
// window (committed before the phase base, so absent from `git diff base`). The
// auditor, seeing the import but not the definition, falsely flags the referenced
// file as "absent/not-imported". Two levers eliminate it WITHOUT suppressing real
// signal (FR-022):
//   (a) the payload WIDENS to include the referenced-but-out-of-window deps that
//       ARE present (so the auditor sees they exist); a genuinely-missing target
//       is NOT fabricated (a real "missing impl" still surfaces).
//   (b) the implement-mode artifact framing TEACHES the auditor that a reference
//       to a file outside the diff is out-of-this-phase-scope, not an absence.
//
// On-disk git fixtures only (mkdtempSync + real `git init`/commits) — no fs
// mocking, per .claude/rules/testing.md.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assembleImplementPayload,
  CODE_ARTIFACT_FRAMING,
} from '../../src/govern/payload-implement.js';

function git(repo: string, ...args: string[]): { status: number; stdout: string } {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: typeof r.stdout === 'string' ? r.stdout.trim() : '' };
}

function commitAll(repo: string, message: string): void {
  spawnSync('git', ['-C', repo, 'add', '-A'], { encoding: 'utf8' });
  spawnSync(
    'git',
    [
      '-C', repo,
      '-c', 'user.email=t@t',
      '-c', 'user.name=t',
      '-c', 'commit.gpgsign=false',
      'commit', '-q', '--no-gpg-sign', '-m', message,
    ],
    { encoding: 'utf8' },
  );
}

function head(repo: string): string {
  return git(repo, 'rev-parse', 'HEAD').stdout;
}

describe('US5 FR-021 — the artifact framing teaches out-of-window = not-this-phase-scope', () => {
  it('CODE_ARTIFACT_FRAMING instructs the auditor not to flag out-of-window references as absent', () => {
    const lower = CODE_ARTIFACT_FRAMING.toLowerCase();
    expect(lower).toContain('out of');
    expect(lower).toContain('window');
    // It must explicitly steer away from the "absent / not imported" false HIGH.
    expect(lower).toMatch(/absent|not imported|not-imported/);
  });
});

describe('US5 FR-021/022 — the per-phase payload widens to present out-of-window deps', () => {
  it('folds a referenced-but-out-of-window PRESENT dep into the payload (it exists)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'oow-present-'));
    try {
      git(repo, 'init', '-q');
      mkdirSync(join(repo, 'src'), { recursive: true });
      // The dep is committed BEFORE the phase base — out of the phase window.
      writeFileSync(join(repo, 'src/dep.ts'), 'export const dep = "DEP_PRESENT_MARKER";\n');
      writeFileSync(join(repo, 'README.md'), 'seed\n');
      commitAll(repo, 'chore: seed dep (pre-phase, out of window)');
      const base = head(repo);

      // The phase file imports the out-of-window dep.
      writeFileSync(
        join(repo, 'src/feature.ts'),
        'import { dep } from "./dep.js";\nexport const use = dep;\n',
      );
      commitAll(repo, 'feat: phase 5 feature referencing the out-of-window dep');

      const payload = assembleImplementPayload({
        installationRoot: repo,
        base,
        pathScope: ['src/feature.ts'],
      });

      // The phase's own change is present...
      expect(payload.diff).toContain('src/feature.ts');
      // ...AND the referenced out-of-window dep is folded in so the auditor sees
      // it exists (no false "absent/not-imported" HIGH).
      expect(payload.diff).toContain('src/dep.ts');
      expect(payload.diff).toContain('DEP_PRESENT_MARKER');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('does NOT fabricate a block for a genuinely-missing referenced file (FR-022 real signal preserved)', () => {
    const repo = mkdtempSync(join(tmpdir(), 'oow-missing-'));
    try {
      git(repo, 'init', '-q');
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'README.md'), 'seed\n');
      commitAll(repo, 'chore: seed (pre-phase)');
      const base = head(repo);

      // The phase file imports a target that does NOT exist anywhere in the repo.
      writeFileSync(
        join(repo, 'src/feature.ts'),
        'import { gone } from "./missing.js";\nexport const use = gone;\n',
      );
      commitAll(repo, 'feat: phase 5 feature referencing a genuinely-missing impl');

      const payload = assembleImplementPayload({
        installationRoot: repo,
        base,
        pathScope: ['src/feature.ts'],
      });

      expect(payload.diff).toContain('src/feature.ts');
      // No fabricated definition for the missing target — the genuine absence
      // remains visible to the auditor (a real "missing impl" HIGH still fires).
      expect(payload.diff).not.toContain('src/missing.ts');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
