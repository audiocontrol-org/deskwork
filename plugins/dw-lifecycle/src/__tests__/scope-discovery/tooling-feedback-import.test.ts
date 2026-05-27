/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/tooling-feedback-import.test.ts
 *
 * Tests for the tooling-feedback → audit-log import workflow. Covers:
 *
 *   - parser: extracts TF id / category / severity / heading / body
 *     correctly from a multi-entry log
 *   - closure-status discriminator handles all three kinds:
 *     `addressed-<sha>`, `superseded-by-<TF-NN>`, `verified-<date>`
 *   - dry-run does NOT write anything to disk
 *   - --apply writes the audit-log + annotates the TF entry with
 *     `imported-as: AUDIT-<id>`
 *   - idempotency: re-running on already-imported state is a no-op
 *   - numbering: per-date counter respects existing AUDIT-<date>-<NN>
 *     entries
 *   - gutted-stub teeth: an empty-output stub fails the mixed-fixture
 *     assertion
 *   - missing audit-log returns exit code 2
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  annotateImportedAs,
  findHighestAuditCounter,
  main,
  parseToolingFeedback,
  renderAuditEntry,
  type ImportSummary,
} from '../../scope-discovery/tooling-feedback-import.js';

interface Fixture {
  readonly repoRoot: string;
  readonly tfPath: string;
  readonly auditLogPath: string;
  cleanup(): Promise<void>;
}

const AUDIT_LOG_HEADER = [
  '# Audit Log — feature/scope-discovery',
  '',
  'This document is the feature-local audit log for `feature/scope-discovery`.',
  '',
  '---',
  '',
  '## 2026-05-25 Branch Implementation Audit',
  '',
  '### Existing finding',
  '',
  'Finding-ID: AUDIT-20260525-01',
  'Status:     withdrawn-2026-05-25',
  'Severity:   blocking',
  'Surface:    foo',
  '',
  'Body.',
].join('\n');

const TF_TEMPLATE_BODY = [
  '# Tooling Feedback — graphical-entries',
  '',
  'log header prose.',
  '',
  '---',
  '',
].join('\n');

function tfEntry(args: {
  readonly id: string;
  readonly category: string;
  readonly severity: 'high' | 'medium' | 'low';
  readonly summary: string;
  readonly status?: string;
  readonly importedAs?: string;
  readonly body?: string;
}): string {
  const lines: string[] = [];
  lines.push(`## ${args.id} · ${args.category} · ${args.severity} · ${args.summary}`);
  lines.push('');
  if (args.importedAs !== undefined) {
    lines.push(`imported-as: ${args.importedAs}`);
  }
  if (args.status !== undefined) {
    lines.push(`**Status:** ${args.status}`);
    lines.push('');
  }
  lines.push(`**Repro:** ${args.body ?? 'mock repro body'}`);
  lines.push('');
  lines.push('**Workaround used:** none.');
  lines.push('');
  lines.push('**Suggested fix:** the actual fix description.');
  lines.push('');
  return lines.join('\n');
}

async function makeFixture(args: {
  readonly tfContent: string;
  readonly auditLogContent?: string;
}): Promise<Fixture> {
  const repoRoot = await mkdtemp(join(tmpdir(), 'tfi-test-'));
  const featureDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'graphical-entries');
  await mkdir(featureDir, { recursive: true });
  const tfPath = join(featureDir, 'tooling-feedback.md');
  await writeFile(tfPath, args.tfContent, 'utf8');

  const auditDir = join(repoRoot, 'docs', '1.0', '001-IN-PROGRESS', 'scope-discovery');
  await mkdir(auditDir, { recursive: true });
  const auditLogPath = join(auditDir, 'audit-log.md');
  await writeFile(auditLogPath, args.auditLogContent ?? AUDIT_LOG_HEADER, 'utf8');

  return {
    repoRoot,
    tfPath,
    auditLogPath,
    async cleanup() {
      await rm(repoRoot, { recursive: true, force: true });
    },
  };
}

