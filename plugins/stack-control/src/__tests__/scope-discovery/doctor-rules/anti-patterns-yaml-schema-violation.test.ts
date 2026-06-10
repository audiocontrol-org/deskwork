/**
 * Tests for the `anti-patterns-yaml-schema-violation` doctor rule.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../../../scope-discovery/doctor-rules/anti-patterns-yaml-schema-violation.js';

const tmpRoots: string[] = [];

function mkProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'sc-doctor-ap-schema-'));
  tmpRoots.push(root);
  mkdirSync(join(root, '.stack-control/scope-discovery'), { recursive: true });
  return root;
}

function plant(root: string, body: string): void {
  writeFileSync(
    join(root, '.stack-control/scope-discovery/anti-patterns.yaml'),
    body,
    'utf8',
  );
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

describe('anti-patterns-yaml-schema-violation doctor rule', () => {
  it('passes silently when anti-patterns.yaml is absent', async () => {
    const root = mkProject();
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('passes on a well-formed empty registry', async () => {
    const root = mkProject();
    plant(root, 'schemaVersion: 1\nanti_patterns: []\n');
    const findings = await check({ repoRoot: root });
    expect(findings).toEqual([]);
  });

  it('fires an error on a malformed entry (missing id)', async () => {
    const root = mkProject();
    plant(
      root,
      [
        'anti_patterns:',
        '  - added_in: 0000000',
        '    primitive: foo',
        '    from: bar',
        '    message: baz',
        '    shape_regex:',
        '      - "abc"',
      ].join('\n') + '\n',
    );
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].rule).toBe('anti-patterns-yaml-schema-violation');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toMatch(/schema/);
  });

  it('fires an error when anti_patterns is not a list', async () => {
    const root = mkProject();
    plant(root, 'anti_patterns: not-a-list\n');
    const findings = await check({ repoRoot: root });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/list/);
  });
});
