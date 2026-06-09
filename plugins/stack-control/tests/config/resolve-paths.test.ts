// 009 T005 (RED-first) — resolvePaths: precedence (per-file override > base_dir >
// audience-split default), within-root containment, cross-key collision refusal,
// and root-escape refusal (FR-024). Pure function over (root, config).

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolvePaths } from '../../src/config/resolve-paths.js';
import { InstallationError } from '../../src/config/errors.js';

const ROOT = '/tmp/sc-root';

describe('resolvePaths — audience-split defaults', () => {
  it('resolves human docs at the root and internal stores under .stack-control', () => {
    const r = resolvePaths(ROOT, { version: 1 });
    expect(r.config).toBe(join(ROOT, '.stack-control', 'config.yaml'));
    expect(r.roadmap).toBe(join(ROOT, 'ROADMAP.md'));
    expect(r.inbox).toBe(join(ROOT, 'DESIGN-INBOX.md'));
    expect(r.backlog).toBe(join(ROOT, '.stack-control', 'backlog'));
    expect(r.auditLog).toBe(join(ROOT, '.stack-control', 'audit-log.md'));
  });

  it('honors a custom base_dir for internal stores only (human docs stay at root)', () => {
    const r = resolvePaths(ROOT, { version: 1, baseDir: 'internal' });
    expect(r.backlog).toBe(join(ROOT, 'internal', 'backlog'));
    expect(r.auditLog).toBe(join(ROOT, 'internal', 'audit-log.md'));
    expect(r.roadmap).toBe(join(ROOT, 'ROADMAP.md'));
    // config marker is fixed at .stack-control regardless of base_dir
    expect(r.config).toBe(join(ROOT, '.stack-control', 'config.yaml'));
  });
});

describe('resolvePaths — per-file override precedence', () => {
  it('a per-file override beats base_dir and the default', () => {
    const r = resolvePaths(ROOT, {
      version: 1,
      baseDir: 'internal',
      paths: { roadmap: 'docs/ROADMAP.md', inbox: 'notes/DESIGN-INBOX.md', backlog: 'store/bl' },
    });
    expect(r.roadmap).toBe(join(ROOT, 'docs', 'ROADMAP.md'));
    expect(r.inbox).toBe(join(ROOT, 'notes', 'DESIGN-INBOX.md'));
    expect(r.backlog).toBe(join(ROOT, 'store', 'bl'));
    // unset key still uses base_dir default
    expect(r.auditLog).toBe(join(ROOT, 'internal', 'audit-log.md'));
  });
});

describe('resolvePaths — FR-024 containment & collision', () => {
  it('refuses a per-file override that escapes the root (..)', () => {
    expect(() =>
      resolvePaths(ROOT, { version: 1, paths: { roadmap: '../escape/ROADMAP.md' } }),
    ).toThrow(InstallationError);
  });

  it('refuses a base_dir that escapes the root', () => {
    expect(() => resolvePaths(ROOT, { version: 1, baseDir: '../outside' })).toThrow(/escape|within/i);
  });

  it('refuses an absolute override outside the root', () => {
    expect(() =>
      resolvePaths(ROOT, { version: 1, paths: { roadmap: '/etc/ROADMAP.md' } }),
    ).toThrow(InstallationError);
  });

  it('an escape error carries code "escape"', () => {
    try {
      resolvePaths(ROOT, { version: 1, paths: { roadmap: '../x.md' } });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as InstallationError).code).toBe('escape');
    }
  });

  it('refuses two keys resolving to the same path (collision)', () => {
    expect(() =>
      resolvePaths(ROOT, {
        version: 1,
        paths: { roadmap: 'SHARED.md', inbox: 'SHARED.md' },
      }),
    ).toThrow(InstallationError);
  });

  it('a collision error carries code "collision"', () => {
    try {
      resolvePaths(ROOT, { version: 1, paths: { roadmap: 'SHARED.md', inbox: 'SHARED.md' } });
      throw new Error('expected throw');
    } catch (err) {
      expect((err as InstallationError).code).toBe('collision');
    }
  });

  it('accepts an absolute override that IS within the root', () => {
    const r = resolvePaths(ROOT, { version: 1, paths: { roadmap: join(ROOT, 'docs', 'R.md') } });
    expect(r.roadmap).toBe(join(ROOT, 'docs', 'R.md'));
  });
});
