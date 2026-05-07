/**
 * Hook script test for `plugins/deskwork/hooks/bridge-autostart.mjs`.
 *
 * The hook is a small Node script invoked by Claude Code at SessionStart.
 * Its contract:
 *   - Reads `<projectRoot>/.deskwork/config.json` (path comes from
 *     `CLAUDE_PROJECT_DIR` env var, falling back to cwd).
 *   - If `studioBridge.enabled === true`: prints a JSON directive on stdout
 *     instructing the agent to run /deskwork:listen.
 *   - Otherwise (flag false / missing / malformed config / missing file):
 *     prints nothing on stdout, exits 0.
 *
 * Tests spawn the script with a temp project root and assert stdout shape +
 * exit code. We use `node` directly (no shell), matching how Claude Code
 * invokes the `command` field via its hook runner.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'plugins',
  'deskwork',
  'hooks',
  'bridge-autostart.mjs',
);

interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
}

function runHook(projectRoot: string): RunResult {
  const result = spawnSync('node', [HOOK_PATH], {
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: projectRoot,
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

function withTempRoot(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'deskwork-hook-'));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeConfig(root: string, body: string): void {
  mkdirSync(join(root, '.deskwork'));
  writeFileSync(join(root, '.deskwork', 'config.json'), body, 'utf8');
}

describe('bridge-autostart SessionStart hook', () => {
  it('emits the listen directive when studioBridge.enabled is true', () => {
    withTempRoot((root) => {
      writeConfig(
        root,
        JSON.stringify({
          version: 1,
          sites: { main: { contentDir: 'content', calendarPath: 'cal.md' } },
          studioBridge: { enabled: true },
        }),
      );
      const r = runHook(root);
      expect(r.status).toBe(0);
      expect(r.stdout.trim().length).toBeGreaterThan(0);
      const parsed = JSON.parse(r.stdout) as Record<string, unknown>;
      const out = parsed['hookSpecificOutput'] as Record<string, unknown>;
      expect(out['hookEventName']).toBe('SessionStart');
      expect(typeof out['additionalContext']).toBe('string');
      expect(out['additionalContext']).toMatch(/\/deskwork:listen/);
    });
  });

  it('emits nothing when studioBridge.enabled is false', () => {
    withTempRoot((root) => {
      writeConfig(
        root,
        JSON.stringify({
          version: 1,
          sites: { main: { contentDir: 'content', calendarPath: 'cal.md' } },
          studioBridge: { enabled: false },
        }),
      );
      const r = runHook(root);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    });
  });

  it('emits nothing when studioBridge field is absent', () => {
    withTempRoot((root) => {
      writeConfig(
        root,
        JSON.stringify({
          version: 1,
          sites: { main: { contentDir: 'content', calendarPath: 'cal.md' } },
        }),
      );
      const r = runHook(root);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    });
  });

  it('emits nothing when .deskwork/config.json is missing', () => {
    withTempRoot((root) => {
      const r = runHook(root);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    });
  });

  it('exits silently on malformed JSON config', () => {
    withTempRoot((root) => {
      writeConfig(root, '{ invalid json');
      const r = runHook(root);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
      expect(r.stderr).toMatch(/malformed JSON/);
    });
  });

  it('emits nothing when studioBridge is not an object', () => {
    withTempRoot((root) => {
      writeConfig(
        root,
        JSON.stringify({
          version: 1,
          sites: { main: { contentDir: 'content', calendarPath: 'cal.md' } },
          studioBridge: 'enabled',
        }),
      );
      const r = runHook(root);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    });
  });

  it('emits nothing when studioBridge.enabled is the string "true"', () => {
    withTempRoot((root) => {
      writeConfig(
        root,
        JSON.stringify({
          version: 1,
          sites: { main: { contentDir: 'content', calendarPath: 'cal.md' } },
          studioBridge: { enabled: 'true' },
        }),
      );
      const r = runHook(root);
      expect(r.status).toBe(0);
      expect(r.stdout).toBe('');
    });
  });
});
