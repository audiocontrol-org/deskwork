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
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderAuditBarragePrompt } from '../scope-discovery/audit-barrage/prompt-renderer.js';
import {
  CODE_AUDIT_LENS,
  CODE_ARTIFACT_FRAMING,
} from '../govern/payload-implement.js';
import {
  SPEC_AUDIT_LENS,
  SPEC_ARTIFACT_FRAMING,
} from '../govern/payload-spec.js';
import { buildImplementVars, buildSpecVars } from '../subcommands/govern.js';

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
      const built = buildSpecVars(repo, 'demo', spec, undefined, undefined);
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
      const built = buildImplementVars(repo, 'demo', 'HEAD', undefined);
      expect(built.vars.audit_lens).toBe(CODE_AUDIT_LENS);
      expect(built.vars.artifact_framing).toBe(CODE_ARTIFACT_FRAMING);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('CODE_AUDIT_LENS DOES carry "Operator interrupt mid-operation" (code lens unchanged)', () => {
    expect(CODE_AUDIT_LENS).toContain('Operator interrupt mid-operation');
  });
});