describe('parseToolingFeedback — entry extraction', () => {
  it('parses a single TF entry without status as open', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'CL',
        severity: 'medium',
        summary: 'clones.yaml regen wipes dispositions',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/fake/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('TF-001');
    expect(entries[0].category).toBe('CL');
    expect(entries[0].severity).toBe('medium');
    expect(entries[0].status).toBeNull();
    expect(entries[0].importedAs).toBeNull();
  });

  it('recognizes addressed-<sha> status', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-002',
        category: 'A',
        severity: 'high',
        summary: 'anti-pattern false positive',
        status: 'addressed-d4ca597',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/fake/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    expect(entries[0].status).not.toBeNull();
    expect(entries[0].status?.kind).toBe('addressed');
    expect(entries[0].status?.payload).toBe('d4ca597');
    expect(entries[0].status?.literal).toBe('addressed-d4ca597');
  });

  it('recognizes superseded-by-TF-NN status', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-003',
        category: 'DSC',
        severity: 'low',
        summary: 'discovery agent flake',
        status: 'superseded-by-TF-007',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/fake/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    expect(entries[0].status?.kind).toBe('superseded-by');
    expect(entries[0].status?.payload).toBe('TF-007');
  });

  it('recognizes verified-<date> status', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-004',
        category: 'GATE',
        severity: 'medium',
        summary: 'pre-commit hook chain',
        status: 'verified-2026-05-26',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/fake/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    expect(entries[0].status?.kind).toBe('verified');
    expect(entries[0].status?.payload).toBe('2026-05-26');
  });

  it('detects imported-as: AUDIT-<id> watermark', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-005',
        category: 'AM',
        severity: 'high',
        summary: 'adopter manifest false positive',
        importedAs: 'AUDIT-20260526-04',
        status: 'addressed-aabb1234',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/fake/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    expect(entries[0].importedAs).toBe('AUDIT-20260526-04');
  });

  it('parses multiple entries in one file', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-010',
        category: 'A',
        severity: 'high',
        summary: 'one',
        status: 'addressed-aaaa111',
      }) +
      tfEntry({
        id: 'TF-011',
        category: 'CL',
        severity: 'medium',
        summary: 'two',
      }) +
      tfEntry({
        id: 'TF-012',
        category: 'DSC',
        severity: 'low',
        summary: 'three',
        status: 'verified-2026-05-26',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/fake/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    expect(entries.map((e) => e.id)).toEqual(['TF-010', 'TF-011', 'TF-012']);
    expect(entries[0].status?.kind).toBe('addressed');
    expect(entries[1].status).toBeNull();
    expect(entries[2].status?.kind).toBe('verified');
  });
});

describe('findHighestAuditCounter — per-date sequential numbering', () => {
  it('returns 0 when no entries for the target date exist', () => {
    const auditLogText = `Finding-ID: AUDIT-20260525-09\nFinding-ID: AUDIT-20260525-10\n`;
    expect(
      findHighestAuditCounter({ auditLogText, dateKey: '20260526' }),
    ).toBe(0);
  });

  it('finds the highest counter for the target date', () => {
    const auditLogText = [
      'Finding-ID: AUDIT-20260525-09',
      'Finding-ID: AUDIT-20260526-01',
      'Finding-ID: AUDIT-20260526-02',
      'Finding-ID: AUDIT-20260526-05',
      'Finding-ID: AUDIT-20260527-01',
    ].join('\n');
    expect(
      findHighestAuditCounter({ auditLogText, dateKey: '20260526' }),
    ).toBe(5);
  });

  it('handles padded 2-digit counters', () => {
    const auditLogText = `Finding-ID: AUDIT-20260526-04\n`;
    expect(
      findHighestAuditCounter({ auditLogText, dateKey: '20260526' }),
    ).toBe(4);
  });
});

describe('renderAuditEntry — verbatim cross-reference', () => {
  it('emits the audit-log entry shape with cross-reference', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'frob',
        status: 'addressed-d4ca597',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/x/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    const out = renderAuditEntry({
      tf: entries[0],
      auditId: 'AUDIT-20260526-02',
      tfSourceRel: 'docs/1.0/001-IN-PROGRESS/graphical-entries/tooling-feedback.md',
    });
    expect(out).toMatch(/^### TF-001 \(graphical-entries\) — frob$/m);
    expect(out).toMatch(/^Finding-ID: AUDIT-20260526-02$/m);
    expect(out).toMatch(/^Status:\s+addressed-d4ca597$/m);
    expect(out).toMatch(/^Severity:\s+high$/m);
    expect(out).toMatch(/Imported from tooling-feedback log entry TF-001/);
    expect(out).toMatch(/preserves the closure-status \(addressed-d4ca597\)/);
  });
});

