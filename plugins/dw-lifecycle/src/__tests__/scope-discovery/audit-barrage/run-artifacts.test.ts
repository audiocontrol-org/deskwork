/**
 * Tests for run-artifacts helpers.
 *
 * Pure-ish helpers exercised against on-disk tmpdir fixtures (project
 * rule: no fs mocks).
 */

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createRunDir,
  encodeTimestamp,
  generateRunDirName,
  renderIndexBody,
  safeModelName,
  writeIndexFile,
  writePromptFile,
} from '../../../scope-discovery/audit-barrage/run-artifacts.js';
import type { BarrageRun } from '../../../scope-discovery/audit-barrage/types.js';

describe('encodeTimestamp', () => {
  it('renders ISO basic format with millisecond resolution', () => {
    const stamp = encodeTimestamp(new Date('2026-05-28T12:34:56.789Z'));
    expect(stamp).toBe('20260528T123456789Z');
  });

  it('zero-pads the millisecond component', () => {
    const stamp = encodeTimestamp(new Date('2026-05-28T12:34:56.001Z'));
    expect(stamp).toBe('20260528T123456001Z');
  });

  it('emits 000 ms for whole-second Dates', () => {
    const stamp = encodeTimestamp(new Date('2026-05-28T12:34:56.000Z'));
    expect(stamp).toBe('20260528T123456000Z');
  });

  // AUDIT-20260529-07 — millisecond resolution prevents the collision
  // shape where two runs in the same wall-clock second produced the
  // same run-dir name + silently overwrote each other.
  it('distinguishes Dates that differ only in their millisecond field', () => {
    const a = encodeTimestamp(new Date('2026-05-28T12:34:56.001Z'));
    const b = encodeTimestamp(new Date('2026-05-28T12:34:56.002Z'));
    expect(a).not.toBe(b);
  });
});

describe('safeModelName', () => {
  it('passes alphanumerics and hyphens through unchanged', () => {
    expect(safeModelName('claude')).toBe('claude');
    expect(safeModelName('codex-cli')).toBe('codex-cli');
    expect(safeModelName('gemini2')).toBe('gemini2');
  });

  it('substitutes underscores for path-traversal characters', () => {
    expect(safeModelName('../claude')).toBe('___claude');
    expect(safeModelName('foo/bar')).toBe('foo_bar');
  });

  it('substitutes underscores for whitespace and shell-meaningful characters', () => {
    expect(safeModelName('my model')).toBe('my_model');
    expect(safeModelName('model$1')).toBe('model_1');
  });
});

describe('generateRunDirName', () => {
  it('combines millisecond-resolution timestamp and sanitized slug with a hyphen', () => {
    const name = generateRunDirName(
      new Date('2026-05-28T12:34:56.789Z'),
      'scope-discovery',
    );
    expect(name).toBe('20260528T123456789Z-scope-discovery');
  });

  it('sanitizes operator-supplied slug', () => {
    const name = generateRunDirName(
      new Date('2026-05-28T12:34:56.000Z'),
      'feature/with-slash',
    );
    expect(name).toBe('20260528T123456000Z-feature_with-slash');
  });
});

describe('createRunDir + writePromptFile + writeIndexFile', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'audit-barrage-run-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('creates the run dir and stderr/ subdir', async () => {
    const runDir = await createRunDir(tmp, '20260528T120000Z-test');
    const dirStat = await stat(runDir);
    expect(dirStat.isDirectory()).toBe(true);
    const stderrStat = await stat(join(runDir, 'stderr'));
    expect(stderrStat.isDirectory()).toBe(true);
  });

  it('is idempotent over an existing dir', async () => {
    const runDir = await createRunDir(tmp, '20260528T120000Z-test');
    const again = await createRunDir(tmp, '20260528T120000Z-test');
    expect(again).toBe(runDir);
  });

  it('writes PROMPT.md verbatim', async () => {
    const runDir = await createRunDir(tmp, '20260528T120000Z-test');
    const promptPath = await writePromptFile(runDir, 'audit prompt body\nwith newlines\n');
    const text = await readFile(promptPath, 'utf8');
    expect(text).toBe('audit prompt body\nwith newlines\n');
  });

  it('writes INDEX.md with per-model rows in configured order', async () => {
    const runDir = await createRunDir(tmp, '20260528T120000Z-test');
    const run: BarrageRun = {
      runDir,
      timestamp: '20260528T120000Z',
      featureSlug: 'sample',
      promptPath: join(runDir, 'PROMPT.md'),
      indexPath: join(runDir, 'INDEX.md'),
      results: [
        {
          name: 'claude',
          exitCode: 0,
          durationMs: 1234,
          stdoutBytes: 17,
          stderrBytes: 0,
          stdoutPath: join(runDir, 'claude.md'),
          stderrPath: join(runDir, 'stderr', 'claude.txt'),
          timedOut: false,
        },
        {
          name: 'codex',
          exitCode: -2,
          durationMs: 2,
          stdoutBytes: 0,
          stderrBytes: 0,
          stdoutPath: join(runDir, 'codex.md'),
          stderrPath: join(runDir, 'stderr', 'codex.txt'),
          timedOut: false,
          spawnError: 'spawn ENOENT',
        },
      ],
    };
    const indexPath = await writeIndexFile(runDir, run);
    const body = await readFile(indexPath, 'utf8');
    expect(body).toBe(renderIndexBody(run));
    expect(body).toContain('### claude');
    expect(body).toContain('### codex');
    expect(body).toContain('- exit code: 0');
    expect(body).toContain('- exit code: -2');
    expect(body).toContain('- spawn error: spawn ENOENT');
    expect(body).toContain('- timed out: no');
    // Order check: claude row must appear before codex row.
    const claudeIdx = body.indexOf('### claude');
    const codexIdx = body.indexOf('### codex');
    expect(claudeIdx).toBeGreaterThan(-1);
    expect(codexIdx).toBeGreaterThan(claudeIdx);
  });

  it('omits the spawn-error row when no spawn error occurred', () => {
    const body = renderIndexBody({
      runDir: '/tmp/x',
      timestamp: '20260528T120000Z',
      featureSlug: 'sample',
      promptPath: '/tmp/x/PROMPT.md',
      indexPath: '/tmp/x/INDEX.md',
      results: [
        {
          name: 'claude',
          exitCode: 0,
          durationMs: 1,
          stdoutBytes: 5,
          stderrBytes: 0,
          stdoutPath: '/tmp/x/claude.md',
          stderrPath: '/tmp/x/stderr/claude.txt',
          timedOut: false,
        },
      ],
    });
    expect(body).not.toContain('spawn error:');
  });
});
