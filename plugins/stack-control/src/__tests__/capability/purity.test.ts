// 026 T026 + T028 — US4 capability-not-vendor purity + cross-vendor parity (FR-006/SC-005).
// The decision core branches on capability/identity ONLY — never vendor identity — and
// hardcodes no vendor path (`.claude/skills`). Adapters (Claude PreToolUse, Codex
// PreToolUse) are thin shells over the same `decideMediation`/`mediate-check`, so the same
// raw call yields an identical verdict regardless of which vendor's hook delivered it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decideMediation } from '../../capability/mediate.js';
import { CAPABILITY_REGISTRY } from '../../capability/registry.js';
import { runCli } from '../_run-helpers.js';
import { makeCapabilityFixture } from '../fixtures/capability-fixtures.js';

const CAP_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'capability');
const CORE = ['mediate.ts', 'identity.ts', 'registry.ts', 'intercept.ts'];

/** Strip line + block comments so the scan sees CODE only (audit-finding ids like
 *  `codex-01` and the word "Claude adapter" live in comments — not vendor branches). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('capability-not-vendor purity (026 T026, FR-006)', () => {
  it('the decision core hardcodes no vendor path (`.claude/skills`)', () => {
    for (const file of CORE) {
      expect(readFileSync(join(CAP_DIR, file), 'utf8'), `${file}`).not.toContain('.claude/skills');
    }
  });

  it('the decision core CODE branches on no vendor identity', () => {
    for (const file of CORE) {
      const code = stripComments(readFileSync(join(CAP_DIR, file), 'utf8'));
      for (const v of ['claude', 'codex', 'gemini', 'cursor', 'copilot']) {
        for (const vendor of [`'${v}'`, `"${v}"`]) {
          expect(code, `${file} must not branch on a vendor literal ${vendor}`).not.toContain(vendor);
        }
      }
    }
  });

  it('decideMediation is vendor-agnostic by construction (no vendor parameter; deterministic)', () => {
    const a = decideMediation(CAPABILITY_REGISTRY, 'bash', 'backlog list', new Set());
    const b = decideMediation(CAPABILITY_REGISTRY, 'bash', 'backlog list', new Set());
    expect(a).toEqual(b);
    expect(b.verdict).toBe('refuse'); // the registry-driven verdict, not any vendor's
  });
});

describe('cross-vendor parity (026 T028, SC-005)', () => {
  // Each adapter's REAL CLI verb entry, driven as a subprocess against the SAME installation:
  //   * Claude — `stackctl intercept`, reading a raw PreToolUse payload from stdin (the verb
  //     bin/intercept dispatches to). Always exits 0; a refusal is the deny JSON on stdout.
  //   * Codex — `stackctl mediate-check`, the argv verb its hook invokes per the contract
  //     (interceptor-hook.md § Codex adapter — Bash-only, D8). Permit→exit 0, refuse→exit 1.
  // Both must yield the same verdict + the same registry-sourced redirect reason. This drives
  // the real verb boundaries (payload/argv parse + exit-code mapping), not the pure cores the
  // prior test called directly (AUDIT-20260618-147). The payload→argv normalization a Codex
  // hook config performs is the external T027 live-integration gate, outside this unit.
  const CMD = 'backlog capture --type bug'; // MUTATING → mediation gates it, so the marker is load-bearing

  it('the same raw Bash backend call refuses identically across both adapters\' real verb entries', () => {
    const fx = makeCapabilityFixture(); // a real installation, NO marker → both must refuse
    try {
      const claude = runCli(['intercept'], {
        cwd: fx.root,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: CMD }, session_id: 'sess', cwd: fx.root }),
      });
      const codex = runCli(
        ['mediate-check', '--surface', 'bash', '--identity', CMD, '--session', 'sess', '--json'],
        { cwd: fx.root },
      );
      expect(claude.status, claude.stderr).toBe(0); // PreToolUse denies via stdout JSON, not exit code
      const deny = JSON.parse(claude.stdout).hookSpecificOutput;
      expect(deny.permissionDecision).toBe('deny');
      expect(codex.status, codex.stderr).toBe(1); // refuse → exit 1
      const codexDecision = JSON.parse(codex.stdout);
      expect(codexDecision.verdict).toBe('refuse');
      expect(deny.permissionDecisionReason).toBe(codexDecision.reason); // identical registry-sourced redirect
    } finally {
      fx.cleanup();
    }
  }, 30_000);

  it('a marked call permits identically across both adapters\' real verb entries', () => {
    const fx = makeCapabilityFixture();
    try {
      // Mark the session for the `backlog` capability via the real front-door verb.
      const enter = runCli(
        ['front-door', 'enter', '--capability', 'backlog', '--session', 'sess', '--at', fx.root],
        { cwd: fx.root },
      );
      expect(enter.status, enter.stderr).toBe(0);
      const claude = runCli(['intercept'], {
        cwd: fx.root,
        input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: CMD }, session_id: 'sess', cwd: fx.root }),
      });
      const codex = runCli(
        ['mediate-check', '--surface', 'bash', '--identity', CMD, '--session', 'sess', '--json'],
        { cwd: fx.root },
      );
      expect(claude.status, claude.stderr).toBe(0);
      expect(claude.stdout.trim()).toBe(''); // permit → no deny output
      expect(codex.status, codex.stderr).toBe(0); // permit → exit 0
      expect(JSON.parse(codex.stdout).verdict).toBe('permit');
    } finally {
      fx.cleanup();
    }
  }, 30_000);
});