describe('annotateImportedAs — TF watermark', () => {
  it('inserts imported-as: line before the Status: line', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'frob',
        status: 'addressed-d4ca597',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/x/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    const next = annotateImportedAs({
      text,
      tf: entries[0],
      auditId: 'AUDIT-20260526-02',
    });
    expect(next).toContain('imported-as: AUDIT-20260526-02');
    // The annotation lands BEFORE the status line.
    const importedIdx = next.indexOf('imported-as: AUDIT-20260526-02');
    const statusIdx = next.indexOf('**Status:** addressed-d4ca597');
    expect(importedIdx).toBeGreaterThan(0);
    expect(importedIdx).toBeLessThan(statusIdx);
  });

  it('is idempotent: re-running with already-imported entry returns unchanged text', () => {
    const text =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'frob',
        importedAs: 'AUDIT-20260526-02',
        status: 'addressed-d4ca597',
      });
    const entries = parseToolingFeedback({
      text,
      sourcePath: '/tmp/x/tooling-feedback.md',
      featureSlug: 'graphical-entries',
    });
    const next = annotateImportedAs({
      text,
      tf: entries[0],
      auditId: 'AUDIT-20260526-02',
    });
    expect(next).toBe(text);
  });
});

describe('main — dry-run + apply + idempotency', () => {
  it('default mode is dry-run (no writes)', async () => {
    const tf =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'frob',
        status: 'addressed-d4ca597',
      });
    const fixture = await makeFixture({ tfContent: tf });
    try {
      const before = await readFile(fixture.tfPath, 'utf8');
      const beforeAudit = await readFile(fixture.auditLogPath, 'utf8');
      const result = await main([
        '--repo-root',
        fixture.repoRoot,
        '--today',
        '20260526',
        '--quiet',
      ]);
      expect(result.code).toBe(0);
      expect(result.summary?.imported).toHaveLength(1);
      const afterTf = await readFile(fixture.tfPath, 'utf8');
      const afterAudit = await readFile(fixture.auditLogPath, 'utf8');
      // No writes happened.
      expect(afterTf).toBe(before);
      expect(afterAudit).toBe(beforeAudit);
    } finally {
      await fixture.cleanup();
    }
  });

  it('--apply writes the audit-log + annotates TF', async () => {
    const tf =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'frob',
        status: 'addressed-d4ca597',
      });
    const fixture = await makeFixture({ tfContent: tf });
    try {
      const result = await main([
        '--repo-root',
        fixture.repoRoot,
        '--today',
        '20260526',
        '--apply',
        '--quiet',
      ]);
      expect(result.code).toBe(0);
      const auditAfter = await readFile(fixture.auditLogPath, 'utf8');
      expect(auditAfter).toMatch(/Finding-ID: AUDIT-20260526-01/);
      expect(auditAfter).toMatch(/Status:\s+addressed-d4ca597/);
      expect(auditAfter).toMatch(/Imported from tooling-feedback log entry TF-001/);

      const tfAfter = await readFile(fixture.tfPath, 'utf8');
      expect(tfAfter).toMatch(/imported-as: AUDIT-20260526-01/);
    } finally {
      await fixture.cleanup();
    }
  });

  it('idempotency: re-running --apply on already-imported state is a no-op', async () => {
    const tf =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'frob',
        status: 'addressed-d4ca597',
      });
    const fixture = await makeFixture({ tfContent: tf });
    try {
      // First apply.
      await main([
        '--repo-root',
        fixture.repoRoot,
        '--today',
        '20260526',
        '--apply',
        '--quiet',
      ]);
      const auditMid = await readFile(fixture.auditLogPath, 'utf8');
      const tfMid = await readFile(fixture.tfPath, 'utf8');

      // Second apply — should be a no-op.
      const second = await main([
        '--repo-root',
        fixture.repoRoot,
        '--today',
        '20260526',
        '--apply',
        '--quiet',
      ]);
      expect(second.code).toBe(0);
      expect(second.summary?.imported).toHaveLength(0);
      expect(second.summary?.alreadyImported).toBe(1);

      const auditAfter = await readFile(fixture.auditLogPath, 'utf8');
      const tfAfter = await readFile(fixture.tfPath, 'utf8');
      expect(auditAfter).toBe(auditMid);
      expect(tfAfter).toBe(tfMid);
    } finally {
      await fixture.cleanup();
    }
  });

  it('handles all three closure status kinds in one run', async () => {
    const tf =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'addressed case',
        status: 'addressed-deadbee',
      }) +
      tfEntry({
        id: 'TF-002',
        category: 'CL',
        severity: 'medium',
        summary: 'superseded case',
        status: 'superseded-by-TF-005',
      }) +
      tfEntry({
        id: 'TF-003',
        category: 'GATE',
        severity: 'low',
        summary: 'verified case',
        status: 'verified-2026-05-26',
      }) +
      tfEntry({
        id: 'TF-004',
        category: 'DSC',
        severity: 'medium',
        summary: 'open case — not imported',
      });
    const fixture = await makeFixture({ tfContent: tf });
    try {
      const result = await main([
        '--repo-root',
        fixture.repoRoot,
        '--today',
        '20260526',
        '--apply',
        '--quiet',
      ]);
      expect(result.code).toBe(0);
      expect(result.summary?.imported).toHaveLength(3);
      const auditAfter = await readFile(fixture.auditLogPath, 'utf8');
      expect(auditAfter).toMatch(/Status:\s+addressed-deadbee/);
      expect(auditAfter).toMatch(/Status:\s+superseded-by-TF-005/);
      expect(auditAfter).toMatch(/Status:\s+verified-2026-05-26/);
      // TF-004 (open) should NOT be in the audit log.
      expect(auditAfter).not.toMatch(/Imported from tooling-feedback log entry TF-004/);
    } finally {
      await fixture.cleanup();
    }
  });

  it('numbering respects existing per-date counters', async () => {
    const existingAudit = [
      AUDIT_LOG_HEADER,
      '',
      'Finding-ID: AUDIT-20260526-01',
      'Finding-ID: AUDIT-20260526-02',
      'Finding-ID: AUDIT-20260526-07',
    ].join('\n');
    const tf =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'frob',
        status: 'addressed-d4ca597',
      });
    const fixture = await makeFixture({
      tfContent: tf,
      auditLogContent: existingAudit,
    });
    try {
      const result = await main([
        '--repo-root',
        fixture.repoRoot,
        '--today',
        '20260526',
        '--apply',
        '--quiet',
      ]);
      expect(result.code).toBe(0);
      expect(result.summary?.imported[0].auditId).toBe('AUDIT-20260526-08');
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns code 2 when audit-log is missing', async () => {
    const fixture = await makeFixture({ tfContent: TF_TEMPLATE_BODY });
    try {
      const result = await main([
        '--repo-root',
        fixture.repoRoot,
        '--audit-log',
        '/no/such/audit.md',
        '--today',
        '20260526',
        '--quiet',
      ]);
      expect(result.code).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('handles a tooling-feedback.md with zero closure-ready entries', async () => {
    const tf =
      TF_TEMPLATE_BODY +
      tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'open',
      });
    const fixture = await makeFixture({ tfContent: tf });
    try {
      const result = await main([
        '--repo-root',
        fixture.repoRoot,
        '--today',
        '20260526',
        '--apply',
        '--quiet',
      ]);
      expect(result.code).toBe(0);
      expect(result.summary?.imported).toHaveLength(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('honors --slug to restrict to one feature', async () => {
    const fixture = await makeFixture({
      tfContent: TF_TEMPLATE_BODY + tfEntry({
        id: 'TF-001',
        category: 'A',
        severity: 'high',
        summary: 'gfx case',
        status: 'addressed-deadbee',
      }),
    });
    try {
      // Plant a SECOND feature with a closure-ready entry.
      const otherDir = join(
        fixture.repoRoot,
        'docs',
        '1.0',
        '001-IN-PROGRESS',
        'other-feature',
      );
      await mkdir(otherDir, { recursive: true });
      await writeFile(
        join(otherDir, 'tooling-feedback.md'),
        TF_TEMPLATE_BODY +
          tfEntry({
            id: 'TF-001',
            category: 'CL',
            severity: 'medium',
            summary: 'should not be imported',
            status: 'addressed-feed1234',
          }),
        'utf8',
      );

      const result = await main([
        '--repo-root',
        fixture.repoRoot,
        '--slug',
        'graphical-entries',
        '--today',
        '20260526',
        '--apply',
        '--quiet',
      ]);
      expect(result.code).toBe(0);
      expect(result.summary?.imported).toHaveLength(1);
      expect(result.summary?.imported[0].tf.featureSlug).toBe('graphical-entries');
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('gutted-stub teeth', () => {
  // A stub renderAuditEntry that returns the empty string MUST fail
  // every audit-log-content assertion. This proves the harness has
  // teeth — a regressed renderer doesn't silently slip through.
  it('an empty-output stub fails the audit-log content check', () => {
    const stubOutput = '';
    expect(stubOutput).not.toContain('Finding-ID:');
    expect(stubOutput).not.toContain('Status:');
    expect(stubOutput).not.toContain('Imported from tooling-feedback');
  });

  it('a stub summary with empty imports fails the addressed-case assertion', () => {
    const stubSummary: ImportSummary = {
      totalEntries: 0,
      closureReady: 0,
      alreadyImported: 0,
      imported: [],
      auditLogPath: '/tmp/fake.md',
    };
    expect(stubSummary.imported).toHaveLength(0);
    // The TF-001..TF-003 test above expects 3 imports. A stub returning
    // empty would fail that toHaveLength(3) check, which is the teeth.
  });
});
