import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  walkToolingFeedback,
  __testing,
} from '../close-shipped/tooling-feedback-walker.js';
import { defaultConfig } from '../config.js';
import type { RunGit } from '../close-shipped/types.js';

function makeProject(): {
  readonly root: string;
  readonly slugDir: string;
  readonly tfPath: string;
} {
  const root = mkdtempSync(join(tmpdir(), 'close-shipped-tf-'));
  const slugDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'sample');
  mkdirSync(slugDir, { recursive: true });
  return { root, slugDir, tfPath: join(slugDir, 'tooling-feedback.md') };
}

function configWithVersion() {
  const cfg = defaultConfig();
  return {
    ...cfg,
    docs: { ...cfg.docs, knownVersions: ['1.0'] },
  };
}

function mockGit(reachable: ReadonlySet<string>): RunGit {
  return (args) => {
    if (args[0] === 'merge-base' && args[1] === '--is-ancestor') {
      const sha = args[2] ?? '';
      const ref = args[3] ?? '';
      if (ref === 'vTO' && reachable.has(sha)) return '';
      throw new Error('not-ancestor');
    }
    throw new Error(`unexpected: ${args.join(' ')}`);
  };
}

describe('STATUS_CLOSED_PATTERN', () => {
  it('matches "Status: Closed | <sha>"', () => {
    const m = __testing.STATUS_CLOSED_PATTERN.exec(
      'Status: Closed | abc1234\n',
    );
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe('abc1234');
  });

  it('matches case-insensitive Closed', () => {
    const m = __testing.STATUS_CLOSED_PATTERN.exec(
      'Status: closed | def5678\n',
    );
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe('def5678');
  });

  it('does not match Open status', () => {
    const m = __testing.STATUS_CLOSED_PATTERN.exec(
      'Status: Open\n',
    );
    expect(m).toBeNull();
  });
});

describe('extractTfIssue', () => {
  it('prefers Promoted to issue: #N over plain #N', () => {
    const text = 'see #99 here\nPromoted to issue: #42\n';
    expect(__testing.extractTfIssue(text)).toBe(42);
  });

  it('matches Tracked at: #N', () => {
    expect(__testing.extractTfIssue('Tracked at: #123')).toBe(123);
  });

  it('returns null when no issue association present', () => {
    expect(__testing.extractTfIssue('nothing relevant')).toBeNull();
  });
});

describe('walkToolingFeedback', () => {
  it('returns empty when no tooling-feedback.md exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'close-shipped-tf-empty-'));
    mkdirSync(join(root, 'docs', '1.0', '001-IN-PROGRESS', 'noTF'), {
      recursive: true,
    });
    const findings = walkToolingFeedback({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: () => '',
    });
    expect(findings).toEqual([]);
  });

  it('extracts Closed TF entries with reachable SHAs', () => {
    const { root, tfPath } = makeProject();
    writeFileSync(
      tfPath,
      [
        '# Tooling Feedback',
        '',
        '## TF-001 · MISC · medium · Some friction',
        '',
        'Status: Closed | abc1234',
        '',
        'Body line.',
        'Promoted to issue: #88',
        '',
        '## TF-002 · A · high · Other friction',
        '',
        'Status: Open',
        '',
      ].join('\n'),
    );
    const findings = walkToolingFeedback({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: mockGit(new Set(['abc1234'])),
    });
    expect(findings.length).toBe(1);
    const first = findings[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(first.source).toBe('tooling-feedback');
    expect(first.sha).toBe('abc1234');
    expect(first.issueNumber).toBe(88);
    expect(first.tfId).toBe('TF-001');
    expect(first.tfPath).toBe(tfPath);
  });

  it('skips Closed TF entries with unreachable SHAs', () => {
    const { root, tfPath } = makeProject();
    writeFileSync(
      tfPath,
      [
        '## TF-001 · MISC · low · old',
        'Status: Closed | deadbee',
        '',
        'Promoted to issue: #77',
      ].join('\n'),
    );
    const findings = walkToolingFeedback({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: mockGit(new Set<string>()),
    });
    expect(findings).toEqual([]);
  });

  it('surfaces null issueNumber when no issue association is present', () => {
    const { root, tfPath } = makeProject();
    writeFileSync(
      tfPath,
      [
        '## TF-001 · MISC · low · floating',
        'Status: Closed | aaaa111',
        '',
        'No issue association in body.',
      ].join('\n'),
    );
    const findings = walkToolingFeedback({
      projectRoot: root,
      config: configWithVersion(),
      fromTag: 'vFROM',
      toTag: 'vTO',
      runGit: mockGit(new Set(['aaaa111'])),
    });
    expect(findings.length).toBe(1);
    expect(findings[0]?.issueNumber).toBeNull();
  });
});
