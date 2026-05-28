import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  walkWorkplans,
  __testing,
} from '../close-shipped/workplan-walker.js';
import { defaultConfig } from '../config.js';

function makeProject(): {
  readonly root: string;
  readonly workplanPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'close-shipped-wp-'));
  const slugDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'sample');
  mkdirSync(slugDir, { recursive: true });
  return { root, workplanPath: join(slugDir, 'workplan.md') };
}

function configWithVersion() {
  const cfg = defaultConfig();
  return {
    ...cfg,
    docs: { ...cfg.docs, knownVersions: ['1.0'] },
  };
}

describe('CHECKED_ITEM_PATTERN', () => {
  it('matches a checked task with embedded issue link', () => {
    const m = __testing.CHECKED_ITEM_PATTERN.exec(
      '- [x] Step 1: do the thing  ·  [#42](https://github.com/o/r/issues/42)',
    );
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe('42');
  });

  it('does not match unchecked task', () => {
    const m = __testing.CHECKED_ITEM_PATTERN.exec(
      '- [ ] Step 1: not done  ·  [#42](https://x)',
    );
    expect(m).toBeNull();
  });

  it('does not match checked item without issue link', () => {
    const m = __testing.CHECKED_ITEM_PATTERN.exec(
      '- [x] Step 1: no link',
    );
    expect(m).toBeNull();
  });
});

describe('walkWorkplans', () => {
  it('returns empty when no workplan exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'close-shipped-wp-empty-'));
    const findings = walkWorkplans({
      projectRoot: root,
      config: configWithVersion(),
    });
    expect(findings).toEqual([]);
  });

  it('extracts every checked task with an issue link', () => {
    const { root, workplanPath } = makeProject();
    writeFileSync(
      workplanPath,
      [
        '## Phase 1  ·  [#100](https://github.com/o/r/issues/100)',
        '',
        '- [x] Step 1: do A  ·  [#101](https://github.com/o/r/issues/101)',
        '- [ ] Step 2: do B (not done yet)',
        '- [x] Step 3: do C  ·  [#102](https://github.com/o/r/issues/102)',
        '',
      ].join('\n'),
    );
    const findings = walkWorkplans({
      projectRoot: root,
      config: configWithVersion(),
    });
    expect(findings.length).toBe(2);
    const issues = findings.map((f) => f.issueNumber).sort();
    expect(issues).toEqual([101, 102]);
    expect(findings[0]?.workplanPath).toBe(workplanPath);
    expect(findings[0]?.lineNumber).toBeGreaterThan(0);
  });

  it('ignores phase-heading back-fill (only checked task lines count)', () => {
    const { root, workplanPath } = makeProject();
    writeFileSync(
      workplanPath,
      [
        '## Phase 1  ·  [#100](https://github.com/o/r/issues/100)',
        '',
        '- [ ] Step 1: not done · [#999](https://example.com)',
        '',
      ].join('\n'),
    );
    const findings = walkWorkplans({
      projectRoot: root,
      config: configWithVersion(),
    });
    expect(findings).toEqual([]);
  });
});
