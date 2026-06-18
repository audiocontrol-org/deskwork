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
import { interceptDecision } from '../../capability/intercept.js';
import { mediateCheck } from '../../subcommands/mediate-check.js';

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
  // Each adapter's REAL entry path for a raw `backlog list`: the Claude adapter via
  // interceptDecision (the PreToolUse hook core), the Codex adapter via the
  // `stackctl mediate-check` VERB it invokes per the contract (interceptor-hook.md §
  // Codex adapter — Bash-only, D8). Both must yield the same verdict + exit-code mapping.
  // (The concrete Codex hook-registration config is the T027 live integration gate.)
  it('the same raw Bash backend call refuses identically across the two adapter entry paths', () => {
    const claude = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog list' }, session_id: 's', cwd: '/x' },
      { resolveActive: () => new Set() },
    );
    const codex = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], {
      resolveActive: () => new Set(),
    });
    expect(claude.verdict).toBe('refuse');
    expect(codex.code).toBe(1); // refuse → exit 1
    expect(codex.stderr).toContain(claude.reason); // identical registry-sourced redirect
  });

  it('a marked call permits identically across the two adapter entry paths', () => {
    const claude = interceptDecision(
      { tool_name: 'Bash', tool_input: { command: 'backlog list' }, session_id: 's', cwd: '/x' },
      { resolveActive: () => new Set(['backlog']) },
    );
    const codex = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], {
      resolveActive: () => new Set(['backlog']),
    });
    expect(claude.verdict).toBe('permit');
    expect(codex.code).toBe(0); // permit → exit 0
  });
});
