/**
 * File-level + CLI-core tests for `check-design-spec` (Phase 2).
 *
 * `checkDesignSpecFile` composes the two axes — markdown schema validation +
 * static link-liveness — over a spec FILE, resolving css paths relative to the
 * spec's own directory. `runCheckDesignSpec` is the tested CLI core behind
 * `bin/check-design-spec` (the shim only dispatches), mirroring the
 * check-wireframe exit contract: 0 green / 1 findings-or-error / 2 usage.
 *
 * Real-fs temp fixtures per .claude/rules/testing.md.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDesignSpecFile, runCheckDesignSpec } from '@/design-language/check-spec-file';

const tempDirs: string[] = [];

function makeFixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'design-language-cli-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

interface CapturedIo {
  readonly out: string[];
  readonly err: string[];
  readonly io: { out(line: string): void; err(line: string): void };
}

function captureIo(): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (line) => out.push(line), err: (line) => err.push(line) } };
}

const GREEN_SPEC = `# Design language: fixture

### rule: ink-primary
- kind: palette
- css: studio.css .btn-primary
- example: dashboard compose button
- do: Use the ink palette for primary actions.
`;

function writeGreenFixture(dir: string): string {
  writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
  const specPath = join(dir, 'design-language.md');
  writeFileSync(specPath, GREEN_SPEC);
  return specPath;
}

describe('checkDesignSpecFile', () => {
  it('passes a hand-authored spec whose links are live', () => {
    const specPath = writeGreenFixture(makeFixtureDir());
    const result = checkDesignSpecFile(specPath);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.spec.rules).toHaveLength(1);
  });

  it('combines schema findings and liveness findings in one result', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real { color: ink; }\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: no-example
- kind: palette
- css: studio.css .real
- do: x

### rule: dead-link
- kind: component
- css: studio.css .ghost
- example: somewhere
- do: x
`,
    );
    const result = checkDesignSpecFile(specPath);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('missing-example');
    expect(rules).toContain('dead-link-selector');
    expect(result.ok).toBe(false);
  });

  it('throws loud on an unreadable spec file (never a clean verdict)', () => {
    expect(() => checkDesignSpecFile(join(makeFixtureDir(), 'absent.md'))).toThrow();
  });

  it('surfaces a schema defect AND a dead link on the SAME rule in one run (no waves)', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real { color: ink; }\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: both-defects
- kind: palette
- css: studio.css .ghost
- do: x
`,
    );
    const result = checkDesignSpecFile(specPath);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('missing-example');
    expect(rules).toContain('dead-link-selector');
    expect(result.spec.rules).toEqual([]);
  });

  it('surfaces a duplicate section’s dead css link in the same run as duplicate-rule-id', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real { color: ink; }\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: ink
- kind: palette
- css: studio.css .real
- example: a button
- do: x

### rule: ink
- kind: palette
- css: studio.css .ghost
- example: a button
- do: x
`,
    );
    const result = checkDesignSpecFile(specPath);
    const rules = result.findings.map((f) => f.rule);
    expect(rules).toContain('duplicate-rule-id');
    expect(rules).toContain('dead-link-selector');
    expect(result.spec.rules.map((r) => r.id)).toEqual(['ink']);
  });

  it('records a non-css auxiliary link as skipped, never silently dropped', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'styles.ts'), 'export const x = 1;\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: invalid-housing
- kind: palette
- css: styles.ts .btn
- do: x
`,
    );
    const result = checkDesignSpecFile(specPath);
    expect(result.findings.map((f) => f.rule)).toEqual(['missing-example']);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatchObject({
      ruleId: 'invalid-housing',
      reason: 'non-css-target',
    });
  });
});

describe('runCheckDesignSpec — exit contract', () => {
  it('exit 0 + green line on a passing spec', () => {
    const specPath = writeGreenFixture(makeFixtureDir());
    const { out, io } = captureIo();
    expect(runCheckDesignSpec([specPath], io)).toBe(0);
    expect(out.join('\n')).toContain('0 findings');
  });

  it('exit 1 + findings on stderr for a dead selector', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'studio.css'), '.real { color: ink; }\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: dead
- kind: palette
- css: studio.css .ghost
- example: somewhere
- do: x
`,
    );
    const { err, io } = captureIo();
    expect(runCheckDesignSpec([specPath], io)).toBe(1);
    expect(err.join('\n')).toContain('dead-link-selector');
  });

  it('exit 1 + descriptive error on an unreadable file', () => {
    const { err, io } = captureIo();
    expect(runCheckDesignSpec([join(makeFixtureDir(), 'absent.md')], io)).toBe(1);
    expect(err.length).toBeGreaterThan(0);
  });

  it('exit 2 on usage error', () => {
    const { err, io } = captureIo();
    expect(runCheckDesignSpec([], io)).toBe(2);
    expect(err.join('\n')).toContain('usage');
  });

  it('reports skipped non-css targets visibly while staying green', () => {
    const dir = makeFixtureDir();
    writeFileSync(join(dir, 'styles.ts'), 'export const x = 1;\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: css-in-js
- kind: component
- css: styles.ts .btn
- example: somewhere
- do: x
`,
    );
    const { out, io } = captureIo();
    expect(runCheckDesignSpec([specPath], io)).toBe(0);
    expect(out.join('\n')).toContain('not validated in v1');
  });
});
