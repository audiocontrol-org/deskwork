/**
 * Spec 013 (TASK-25) — govern's audit_log_excerpt must be resolved
 * through the layout-aware feature-root helper, not a hardcoded
 * docs/1.0/001-IN-PROGRESS path. For a specs/NNN-slug feature the old
 * hardcoded path did not exist, so the barrage prompt silently carried
 * an EMPTY excerpt (a forbidden fallback — degraded governance context
 * with no error). resolveAuditLogExcerpt routes through resolveFeatureRoot
 * so a specs/ feature's existing audit-log is found.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAuditLogExcerpt } from '../subcommands/govern.js';

describe('resolveAuditLogExcerpt — layout-aware audit-log excerpt (spec 013 / TASK-25)', () => {
  it('finds the audit-log of a specs/NNN-<slug> feature (the case the hardcoded docs/ path missed)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'gov-excerpt-speckit-'));
    try {
      const featureRoot = join(repo, 'specs', '013-demo-feature');
      mkdirSync(featureRoot, { recursive: true });
      writeFileSync(
        join(featureRoot, 'audit-log.md'),
        '# Audit log — demo-feature\n\nUNIQUE-SPECKIT-MARKER-42\n',
        'utf8',
      );
      const excerpt = await resolveAuditLogExcerpt(repo, 'demo-feature');
      expect(excerpt).toContain('UNIQUE-SPECKIT-MARKER-42');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('finds the audit-log of a legacy docs/<v>/001-IN-PROGRESS/<slug> feature (unchanged)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'gov-excerpt-legacy-'));
    try {
      const featureRoot = join(repo, 'docs', '1.0', '001-IN-PROGRESS', 'demo-feature');
      mkdirSync(featureRoot, { recursive: true });
      writeFileSync(
        join(featureRoot, 'audit-log.md'),
        '# Audit log — demo-feature\n\nUNIQUE-LEGACY-MARKER-7\n',
        'utf8',
      );
      const excerpt = await resolveAuditLogExcerpt(repo, 'demo-feature');
      expect(excerpt).toContain('UNIQUE-LEGACY-MARKER-7');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('returns empty string when the feature has no audit-log anywhere (correct — no prior findings, not a masked error)', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'gov-excerpt-none-'));
    try {
      mkdirSync(join(repo, 'specs', '013-demo-feature'), { recursive: true });
      const excerpt = await resolveAuditLogExcerpt(repo, 'demo-feature');
      expect(excerpt).toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
