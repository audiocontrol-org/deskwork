import { describe, expect, it } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkpointPath,
  computeScopeFingerprint,
  isCheckpointFresh,
  readPhaseCheckpoint,
  writePhaseCheckpoint,
} from '../../govern/checkpoint-state.js';

describe('phase checkpoint persistence', () => {
  it('writes and reads a durable checkpoint record under the installation root', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
      writeFileSync(join(root, 'src', 'b.ts'), 'export const b = 2;\n', 'utf8');
      const record = {
        version: 1 as const,
        featureSlug: '021-audit-protocol-friction-burndown',
        phaseId: '2',
        checkpoint: 'phase-2',
        auditLogSection: 'phase-2',
        scopeFingerprint: computeScopeFingerprint(root, ['src/a.ts', 'src/b.ts']),
        passedAt: '2026-06-13T21:00:00Z',
        governedPaths: ['src/a.ts', 'src/b.ts'],
      };
      const path = writePhaseCheckpoint(root, record);
      expect(path).toBe(
        checkpointPath(root, '021-audit-protocol-friction-burndown', '2'),
      );
      expect(readFileSync(path, 'utf8')).toContain('"checkpoint": "phase-2"');
      expect(readPhaseCheckpoint(root, record.featureSlug, record.phaseId)).toEqual(record);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('marks a checkpoint stale when the scope fingerprint changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    const fresh = {
      version: 1 as const,
      featureSlug: 'feat',
      phaseId: '1',
      checkpoint: 'phase-1',
      auditLogSection: 'phase-1',
      scopeFingerprint: computeScopeFingerprint(root, ['src/a.ts']),
      passedAt: '2026-06-13T21:00:00Z',
      governedPaths: ['src/a.ts'],
    };
    expect(
      isCheckpointFresh(fresh, {
        version: 1,
        checkpoint: 'phase-1',
        auditLogSection: 'phase-1',
        scopeFingerprint: computeScopeFingerprint(root, ['src/a.ts']),
      }),
    ).toBe(true);
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 2;\n', 'utf8');
    expect(
      isCheckpointFresh(fresh, {
        version: 1,
        checkpoint: 'phase-1',
        auditLogSection: 'phase-1',
        scopeFingerprint: computeScopeFingerprint(root, ['src/a.ts']),
      }),
    ).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('marks a checkpoint stale when the checkpoint contract changes even if the scope fingerprint matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    const scopeFingerprint = computeScopeFingerprint(root, ['src/a.ts']);
    const record = {
      version: 1 as const,
      featureSlug: 'feat',
      phaseId: '1',
      checkpoint: 'phase-1',
      auditLogSection: 'phase-1',
      scopeFingerprint,
      passedAt: '2026-06-13T21:00:00Z',
      governedPaths: ['src/a.ts'],
    };
    expect(
      isCheckpointFresh(record, {
        checkpoint: 'phase-1',
        auditLogSection: 'phase-1',
        version: 1,
        scopeFingerprint,
      }),
    ).toBe(true);
    expect(
      isCheckpointFresh(record, {
        checkpoint: 'phase-1b',
        auditLogSection: 'phase-1',
        version: 1,
        scopeFingerprint,
      }),
    ).toBe(false);
    expect(
      isCheckpointFresh(record, {
        checkpoint: 'phase-1',
        auditLogSection: 'phase-1b',
        version: 1,
        scopeFingerprint,
      }),
    ).toBe(false);
    expect(
      isCheckpointFresh(record, {
        checkpoint: 'phase-1',
        auditLogSection: 'phase-1',
        version: 2,
        scopeFingerprint,
      }),
    ).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it('does not stale a checkpoint when only an unrelated revision marker changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    expect(computeScopeFingerprint(root, ['src/a.ts'])).toBe(
      computeScopeFingerprint(root, ['src/a.ts']),
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('hashes directory scopes deterministically from their children', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    mkdirSync(join(root, 'src', 'govern'), { recursive: true });
    writeFileSync(join(root, 'src', 'govern', 'a.ts'), 'export const a = 1;\n', 'utf8');
    const first = computeScopeFingerprint(root, ['src/govern']);
    writeFileSync(join(root, 'src', 'govern', 'b.ts'), 'export const b = 2;\n', 'utf8');
    expect(computeScopeFingerprint(root, ['src/govern'])).not.toBe(first);
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects governed paths that escape the installation root', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    expect(() => computeScopeFingerprint(root, ['../escape'])).toThrow(/dot segments|escapes the installation root/);
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects an empty governed path set instead of producing a reusable fingerprint', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    expect(() => computeScopeFingerprint(root, [])).toThrow(/at least one governed path/);
    // Entries that canonicalize away (empty strings, bare separators) collapse to
    // an empty scope and must fail the same way — never hash to the stable digest of nothing.
    expect(() => computeScopeFingerprint(root, [''])).toThrow(/at least one governed path/);
    expect(() => computeScopeFingerprint(root, ['/', ''])).toThrow(/at least one governed path/);
    rmSync(root, { recursive: true, force: true });
  });

  it('dedupes descendant paths when an ancestor directory is already governed', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'README.md'), 'hi\n', 'utf8');
    expect(computeScopeFingerprint(root, ['docs'])).toBe(
      computeScopeFingerprint(root, ['docs', 'docs/README.md']),
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('normalizes path separators before deduping and hashing scope paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'README.md'), 'hi\n', 'utf8');
    expect(computeScopeFingerprint(root, ['docs'])).toBe(
      computeScopeFingerprint(root, ['docs\\README.md', 'docs']),
    );
    expect(computeScopeFingerprint(root, ['docs/README.md'])).toBe(
      computeScopeFingerprint(root, ['docs\\README.md']),
    );
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects symlinked governed paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'target.ts'), 'export const T = 1;\n', 'utf8');
    require('node:fs').symlinkSync(join(root, 'target.ts'), join(root, 'src', 'linked.ts'));
    expect(() => computeScopeFingerprint(root, ['src/linked.ts'])).toThrow(/must not be a symlink/);
    rmSync(root, { recursive: true, force: true });
  });

  it('rejects governed paths whose intermediate directory is a symlink outside the installation root', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    const outside = mkdtempSync(join(tmpdir(), 'checkpoint-outside-'));
    try {
      mkdirSync(join(root, 'src'), { recursive: true });
      mkdirSync(join(outside, 'target'), { recursive: true });
      writeFileSync(join(outside, 'target', 'outside.ts'), 'export const T = 1;\n', 'utf8');
      symlinkSync(join(outside, 'target'), join(root, 'src', 'linked-dir'), 'dir');
      expect(() => computeScopeFingerprint(root, ['src/linked-dir/outside.ts'])).toThrow(
        /must not be a symlink|escapes the installation root/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('rejects a checkpoint record whose stored identity does not match the requested phase', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    try {
      const path = checkpointPath(root, 'feat', '1');
      mkdirSync(join(root, '.stack-control', 'govern', 'phase-checkpoints', 'feat'), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({
          version: 1,
          featureSlug: 'feat',
          phaseId: '2',
          checkpoint: 'phase-2',
          auditLogSection: 'phase-2',
          scopeFingerprint: 'abc',
          passedAt: '2026-06-13T21:00:00Z',
          governedPaths: ['src/a.ts'],
        }),
        'utf8',
      );
      expect(() => readPhaseCheckpoint(root, 'feat', '1')).toThrow(/phaseId mismatch/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails loud on a corrupt checkpoint file', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    try {
      const path = checkpointPath(root, 'feat', '1');
      mkdirSync(join(root, '.stack-control', 'govern', 'phase-checkpoints', 'feat'), { recursive: true });
      writeFileSync(path, '{"version": 1,', 'utf8');
      expect(() => readPhaseCheckpoint(root, 'feat', '1')).toThrow(/corrupt or torn/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects governed paths containing dot segments', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    try {
      expect(() => computeScopeFingerprint(root, ['.'])).toThrow(/must not be '\.' or '\.\.'/);
      expect(() => computeScopeFingerprint(root, ['src/../a.ts'])).toThrow(/must not contain dot segments/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects path-traversal-like slug or phase components', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    try {
      expect(() => checkpointPath(root, '../feat', '1')).toThrow(/path separators|dot segments/);
      expect(() => checkpointPath(root, 'feat', '../1')).toThrow(/path separators|dot segments/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses a unique staging path for repeated checkpoint writes', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    try {
      const record = {
        version: 1 as const,
        featureSlug: 'feat',
        phaseId: '1',
        checkpoint: 'phase-1',
        auditLogSection: 'phase-1',
        scopeFingerprint: 'abc',
        passedAt: '2026-06-13T21:00:00Z',
        governedPaths: ['src/a.ts'],
      };
      const first = writePhaseCheckpoint(root, record);
      const second = writePhaseCheckpoint(root, { ...record, passedAt: '2026-06-13T21:05:00Z' });
      expect(first).toBe(second);
      expect(readPhaseCheckpoint(root, 'feat', '1')?.passedAt).toBe('2026-06-13T21:05:00Z');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to read or write checkpoints through a symlinked governance directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    const outside = mkdtempSync(join(tmpdir(), 'checkpoint-outside-'));
    try {
      mkdirSync(join(root, '.stack-control'), { recursive: true });
      mkdirSync(join(outside, 'govern-root'), { recursive: true });
      symlinkSync(join(outside, 'govern-root'), join(root, '.stack-control', 'govern'), 'dir');
      const record = {
        version: 1 as const,
        featureSlug: 'feat',
        phaseId: '1',
        checkpoint: 'phase-1',
        auditLogSection: 'phase-1',
        scopeFingerprint: 'abc',
        passedAt: '2026-06-13T21:00:00Z',
        governedPaths: ['src/a.ts'],
      };
      expect(() => writePhaseCheckpoint(root, record)).toThrow(/storage path must not be a symlink/);
      expect(() => readPhaseCheckpoint(root, 'feat', '1')).toThrow(/storage path must not be a symlink/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses to read a checkpoint through a symlinked final checkpoint file', () => {
    const root = mkdtempSync(join(tmpdir(), 'checkpoint-state-'));
    const outside = mkdtempSync(join(tmpdir(), 'checkpoint-outside-'));
    try {
      const featureDir = join(root, '.stack-control', 'govern', 'phase-checkpoints', 'feat');
      mkdirSync(featureDir, { recursive: true });
      const outsideFile = join(outside, 'phase-1.json');
      writeFileSync(
        outsideFile,
        JSON.stringify({
          version: 1,
          featureSlug: 'feat',
          phaseId: '1',
          checkpoint: 'phase-1',
          auditLogSection: 'phase-1',
          scopeFingerprint: 'abc',
          passedAt: '2026-06-13T21:00:00Z',
          governedPaths: ['src/a.ts'],
        }),
        'utf8',
      );
      symlinkSync(outsideFile, join(featureDir, 'phase-1.json'));

      expect(() => readPhaseCheckpoint(root, 'feat', '1')).toThrow(/storage path must not be a symlink/);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
