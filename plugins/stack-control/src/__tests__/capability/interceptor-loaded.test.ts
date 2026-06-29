// 028 US4 T116 — interceptor-loaded smoke assertions (FR-035; contract T7; SC-007).
//
// The teeth are only real if the PreToolUse interceptor is BOTH registered (auto-
// discovered via the plugin manifest) AND fires. This test pins:
//   1. Registration — hooks/hooks.json declares PreToolUse Bash+Skill → bin/intercept,
//      AND .claude-plugin/plugin.json wires hooks/hooks.json (closing AUDIT-20260618-73).
//   2. Firing — feeding bin/intercept a fronted-backend-no-marker payload emits the
//      `deny` hookSpecificOutput; a non-backend payload permits (no deny output).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const HOOKS_JSON = join(PLUGIN_ROOT, 'hooks', 'hooks.json');
const PLUGIN_JSON = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const INTERCEPT = join(PLUGIN_ROOT, 'bin', 'intercept');

interface HookEntry {
  readonly matcher: string;
  readonly hooks: ReadonlyArray<{ readonly type: string; readonly command: string }>;
}

function asString(v: unknown): string {
  if (typeof v !== 'string') throw new Error(`expected a string, got ${typeof v}`);
  return v;
}

/** Read a property off an unknown value, treating a non-object as an empty record —
 *  no `as` cast (Object.getOwnPropertyDescriptor handles the unknown safely). */
function prop(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/** Narrow one raw PreToolUse entry into a typed HookEntry without an `as` cast. */
function toHookEntry(raw: unknown): HookEntry {
  const innerRaw = prop(raw, 'hooks');
  if (!Array.isArray(innerRaw)) throw new Error('hook entry has no hooks array');
  const hooks = innerRaw.map((h: unknown) => ({
    type: asString(prop(h, 'type')),
    command: asString(prop(h, 'command')),
  }));
  return { matcher: asString(prop(raw, 'matcher')), hooks };
}

function readHooks(): readonly HookEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(HOOKS_JSON, 'utf8'));
  const preRaw = prop(prop(parsed, 'hooks'), 'PreToolUse');
  if (!Array.isArray(preRaw)) throw new Error('hooks.json has no PreToolUse array');
  return preRaw.map(toHookEntry);
}

/** Run bin/intercept feeding `payload` on stdin; return stdout + exit. */
function runIntercept(payload: unknown): { stdout: string; status: number | null } {
  const r = spawnSync(INTERCEPT, [], { input: JSON.stringify(payload), encoding: 'utf8' });
  return { stdout: r.stdout ?? '', status: r.status };
}

describe('interceptor-loaded (028 T116; T7 / FR-035 / SC-007)', () => {
  it('registration: hooks.json declares PreToolUse Bash+Skill → bin/intercept', () => {
    expect(existsSync(HOOKS_JSON)).toBe(true);
    const entries = readHooks();
    expect(entries.map((e) => e.matcher)).toEqual(['Bash', 'Skill']);
    for (const e of entries) {
      expect(e.hooks[0]?.type).toBe('command');
      expect(e.hooks[0]?.command).toBe('${CLAUDE_PLUGIN_ROOT}/bin/intercept');
    }
    expect(existsSync(INTERCEPT), 'bin/intercept must exist').toBe(true);
  });

  it('registration: plugin.json does NOT redundantly reference the auto-loaded hooks/hooks.json', () => {
    // Claude Code auto-loads the standard hooks/hooks.json from the plugin root. A
    // manifest.hooks reference to that SAME file double-registers it → a "Duplicate
    // hooks file detected" load error (regressed when CC began auto-loading; the
    // manifest key was added under AUDIT-20260618-73 before that, when it was required).
    // manifest.hooks must only reference ADDITIONAL hook files — none here — so the key
    // must be ABSENT. The auto-load still wires the interceptor (the firing tests below
    // exercise bin/intercept directly and are unaffected).
    const manifest: unknown = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8'));
    expect(typeof manifest).toBe('object');
    const hooksRef = prop(manifest, 'hooks');
    expect(hooksRef, 'plugin.json must NOT reference the auto-loaded hooks/hooks.json').not.toBe(
      './hooks/hooks.json',
    );
  });

  it('firing: a fronted backend (Bash `backlog capture`) with NO marker emits deny', () => {
    const { stdout, status } = runIntercept({
      tool_name: 'Bash',
      tool_input: { command: 'backlog capture "x" --type bug' },
      session_id: 'sess-interceptor-loaded',
      cwd: PLUGIN_ROOT,
    });
    expect(status).toBe(0); // a PreToolUse hook always exits 0; the verdict is in stdout
    const parsed: unknown = JSON.parse(stdout);
    const decision = prop(prop(parsed, 'hookSpecificOutput'), 'permissionDecision');
    expect(decision).toBe('deny');
  });

  it('firing: a non-backend (Bash `ls -la`) permits (no deny output)', () => {
    const { stdout, status } = runIntercept({
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
      session_id: 'sess-interceptor-loaded',
      cwd: PLUGIN_ROOT,
    });
    expect(status).toBe(0);
    // A permit emits no deny JSON (the pre-filter short-circuits before any stackctl spawn).
    expect(stdout.includes('"permissionDecision":"deny"')).toBe(false);
    expect(stdout.includes('"deny"')).toBe(false);
  });
});
