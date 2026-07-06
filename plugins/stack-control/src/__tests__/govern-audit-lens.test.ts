// RED-first (mode-aware audit lens): the audit-barrage prompt is made
// mode-aware by supplying the "What to look for" lens (and the "Under audit"
// artifact framing) as per-mode VARs. Implement-mode keeps the code-oriented
// checklist verbatim (no behavior change); spec-mode swaps in a
// promise/decision/contradiction/ambiguity lens that scopes the audit to spec
// altitude.
//
// Each assertion pins the contract:
//   - render: a payload MISSING audit_lens (or artifact_framing) fails the
//     renderer's missing-var validation; a payload WITH both renders with no
//     leftover template placeholder.
//   - spec lens: spec-mode BarrageVars.audit_lens === SPEC_AUDIT_LENS, carries
//     the altitude litmus + the [mechanism — defer to contracts/tests] cap, and
//     does NOT carry the code-checklist phrase "Operator interrupt mid-operation".
//   - implement lens (regression): implement-mode BarrageVars.audit_lens ===
//     CODE_AUDIT_LENS and DOES carry "Operator interrupt mid-operation" — i.e.
//     implement-mode behavior is unchanged.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderAuditBarragePrompt } from '../scope-discovery/audit-barrage/prompt-renderer.js';
import { CODE_AUDIT_LENS, CODE_ARTIFACT_FRAMING } from '../govern/audit-constants.js';
import {
  SPEC_AUDIT_LENS,
  SPEC_ARTIFACT_FRAMING,
} from '../govern/payload-spec.js';
import { buildImplementVars, buildSpecVars } from '../govern/govern-vars.js';
import { resolveCodeScopePolicy } from '../govern/code-scope.js';

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), 'gov-lens-'));
}

/** A full set of substitution values for the renderer, minus any we want to
 * deliberately omit in a missing-var test. */
function baseVars(): Record<string, string> {
  return {
    feature_slug: 'demo',
    workplan_summary: 'A summary.',
    diff: 'a diff.',
    audit_log_excerpt: 'an excerpt.',
    commit_subjects: 'subjects.',
    audit_lens: CODE_AUDIT_LENS,
    artifact_framing: CODE_ARTIFACT_FRAMING,
  };
}

