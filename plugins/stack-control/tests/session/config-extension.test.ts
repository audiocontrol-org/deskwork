// 011 T001-T003 (RED-first) — session-skills extends 009's shared config port
// with three working-file keys it OWNS: journal, tooling_feedback, clone_scope.
// This is the additive change 009's managed set is declared to allow (009 FR-001;
// constitution Principle II — a second real consumer of the port). The keys reuse
// 009's resolution + validation verbatim (no new validation kind). See
// specs/011-session-skills/contracts/session-config-extension.md.

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolvePaths } from '../../src/config/resolve-paths.js';
import { parseInstallationConfig } from '../../src/config/config-loader.js';
import { InstallationError } from '../../src/config/errors.js';

const ROOT = '/tmp/sc-session-root';

describe('config extension — audience-split defaults for the three session keys', () => {
  it('journal + tooling_feedback default to human docs at the installation root; clone_scope to the root dir', () => {
    const r = resolvePaths(ROOT, { version: 1 });
    expect(r.journal).toBe(join(ROOT, 'DEVELOPMENT-NOTES.md'));
    expect(r.toolingFeedback).toBe(join(ROOT, 'tooling-feedback.md'));
    expect(r.cloneScope).toBe(ROOT); // `.` → the installation root subtree
  });

  it('a custom base_dir does NOT move the human docs or the clone scope (root-anchored)', () => {
    const r = resolvePaths(ROOT, { version: 1, baseDir: 'internal' });
    expect(r.journal).toBe(join(ROOT, 'DEVELOPMENT-NOTES.md'));
    expect(r.toolingFeedback).toBe(join(ROOT, 'tooling-feedback.md'));
    expect(r.cloneScope).toBe(ROOT);
  });
});

describe('config extension — per-file overrides honored', () => {
  it('per-file overrides beat the defaults for all three keys', () => {
    const r = resolvePaths(ROOT, {
      version: 1,
      paths: {
        journal: 'docs/JOURNAL.md',
        toolingFeedback: 'docs/friction.md',
        cloneScope: 'plugins/stack-control',
      },
    });
    expect(r.journal).toBe(join(ROOT, 'docs', 'JOURNAL.md'));
    expect(r.toolingFeedback).toBe(join(ROOT, 'docs', 'friction.md'));
    expect(r.cloneScope).toBe(join(ROOT, 'plugins', 'stack-control'));
  });

  it('an override that escapes the root is refused (FR-024, same rule as 009)', () => {
    expect(() => resolvePaths(ROOT, { version: 1, paths: { journal: '../outside.md' } })).toThrow(
      InstallationError,
    );
  });
});

describe('config extension — loader accepts the three wire keys (snake → camel)', () => {
  it('translates journal / tooling_feedback / clone_scope to camelCase', () => {
    const cfg = parseInstallationConfig(
      'version: 1\npaths:\n  journal: DEVELOPMENT-NOTES.md\n  tooling_feedback: tf.md\n  clone_scope: plugins/stack-control\n',
      'test',
    );
    expect(cfg.paths?.journal).toBe('DEVELOPMENT-NOTES.md');
    expect(cfg.paths?.toolingFeedback).toBe('tf.md');
    expect(cfg.paths?.cloneScope).toBe('plugins/stack-control');
  });

  it('still rejects a genuinely unknown paths key (no silent ignore)', () => {
    expect(() => parseInstallationConfig('version: 1\npaths:\n  bogus: x\n', 'test')).toThrow(
      InstallationError,
    );
  });
});
