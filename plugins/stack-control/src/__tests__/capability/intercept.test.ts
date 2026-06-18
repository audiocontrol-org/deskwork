// 026 T015 — RED tests for the interceptor logic (contracts/interceptor-hook.md, D7).
// Payload → decision mapping (Bash → tool_input.command; Skill → tool_input.skill — the
// field the live Claude Code PreToolUse payload actually carries; the original T002 spike
// recorded `skill_name`, falsified by the skill-surface-mediation live spike 2026-06-18),
// the cheap pre-filter, the deny-output shape, and the registry-derived Skill matcher
// pinned against the shipped hooks.json (FR-011, claude-04).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { denyOutput, interceptDecision } from '../../capability/intercept.js';

const noMarker = (): ReadonlySet<string> => new Set<string>();
const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

describe('interceptDecision (026 T015)', () => {
  it('refuses a raw Bash backend with no marker', () => {
    const d = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog list' }, session_id: 's', cwd: '/x' },
      { resolveActive: noMarker },
    );
    expect(d.verdict).toBe('refuse');
    expect(d.capability).toBe('backlog');
  });

  it('refuses a raw Skill backend from tool_input.skill (real Claude Code payload field)', () => {
    // The live skill-surface spike (2026-06-18) proved the PreToolUse `Skill` payload carries
    // the skill name in `tool_input.skill` — NOT `skill_name` (the falsified T002 conclusion).
    // Reading the wrong field extracted an empty identity → silent permit of every reach-around.
    const d = interceptDecision(
      { tool_name: 'Skill', tool_input: { skill: 'speckit-implement' }, session_id: 's', cwd: '/x' },
      { resolveActive: noMarker },
    );
    expect(d.verdict).toBe('refuse');
    expect(d.reason).toContain('/stack-control:execute');
  });

  it('permits a benign Skill (not a fronted backend) without resolving the marker (SC-003)', () => {
    let called = false;
    const d = interceptDecision(
      { tool_name: 'Skill', tool_input: { skill: 'feature-help' }, session_id: 's', cwd: '/x' },
      {
        resolveActive: () => {
          called = true;
          return new Set();
        },
      },
    );
    expect(d.verdict).toBe('permit');
    expect(called).toBe(false); // not a fronted backend → no marker resolution
  });

  it('permits a marked backend', () => {
    const d = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog list' }, session_id: 's', cwd: '/x' },
      { resolveActive: () => new Set(['backlog']) },
    );
    expect(d.verdict).toBe('permit');
  });

  it('permits a non-intercepted tool without resolving the marker', () => {
    let called = false;
    const d = interceptDecision(
      { tool_name: 'Write', tool_input: { file_path: 'x' }, session_id: 's', cwd: '/x' },
      {
        resolveActive: () => {
          called = true;
          return new Set();
        },
      },
    );
    expect(d.verdict).toBe('permit');
    expect(called).toBe(false);
  });

  it('cheap pre-filter: a command naming no backend permits without resolving the marker', () => {
    let called = false;
    const d = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'ls -la && git status' }, session_id: 's', cwd: '/x' },
      {
        resolveActive: () => {
          called = true;
          return new Set();
        },
      },
    );
    expect(d.verdict).toBe('permit');
    expect(called).toBe(false); // pre-filtered, no marker resolution
  });

  it('does NOT pre-filter (and correctly permits) a backend name used as a path arg', () => {
    const d = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'cat backlog.md' }, session_id: 's', cwd: '/x' },
      { resolveActive: noMarker },
    );
    expect(d.verdict).toBe('permit'); // SC-003: argv0 is `cat`, not `backlog`
  });
});

describe('denyOutput (026 T015)', () => {
  it('emits the PreToolUse deny shape', () => {
    const parsed = JSON.parse(denyOutput('use the front door'));
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toBe('use the front door');
  });
});

describe('hooks.json matchers are TOOL NAMES (026 T015 — Phase-3 audit claude-01/02)', () => {
  it('registers PreToolUse for the Bash and Skill TOOLS (matcher = tool name, not skill name)', () => {
    // The PreToolUse matcher filters on the tool name (docs: "Bash", "Edit|Write",
    // "mcp__.*"). A skill-name regex would match against the tool name "Skill" and never
    // fire — the inert-hook defect this asserts against. All skill-name filtering lives
    // in interceptDecision (registry-driven), tested above; the hook just routes the tools.
    const hooksPath = join(PLUGIN_ROOT, 'hooks', 'hooks.json');
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
    const entries = hooks.hooks.PreToolUse as Array<{ matcher: string; hooks: Array<{ command: string }> }>;
    expect(entries.map((e) => e.matcher)).toEqual(['Bash', 'Skill']);
    // every entry dispatches to the plugin's bin/intercept, which must exist (claude-02:
    // the file-level wiring; live hook REGISTRATION is the T018 install-time gate).
    for (const entry of entries) {
      expect(entry.hooks[0]!.command).toBe('${CLAUDE_PLUGIN_ROOT}/bin/intercept');
    }
    expect(existsSync(join(PLUGIN_ROOT, 'bin', 'intercept'))).toBe(true);
  });
});
