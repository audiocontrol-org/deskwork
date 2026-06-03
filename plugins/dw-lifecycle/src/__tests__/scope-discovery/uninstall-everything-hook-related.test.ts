import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  removeManagedBlock,
  uninstallEverythingHookRelated,
  HOOK_BEGIN_MARKER,
  HOOK_END_MARKER,
} from '../../scope-discovery/uninstall-everything-hook-related.js';

describe('removeManagedBlock — pure-fn', () => {
  it('returns null when no managed block is present', () => {
    const contents = '#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n';
    expect(removeManagedBlock(contents)).toBeNull();
  });

  it('removes a single managed block + strips surrounding blank line', () => {
    const contents = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      '',
      HOOK_BEGIN_MARKER,
      '# Managed by install-scope-discovery-hooks',
      'dw-lifecycle check-clones --gate-mode',
      HOOK_END_MARKER,
      '',
      'exit 0',
      '',
    ].join('\n');
    const result = removeManagedBlock(contents);
    expect(result).not.toBeNull();
    expect(result).not.toContain(HOOK_BEGIN_MARKER);
    expect(result).not.toContain(HOOK_END_MARKER);
    expect(result).not.toContain('dw-lifecycle check-clones');
    expect(result).toContain('#!/usr/bin/env bash');
    expect(result).toContain('exit 0');
  });

  it('preserves operator-authored content outside the managed block', () => {
    const contents = [
      '#!/usr/bin/env bash',
      '# Operator note: keep this',
      'operator_command_one',
      '',
      HOOK_BEGIN_MARKER,
      'dw-lifecycle check-clones --gate-mode',
      HOOK_END_MARKER,
      '',
      'operator_command_two',
    ].join('\n');
    const result = removeManagedBlock(contents);
    expect(result).toContain('Operator note: keep this');
    expect(result).toContain('operator_command_one');
    expect(result).toContain('operator_command_two');
    expect(result).not.toContain('dw-lifecycle check-clones');
  });

  it('refuses on duplicated begin marker (returns null so operator inspects manually)', () => {
    const contents = [
      '#!/usr/bin/env bash',
      HOOK_BEGIN_MARKER,
      HOOK_BEGIN_MARKER,
      'malformed',
      HOOK_END_MARKER,
    ].join('\n');
    expect(removeManagedBlock(contents)).toBeNull();
  });

  it('returns null when end marker is missing', () => {
    const contents = [
      '#!/usr/bin/env bash',
      HOOK_BEGIN_MARKER,
      'incomplete',
    ].join('\n');
    expect(removeManagedBlock(contents)).toBeNull();
  });

  // AUDIT-20260603-81 regression-lock: removeManagedBlock must NOT
  // collapse blank-line runs anywhere OUTSIDE the splice point. The
  // operator-authored section can legitimately contain 3+ consecutive
  // newlines as a visual separator; verbatim preservation requires
  // leaving those runs intact.
  it('preserves operator-authored 3+ newline runs OUTSIDE the splice point (AUDIT-81)', () => {
    const operatorSection = [
      '#!/usr/bin/env bash',
      'operator_command_one',
      '',
      '',
      '',
      'operator_command_two',
    ].join('\n');
    const withBlock = [
      operatorSection,
      '',
      HOOK_BEGIN_MARKER,
      'managed',
      HOOK_END_MARKER,
      '',
      'operator_command_three',
    ].join('\n');
    const result = removeManagedBlock(withBlock);
    // The 3-newline run between operator_command_one and operator_command_two
    // is operator-authored; preserve it verbatim.
    expect(result).toContain('operator_command_one\n\n\n\noperator_command_two');
    // The managed block is gone.
    expect(result).not.toContain('managed');
    expect(result).not.toContain(HOOK_BEGIN_MARKER);
  });
});

