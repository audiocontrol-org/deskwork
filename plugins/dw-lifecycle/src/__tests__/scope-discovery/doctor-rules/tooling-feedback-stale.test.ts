/**
 * Tests for the `tooling-feedback-stale` doctor rule.
 *
 * Covers:
 *   - no docs/ root → silently passes
 *   - all entries fresh → silently passes
 *   - one stale open entry → fires one finding with the open-entry hint
 *   - one stale closure-ready (non-imported) entry → fires one finding
 *     with the run-import hint
 *   - already-imported entries do NOT fire regardless of age
 *   - configurable threshold via config.yaml is honored
 *   - malformed config.yaml falls back to the default threshold
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../../../scope-discovery/doctor-rules/tooling-feedback-stale.js';

const tmpRoots: string[] = [];

function mkProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'dw-doctor-tfs-'));
  tmpRoots.push(root);
  return root;
}

function plantTf(args: {
  readonly root: string;
  readonly slug: string;
  readonly body: string;
  readonly ageDays?: number;
}): string {
  const dir = join(args.root, 'docs', '1.0', '001-IN-PROGRESS', args.slug);
  mkdirSync(dir, { recursive: true });
  const tfPath = join(dir, 'tooling-feedback.md');
  writeFileSync(tfPath, args.body, 'utf8');
  if (args.ageDays !== undefined) {
    // Pin the mtime to `ageDays` days ago.
    const seconds = Math.floor(Date.now() / 1000) - args.ageDays * 24 * 3600;
    utimesSync(tfPath, seconds, seconds);
  }
  return tfPath;
}

const TF_HEADER = [
  '# Tooling Feedback — graphical-entries',
  '',
  '---',
  '',
].join('\n');

function entry(args: {
  readonly id: string;
  readonly status?: string;
  readonly importedAs?: string;
}): string {
  const lines: string[] = [];
  lines.push(`## ${args.id} · A · medium · summary text`);
  lines.push('');
  if (args.importedAs !== undefined) {
    lines.push(`imported-as: ${args.importedAs}`);
  }
  if (args.status !== undefined) {
    lines.push(`**Status:** ${args.status}`);
    lines.push('');
  }
  lines.push('**Repro:** body.');
  lines.push('');
  return lines.join('\n');
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

describe('tooling-feedback-stale doctor rule', () => {
  it('passes silently when no docs/ tree exists', async () => {
    const root = mkProject();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes when an entry is fresh', async () => {
    const root = mkProject();
    plantTf({
      root,
      slug: 'graphical-entries',
      body: TF_HEADER + entry({ id: 'TF-001' }),
      ageDays: 1, // 1 day old — under the default 14-day threshold.
    });
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires on a stale open entry with the triage hint', async () => {
    const root = mkProject();
    plantTf({
      root,
      slug: 'graphical-entries',
      body: TF_HEADER + entry({ id: 'TF-001' }),
      ageDays: 30,
    });
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('tooling-feedback-stale');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].message).toMatch(/TF-001/);
    expect(findings[0].message).toMatch(/graphical-entries/);
    expect(findings[0].message).toMatch(/30 day/);
    expect(findings[0].message).toMatch(/no closure marker yet/);
  });

  it('fires on a stale closure-ready (non-imported) entry with the import hint', async () => {
    const root = mkProject();
    plantTf({
      root,
      slug: 'graphical-entries',
      body:
        TF_HEADER +
        entry({ id: 'TF-002', status: 'addressed-d4ca597' }),
      ageDays: 21,
    });
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/TF-002/);
    expect(findings[0].message).toMatch(/closure-status is addressed-d4ca597/);
    expect(findings[0].message).toMatch(/tooling-feedback-import --apply/);
  });

  it('does NOT fire on an already-imported entry, no matter how old', async () => {
    const root = mkProject();
    plantTf({
      root,
      slug: 'graphical-entries',
      body:
        TF_HEADER +
        entry({
          id: 'TF-001',
          status: 'addressed-d4ca597',
          importedAs: 'AUDIT-20260526-02',
        }),
      ageDays: 365,
    });
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('respects the configurable threshold from config.yaml', async () => {
    const root = mkProject();
    // 10 days old + default 14-day threshold = NOT stale.
    // Lower the threshold to 7 → SHOULD be stale.
    const configDir = join(root, '.dw-lifecycle', 'scope-discovery');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.yaml'),
      'tooling_feedback_stale_days: 7\n',
      'utf8',
    );
    plantTf({
      root,
      slug: 'graphical-entries',
      body: TF_HEADER + entry({ id: 'TF-001' }),
      ageDays: 10,
    });
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/threshold 7/);
  });

  it('falls back to default threshold on malformed config.yaml', async () => {
    const root = mkProject();
    const configDir = join(root, '.dw-lifecycle', 'scope-discovery');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.yaml'),
      'not-valid-yaml: [[[: this is bad',
      'utf8',
    );
    plantTf({
      root,
      slug: 'graphical-entries',
      body: TF_HEADER + entry({ id: 'TF-001' }),
      ageDays: 7, // Below default 14 → no fire.
    });
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires only on the OLD entries when mixed with fresh ones', async () => {
    const root = mkProject();
    // Plant a TF file that's old — both entries inherit the same mtime
    // (the rule's heuristic uses file mtime; per-entry mtime would
    // require git, which the doctor avoids).
    plantTf({
      root,
      slug: 'graphical-entries',
      body:
        TF_HEADER +
        entry({ id: 'TF-001' }) +
        entry({ id: 'TF-002', status: 'addressed-d4ca597' }) +
        entry({
          id: 'TF-003',
          status: 'addressed-feed1234',
          importedAs: 'AUDIT-20260526-02',
        }),
      ageDays: 30,
    });
    const findings = await check({ repoRoot: root });
    // TF-003 is already imported and MUST NOT fire.
    // TF-001 (open) and TF-002 (closure-ready, not imported) MUST fire.
    expect(findings).toHaveLength(2);
    const ids = findings.map((f) => f.message);
    expect(ids.some((m) => m.includes('TF-001'))).toBe(true);
    expect(ids.some((m) => m.includes('TF-002'))).toBe(true);
    expect(ids.some((m) => m.includes('TF-003'))).toBe(false);
  });
});