describe('renderAuditBarragePrompt — mode-aware lens vars', () => {
  it('fails when audit_lens is missing from the vars payload', async () => {
    const repo = tmpRepo();
    try {
      const vars = baseVars();
      delete vars['audit_lens'];
      await expect(renderAuditBarragePrompt({ repoRoot: repo, vars })).rejects.toThrow(
        /audit_lens/,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('fails when artifact_framing is missing from the vars payload', async () => {
    const repo = tmpRepo();
    try {
      const vars = baseVars();
      delete vars['artifact_framing'];
      await expect(renderAuditBarragePrompt({ repoRoot: repo, vars })).rejects.toThrow(
        /artifact_framing/,
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('renders with no leftover template placeholder when all vars (incl. lens) are present', async () => {
    const repo = tmpRepo();
    try {
      const rendered = await renderAuditBarragePrompt({ repoRoot: repo, vars: baseVars() });
      // No template placeholder for either lens var survives substitution.
      expect(rendered).not.toContain('{{audit_lens}}');
      expect(rendered).not.toContain('{{artifact_framing}}');
      // The lens + framing values landed.
      expect(rendered).toContain(CODE_AUDIT_LENS);
      expect(rendered).toContain(CODE_ARTIFACT_FRAMING);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('spec-mode audit lens', () => {
  it('spec-mode BarrageVars.audit_lens === SPEC_AUDIT_LENS', () => {
    const repo = tmpRepo();
    try {
      const spec = join(repo, 'spec.md');
      writeFileSync(spec, 'A spec under audit.\n');
      const built = buildSpecVars(repo, 'demo', spec, undefined, undefined, '');
      expect(built.vars.audit_lens).toBe(SPEC_AUDIT_LENS);
      expect(built.vars.artifact_framing).toBe(SPEC_ARTIFACT_FRAMING);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('SPEC_AUDIT_LENS carries the altitude litmus', () => {
    expect(SPEC_AUDIT_LENS).toContain('WHAT the spec promises/decides');
    expect(SPEC_AUDIT_LENS).toContain('HOW it would be implemented');
  });

  it('SPEC_AUDIT_LENS carries the [mechanism — defer to contracts/tests] cap', () => {
    expect(SPEC_AUDIT_LENS).toContain('[mechanism — defer to contracts/tests]');
  });

  it('SPEC_AUDIT_LENS does NOT carry the code-checklist phrase "Operator interrupt mid-operation" as a missing edge case to flag', () => {
    // The phrase may appear inside the "Do NOT flag" guardrail; it must NOT
    // appear as a directive to flag missing edge cases (the code lens shape).
    // The simplest robust contract: the spec lens must not contain the code
    // lens's "Missed edge cases" bullet, which is where the code lens uses the
    // phrase as a thing to flag.
    expect(SPEC_AUDIT_LENS).not.toContain('Missed edge cases');
  });
});

describe('implement-mode audit lens (regression — unchanged behavior)', () => {
  it('implement-mode BarrageVars.audit_lens === CODE_AUDIT_LENS', () => {
    const repo = tmpRepo();
    try {
      const built = buildImplementVars(repo, 'demo', 'HEAD', undefined, false);
      expect(built.vars.audit_lens).toBe(CODE_AUDIT_LENS);
      expect(built.vars.artifact_framing).toBe(CODE_ARTIFACT_FRAMING);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('CODE_AUDIT_LENS DOES carry "Operator interrupt mid-operation" (code lens unchanged)', () => {
    expect(CODE_AUDIT_LENS).toContain('Operator interrupt mid-operation');
  });

  it('implement framing is always the generic CODE_ARTIFACT_FRAMING (030 FR-017: per-phase retired)', () => {
    const repo = tmpRepo();
    try {
      const built = buildImplementVars(repo, 'demo', 'HEAD', undefined, false);
      expect(built.vars.artifact_framing).toBe(CODE_ARTIFACT_FRAMING);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

/** Isolate the `runSpecArm` function body from `govern-arms.ts` source text, so the
 * structural assertion below (034 T022) is scoped to the spec arm ONLY — the
 * implement arm in the same file legitimately calls `resolveCodeScopePolicy` a few
 * lines earlier (govern-arms.ts:253), and this guard must not false-positive on
 * that unrelated, correct call. */
function extractRunSpecArm(source: string): string {
  const start = source.indexOf('export async function runSpecArm');
  if (start === -1) {
    throw new Error('runSpecArm not found in govern-arms.ts — has it been renamed or moved?');
  }
  const searchFrom = start + 'export async function runSpecArm'.length;
  const nextExportOffset = source.slice(searchFrom).search(/\nexport /);
  const end = nextExportOffset === -1 ? source.length : searchFrom + nextExportOffset;
  return source.slice(start, end);
}

describe('034 T022 — FR-012: spec-mode payload is unaffected by a govern code-scope block', () => {
  // `runSpecArm` (govern/govern-arms.ts) never constructs an `EndGovernRuntime` —
  // that seam exists only on the implement arm (`runEndGovern`). Because
  // `applyCodeScope` is only ever invoked FROM that runtime seam
  // (end-govern-runtime.ts), a spec-mode audit that never builds the runtime
  // structurally cannot have its payload touched by the code-scope filter,
  // regardless of what an installation's `govern` block resolves to.
  const GOVERN_ARMS_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'govern', 'govern-arms.ts');

  it('runSpecArm never resolves or applies a code-scope policy (structural: FR-012)', () => {
    const runSpecArmSrc = extractRunSpecArm(readFileSync(GOVERN_ARMS_PATH, 'utf8'));
    expect(runSpecArmSrc).not.toContain('resolveCodeScopePolicy');
    expect(runSpecArmSrc).not.toContain('codeScopePolicy');
    expect(runSpecArmSrc).not.toContain('applyCodeScope');
    expect(runSpecArmSrc).not.toContain('makeEndGovernRuntime');
    expect(runSpecArmSrc).not.toContain('EndGovernRuntime');
  });

  it('buildSpecVars has no parameter slot for a govern config or CodeScopePolicy (arity pinned)', () => {
    // buildSpecVars(repoRoot, slug, specPathFlag, planPathFlag, checkpointFlag,
    // auditLogExcerpt) — 6 parameters, none of which is a GovernConfig or
    // CodeScopePolicy. Pinning the arity means a future change that threads one in
    // must touch (and deliberately re-justify) this guard, rather than silently
    // reintroducing a code-scope dependency on the spec arm.
    expect(buildSpecVars.length).toBe(6);
  });

  it('buildSpecVars output is byte-identical for identical inputs, regardless of what a govern code-scope block would resolve to', () => {
    const repo = tmpRepo();
    try {
      const specPath = join(repo, 'spec.md');
      writeFileSync(specPath, 'A spec under audit, in an installation that also has a govern block.\n');

      // Two policies a `govern` block COULD resolve to, proving the config genuinely
      // diverges when it is consulted (the toggle/integration suites exercise the
      // implement arm's use of exactly this divergence) — neither of which
      // buildSpecVars has any parameter to receive.
      const codeOnlyActive = resolveCodeScopePolicy({ codeOnly: true });
      const codeOnlyOff = resolveCodeScopePolicy({ codeOnly: false });
      expect(codeOnlyActive.active).toBe(true);
      expect(codeOnlyOff.active).toBe(false);
      expect(codeOnlyActive).not.toEqual(codeOnlyOff);

      // buildSpecVars's signature has no channel for either policy above, so two
      // calls with identical primitive args stand in for "a govern block resolving
      // to codeOnlyActive" vs "a govern block resolving to codeOnlyOff" — there is
      // no argument that could carry the difference through to this function.
      const withGovernBlockConceptuallyOn = buildSpecVars(repo, 'demo', specPath, undefined, undefined, '');
      const withGovernBlockConceptuallyOff = buildSpecVars(repo, 'demo', specPath, undefined, undefined, '');
      expect(withGovernBlockConceptuallyOn).toEqual(withGovernBlockConceptuallyOff);
      expect(JSON.stringify(withGovernBlockConceptuallyOn)).toBe(
        JSON.stringify(withGovernBlockConceptuallyOff),
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