describe('uninstallEverythingHookRelated — orchestrator', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'uninstall-hook-test-'));
    mkdirSync(join(repoRoot, '.husky'), { recursive: true });
    mkdirSync(join(repoRoot, '.dw-lifecycle/scope-discovery'), { recursive: true });
  });

  it('dry-run reports without mutating', async () => {
    writeFileSync(
      join(repoRoot, '.husky/pre-commit'),
      `#!/usr/bin/env bash\n${HOOK_BEGIN_MARKER}\ndw-lifecycle x\n${HOOK_END_MARKER}\nexit 0\n`,
    );
    const before = readFileSync(join(repoRoot, '.husky/pre-commit'), 'utf8');
    const report = await uninstallEverythingHookRelated({ repoRoot, apply: false });
    expect(report.apply).toBe(false);
    const action = report.actions.find((a) => a.path === '.husky/pre-commit');
    expect(action?.action).toBe('block-removed');
    // File on disk unchanged in dry-run
    expect(readFileSync(join(repoRoot, '.husky/pre-commit'), 'utf8')).toBe(before);
  });

  it('apply removes managed block + writes file back', async () => {
    writeFileSync(
      join(repoRoot, '.husky/pre-push'),
      `#!/usr/bin/env bash\n${HOOK_BEGIN_MARKER}\ndw-lifecycle y\n${HOOK_END_MARKER}\nexit 0\n`,
    );
    await uninstallEverythingHookRelated({ repoRoot, apply: true });
    const after = readFileSync(join(repoRoot, '.husky/pre-push'), 'utf8');
    expect(after).not.toContain(HOOK_BEGIN_MARKER);
    expect(after).not.toContain('dw-lifecycle y');
    expect(after).toContain('#!/usr/bin/env bash');
    expect(after).toContain('exit 0');
  });

  it('apply deletes hooks-installed.json + last-hook-run.json + hook-run-log.jsonl when present', async () => {
    writeFileSync(join(repoRoot, '.dw-lifecycle/scope-discovery/hooks-installed.json'), '{}');
    writeFileSync(join(repoRoot, '.dw-lifecycle/scope-discovery/last-hook-run.json'), '{}');
    writeFileSync(join(repoRoot, '.dw-lifecycle/scope-discovery/hook-run-log.jsonl'), '');
    const report = await uninstallEverythingHookRelated({ repoRoot, apply: true });
    expect(existsSync(join(repoRoot, '.dw-lifecycle/scope-discovery/hooks-installed.json'))).toBe(
      false,
    );
    expect(existsSync(join(repoRoot, '.dw-lifecycle/scope-discovery/last-hook-run.json'))).toBe(
      false,
    );
    expect(existsSync(join(repoRoot, '.dw-lifecycle/scope-discovery/hook-run-log.jsonl'))).toBe(
      false,
    );
    const deleted = report.actions.filter((a) => a.action === 'file-deleted');
    expect(deleted.length).toBe(3);
  });

  it('reports `not-present` for husky files that do not exist', async () => {
    const report = await uninstallEverythingHookRelated({ repoRoot, apply: true });
    const huskyActions = report.actions.filter((a) => a.path.startsWith('.husky/'));
    expect(huskyActions.every((a) => a.action === 'not-present')).toBe(true);
  });

  it('reports `no-managed-block` for husky files without dw-lifecycle markers', async () => {
    writeFileSync(
      join(repoRoot, '.husky/commit-msg'),
      '#!/usr/bin/env bash\noperator_content_only\nexit 0\n',
    );
    const report = await uninstallEverythingHookRelated({ repoRoot, apply: true });
    const action = report.actions.find((a) => a.path === '.husky/commit-msg');
    expect(action?.action).toBe('no-managed-block');
    // File preserved verbatim
    expect(readFileSync(join(repoRoot, '.husky/commit-msg'), 'utf8')).toContain(
      'operator_content_only',
    );
  });

  it('mixed scenario: one hook has managed block, one is plain, one missing; apply produces correct delta', async () => {
    writeFileSync(
      join(repoRoot, '.husky/pre-commit'),
      `#!/usr/bin/env bash\n${HOOK_BEGIN_MARKER}\nmanaged\n${HOOK_END_MARKER}\n`,
    );
    writeFileSync(join(repoRoot, '.husky/pre-push'), '#!/usr/bin/env bash\nplain\n');
    // commit-msg absent
    const report = await uninstallEverythingHookRelated({ repoRoot, apply: true });
    const byPath = new Map(report.actions.map((a) => [a.path, a.action]));
    expect(byPath.get('.husky/pre-commit')).toBe('block-removed');
    expect(byPath.get('.husky/pre-push')).toBe('no-managed-block');
    expect(byPath.get('.husky/commit-msg')).toBe('not-present');
  });
});
