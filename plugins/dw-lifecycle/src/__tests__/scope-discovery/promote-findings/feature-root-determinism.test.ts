/**
 * AUDIT-20260530-06 regression: when the same feature slug exists under
 * multiple `docs/<v>/001-IN-PROGRESS/` directories, both
 * `findFeatureRoot` (workplan-aware-gate.ts) and `resolveFeatureRoot`
 * (audit-barrage-lift.ts) iterated `readdir(docsRoot)` in filesystem
 * order — non-deterministic across filesystems and across runs. The
 * gate could read one feature's audit-log while the lift wrote the
 * other's, a silent split-brain that corrupts the closure loop.
 *
 * The fix sorts the top-level entries lexicographically before
 * iterating, so both walkers pick the SAME directory across runs and
 * across processes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkWorkplanAwareGate } from '../../../scope-discovery/promote-findings/workplan-aware-gate.js';
import { runAuditBarrageLift } from '../../../subcommands/audit-barrage-lift.js';
import { Writable } from 'node:stream';

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
  workDir = mkdtempSync(join(tmpdir(), 'frd-'));
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeMultiVersionRepo(name: string, slug: string): string {
  const repoRoot = join(workDir, name);
  // Create the slug under TWO version dirs to trigger the ambiguity.
  const versions = ['1.0', '0.x'];
  for (const v of versions) {
    const featureDir = join(repoRoot, 'docs', v, '001-IN-PROGRESS', slug);
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'audit-log.md'),
      `# Audit Log (${v})\n`,
      'utf8',
    );
    writeFileSync(
      join(featureDir, 'workplan.md'),
      `# Workplan (${v})\n\n## Phase 1: x\n\n### Task 1: t\n\n- [ ] step\n`,
      'utf8',
    );
  }
  return repoRoot;
}

describe('feature-root resolution determinism (AUDIT-20260530-06)', () => {
  it('checkWorkplanAwareGate picks the same version dir across 3 invocations', async () => {
    const repoRoot = makeMultiVersionRepo('gate-determinism', 'demo');
    const r1 = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    const r2 = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    const r3 = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    // Result shape may carry `openFindings` (none here), but the gate
    // should always succeed identically. The interesting determinism
    // check is below: re-resolve via the lift verb against the same
    // repo and confirm both verbs pick the same audit-log.
    expect(r1.reason).toBe(r2.reason);
    expect(r2.reason).toBe(r3.reason);
  });

  it('audit-barrage-lift + workplan-aware-gate resolve to the SAME version dir (real split-brain check)', async () => {
    // Per AUDIT-20260530-09: replace the previous vacuous version of
    // this test with a real comparison. Lift `--apply` writes a
    // distinguishable marker into whichever audit-log it picked; gate
    // reads back and proves it saw the same one.
    const repoRoot = join(workDir, 'split-brain-real');
    const v0x = join(repoRoot, 'docs', '0.x', '001-IN-PROGRESS', 'demo');
    const v10 = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(v0x, { recursive: true });
    mkdirSync(v10, { recursive: true });
    const emptyAuditLog = '# Audit Log\n';
    writeFileSync(join(v0x, 'audit-log.md'), emptyAuditLog, 'utf8');
    writeFileSync(join(v0x, 'workplan.md'), '# WP 0.x\n\n## Phase 1: x\n\n### Task 1: t\n\n- [ ] step\n', 'utf8');
    writeFileSync(join(v10, 'audit-log.md'), emptyAuditLog, 'utf8');
    writeFileSync(join(v10, 'workplan.md'), '# WP 1.0\n\n## Phase 1: x\n\n### Task 1: t\n\n- [ ] step\n', 'utf8');

    // Set up a minimal run-dir with one parseable finding so the
    // lift actually writes a finding (the previous test used an
    // empty run-dir → no write → no signal).
    const runDir = join(workDir, 'sb-run-dir');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'claude.md'),
      [
        '### Marker finding for split-brain test',
        '',
        'Finding-ID: AUDIT-BARRAGE-claude-01',
        'Status:     open',
        'Severity:   medium',
        'Surface:    src/test.ts:42',
        '',
        'Body that will land in whichever audit-log the lift picks.',
        '',
      ].join('\n'),
      'utf8',
    );

    const stdout = new CaptureStream();
    const stderr = new CaptureStream();
    const liftExit = await runAuditBarrageLift({
      opts: { featureSlug: 'demo', runDir, date: '20260601', apply: true },
      projectRoot: repoRoot,
      stdout,
      stderr,
    });
    expect(liftExit).toBe(0);

    // Read both audit-logs back. EXACTLY ONE should have the marker.
    // Whichever it is, the gate MUST see the same finding-ID (proves
    // gate + lift picked the same dir).
    const log0x = readFileSync(join(v0x, 'audit-log.md'), 'utf8');
    const log10 = readFileSync(join(v10, 'audit-log.md'), 'utf8');
    const has0x = log0x.includes('AUDIT-20260601-01');
    const has10 = log10.includes('AUDIT-20260601-01');
    expect(has0x !== has10).toBe(true); // exclusive — exactly one

    const gateResult = await checkWorkplanAwareGate({
      featureSlug: 'demo',
      repoRoot,
    });
    // Gate must REFUSE (the audit-log it picked has an open finding
    // that's not yet scoped in the workplan). If it picked the other
    // version's empty audit-log, it would return `no-open-findings`.
    expect(gateResult.allowed).toBe(false);
    if (gateResult.allowed === false && gateResult.reason === 'coverage-mismatch') {
      // The open finding is AUDIT-20260601-01 (canonical) regardless
      // of which version-dir the lift+gate agreed on. Verifies the
      // round-trip: lift wrote AUDIT-20260601-01 SOMEWHERE; gate saw
      // it. If the two had picked different dirs, gate would have
      // returned `no-open-findings` (empty audit-log on its side).
      expect(gateResult.missingIds).toContain('AUDIT-20260601-01');
    }
  });

  it('checkWorkplanAwareGate against multi-version repo picks `1.0` (lex-greatest), not `0.x`', async () => {
    // Per AUDIT-20260530-08: lex-sort biased to `0.x` (oldest) over
    // `1.0` (newest) was the wrong default. The fix reverses the
    // sort to pick lex-greatest, biasing toward the active version.
    // Test: 0.x has an open finding (would refuse if picked); 1.0
    // is clean. New behavior: gate reads 1.0 → exits ALLOWED.
    const repoRoot = join(workDir, 'lex-greatest');
    const v0x = join(repoRoot, 'docs', '0.x', '001-IN-PROGRESS', 'demo');
    const v10 = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'demo');
    mkdirSync(v0x, { recursive: true });
    mkdirSync(v10, { recursive: true });
    // 0.x has 1 open finding; 1.0 is clean.
    writeFileSync(
      join(v0x, 'audit-log.md'),
      [
        '# Audit Log',
        '',
        '### Finding from 0.x',
        '',
        'Finding-ID: AUDIT-20260601-00',
        'Status: open',
        'Severity: high',
        '',
        'Body.',
        '',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(v0x, 'workplan.md'),
      '# Workplan 0.x\n\n## Phase 1: x\n\n### Task 1: t\n\n- [ ] step\n',
      'utf8',
    );
    writeFileSync(join(v10, 'audit-log.md'), '# Audit Log (1.0 — clean)\n', 'utf8');
    writeFileSync(join(v10, 'workplan.md'), '# Workplan 1.0\n\n## Phase 1: x\n\n### Task 1: t\n\n- [ ] step\n', 'utf8');
    const gate = await checkWorkplanAwareGate({ featureSlug: 'demo', repoRoot });
    // Post-AUDIT-08: walker picks lex-greatest. With [0.x, 1.0],
    // lex-greatest is `1.0` (clean) → gate returns `no-open-findings`.
    // (Pre-AUDIT-08 the walker picked `0.x` and saw its open finding.)
    expect(gate.allowed).toBe(true);
  });
});
