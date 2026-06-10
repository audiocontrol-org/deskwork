/**
 * Tests for the `provenance-orphaned-entries` doctor rule (Phase 11
 * Task 10). Plants real catalogs + audit-logs on disk via mkdtempSync
 * (per testing.md: "use fixture project trees on disk, never mock the
 * filesystem") and exercises the cross-reference check end-to-end.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check } from '../../../scope-discovery/doctor-rules/provenance-orphaned-entries.js';

const tmpRoots: string[] = [];

function mkTmp(): string {
  const root = mkdtempSync(join(tmpdir(), 'doctor-prov-orphan-'));
  tmpRoots.push(root);
  return root;
}

function writeAt(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return path;
}

function writeConfigDir(root: string): void {
  mkdirSync(join(root, '.stack-control/scope-discovery'), { recursive: true });
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

describe('provenance-orphaned-entries doctor rule', () => {
  it('passes silently when scope-discovery is not installed', async () => {
    const root = mkTmp();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes silently when config dir exists but registries are empty', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    // No registries, no audit-logs — nothing to cross-check.
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes silently when entries have no provenance / audit_history fields', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: blessed-entry
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires when a catalog entry provenance.context points at a missing audit Finding-ID', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    // Plant an audit-log with one Finding-ID; provenance.context points at a DIFFERENT id.
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### Real finding',
        'Finding-ID: AUDIT-20260526-01',
        'Status:     open',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: overturned
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'audit-finding-AUDIT-20260526-99'
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('provenance-orphaned-entries');
    expect(findings[0]?.severity).toBe('warning');
    expect(findings[0]?.message).toMatch(/AUDIT-20260526-99/);
    expect(findings[0]?.message).toMatch(/anti-patterns\.yaml#overturned/);
  });

  it('does not fire when provenance.context matches an existing audit-log Finding-ID', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### Finding',
        'Finding-ID: AUDIT-20260526-01',
        'Status:     open',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: overturned
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
    status: withdrawn
    provenance:
      source: orchestrator-agent
      authored_at: '2026-05-26T00:00:00Z'
      context: 'audit-finding-AUDIT-20260526-01'
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires when audit_history references a missing audit Finding-ID', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      ['### F', 'Finding-ID: AUDIT-20260526-01', 'Status: open'].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: tracked
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
    audit_history:
      - AUDIT-20260526-01
      - AUDIT-20260526-stale
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/AUDIT-20260526-stale/);
    expect(findings[0]?.message).toMatch(/anti-patterns\.yaml#tracked/);
  });

  it('passes when every audit_history reference resolves', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### F1',
        'Finding-ID: AUDIT-20260526-01',
        'Status: open',
        '',
        '### F2',
        'Finding-ID: AUDIT-20260526-02',
        'Status: open',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: tracked
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
    audit_history:
      - AUDIT-20260526-01
      - AUDIT-20260526-02
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires when audit-log Affects citation does not resolve to a catalog entry', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### F',
        'Finding-ID: AUDIT-20260526-01',
        'Status:     open',
        'Affects:',
        '  - anti-patterns.yaml#missing-from-catalog',
        '  - clones.yaml#also-missing',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: real-entry
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings.length).toBeGreaterThanOrEqual(2);
    const messages = findings.map((f) => f.message).join('\n');
    expect(messages).toMatch(/anti-patterns\.yaml#missing-from-catalog/);
    expect(messages).toMatch(/clones\.yaml#also-missing/);
    expect(messages).toMatch(/AUDIT-20260526-01/);
  });

  it('passes when audit-log Affects citation resolves to a real catalog entry', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### F',
        'Finding-ID: AUDIT-20260526-01',
        'Status:     open',
        'Affects:    anti-patterns.yaml#real-entry',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: real-entry
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('honors bare-id citations when the id exists in any registry', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### F',
        'Finding-ID: AUDIT-1',
        'Status:     open',
        'Affects:    real-entry',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: real-entry
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('flags bare-id citations that resolve to nothing', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### F',
        'Finding-ID: AUDIT-1',
        'Status:     open',
        'Affects:    no-such-id-anywhere',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: real-entry
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings.map((f) => f.message).join('\n')).toMatch(/no-such-id-anywhere/);
  });

  it('flags citation when registry-prefixed citation lands on the wrong registry', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### F',
        'Finding-ID: AUDIT-1',
        'Status:     open',
        // The id exists in anti-patterns.yaml, but the citation prefix says clones.yaml.
        'Affects:    clones.yaml#real-entry',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: real-entry
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.message).toMatch(/clones\.yaml#real-entry/);
  });

  it('walks multiple in-progress features and unions the Finding-IDs', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/featA/audit-log.md',
      ['### F1', 'Finding-ID: AUDIT-A-1', 'Status: open'].join('\n'),
    );
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/featB/audit-log.md',
      ['### F2', 'Finding-ID: AUDIT-B-1', 'Status: open'].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: e1
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
    audit_history:
      - AUDIT-A-1
      - AUDIT-B-1
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('aggregates findings across multiple sources of drift', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      [
        '### F',
        'Finding-ID: AUDIT-real',
        'Status:     open',
        'Affects:',
        '  - anti-patterns.yaml#real-entry',
        '  - anti-patterns.yaml#ghost-entry',
      ].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `
anti_patterns:
  - id: real-entry
    added_in: '1234567'
    primitive: x
    from: '@/x'
    shape_regex: 'x'
    message: m
    audit_history:
      - AUDIT-stale
`,
    );
    const findings = await check({ repoRoot: root });
    // Two findings: ghost-entry (audit-log cites missing entry) +
    // AUDIT-stale (entry cites missing audit).
    expect(findings.length).toBeGreaterThanOrEqual(2);
    const joined = findings.map((f) => f.message).join('\n');
    expect(joined).toMatch(/ghost-entry/);
    expect(joined).toMatch(/AUDIT-stale/);
  });

  it('inspects clones.yaml entries too', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      'docs/1.0/001-IN-PROGRESS/feat/audit-log.md',
      ['### F', 'Finding-ID: AUDIT-1', 'Status: open'].join('\n'),
    );
    writeAt(
      root,
      '.stack-control/scope-discovery/clones.yaml',
      `
generated_at: '2026-05-26T00:00:00Z'
clones:
  - id: aaaaaaaaaaaa
    lines: 10
    members:
      - src/a.ts:1:10
      - src/b.ts:1:10
    disposition: pending
    reason: null
    audit_history:
      - AUDIT-nonexistent
`,
    );
    const findings = await check({ repoRoot: root });
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0]?.message).toMatch(/clones\.yaml#aaaaaaaaaaaa/);
    expect(findings[0]?.message).toMatch(/AUDIT-nonexistent/);
  });

  it('skips malformed YAML entries without crashing', async () => {
    const root = mkTmp();
    writeConfigDir(root);
    writeAt(
      root,
      '.stack-control/scope-discovery/anti-patterns.yaml',
      `this: is: not: valid: yaml: at: all`,
    );
    // Should return at most some findings (or empty) without throwing.
    const findings = await check({ repoRoot: root });
    expect(Array.isArray(findings)).toBe(true);
  });
});
