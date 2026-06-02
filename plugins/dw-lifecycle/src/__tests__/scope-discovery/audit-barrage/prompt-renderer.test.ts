/**
 * Tests for the audit-barrage prompt-renderer — covers the
 * project-override-vs-default resolution, the substitution semantics,
 * the missing-var failure-loud guard, and the unsubstituted-token
 * detection.
 *
 * Fixtures live on disk in tmpdir trees (per the project testing rule);
 * no fs mocking.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EXPECTED_VARS,
  PROMPT_OVERRIDE_PATH,
  renderAuditBarragePrompt,
} from '../../../scope-discovery/audit-barrage/prompt-renderer.js';

const FULL_VARS: Readonly<Record<string, string>> = Object.freeze({
  feature_slug: 'sample-feature',
  workplan_summary: 'WPLAN-SUMMARY-BODY',
  diff: 'DIFF-BODY',
  audit_log_excerpt: 'AUDIT-EXCERPT-BODY',
  commit_subjects: 'COMMITS-BODY',
});

describe('renderAuditBarragePrompt — happy path against shipped default', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'audit-barrage-render-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('substitutes every expected var into the shipped default', async () => {
    const rendered = await renderAuditBarragePrompt({
      repoRoot: tmp,
      vars: FULL_VARS,
    });
    for (const key of EXPECTED_VARS) {
      const value = FULL_VARS[key];
      expect(value).toBeDefined();
      if (value === undefined) throw new Error('test bug: missing value');
      expect(rendered).toContain(value);
    }
    // AUDIT-20260529-10 — the guard now rejects ONLY unsubstituted
    // EXPECTED_VARS, not arbitrary `{{...}}` strings. No declared var
    // marker should remain after a full-render pass against the
    // shipped default.
    for (const key of EXPECTED_VARS) {
      expect(rendered).not.toContain(`{{${key}}}`);
    }
  });

  // AUDIT-20260529-11 — the redesigned template uses single-substitution
  // sites (no marker triplets), so each value appears exactly once.
  // Pre-fix, `<!-- {{var}} -->\n{{var}}\n<!-- {{var}} -->` tripled
  // every value: a 60 KB diff became 180 KB in the rendered output.
  it('substitutes each declared var exactly once (no marker triplets)', async () => {
    const rendered = await renderAuditBarragePrompt({
      repoRoot: tmp,
      vars: FULL_VARS,
    });
    // The values chosen for FULL_VARS are unique sentinels; each must
    // appear exactly once in the rendered output.
    for (const key of EXPECTED_VARS) {
      const value = FULL_VARS[key];
      if (value === undefined) throw new Error('test bug: missing value');
      const occurrences = rendered.split(value).length - 1;
      expect(occurrences).toBe(1);
    }
  });

  it('rejects render when a required var is missing', async () => {
    const partial: Record<string, string> = { ...FULL_VARS };
    delete partial['diff'];
    await expect(
      renderAuditBarragePrompt({ repoRoot: tmp, vars: partial }),
    ).rejects.toThrow(/missing required vars: diff/);
  });

  it('rejects unknown var keys in the supplied payload', async () => {
    const withExtra: Record<string, string> = {
      ...FULL_VARS,
      not_a_real_var: 'oops',
    };
    await expect(
      renderAuditBarragePrompt({ repoRoot: tmp, vars: withExtra }),
    ).rejects.toThrow(/unknown vars: not_a_real_var/);
  });
});

describe('renderAuditBarragePrompt — project override resolution', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'audit-barrage-render-ovr-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  async function seedOverride(body: string): Promise<void> {
    const overrideAbs = join(tmp, PROMPT_OVERRIDE_PATH);
    await mkdir(join(tmp, '.dw-lifecycle', 'scope-discovery'), {
      recursive: true,
    });
    await writeFile(overrideAbs, body, 'utf8');
  }

  it('uses the project override when present', async () => {
    await seedOverride(
      [
        '# CUSTOM OVERRIDE PROMPT',
        'feature: {{feature_slug}}',
        'plan: {{workplan_summary}}',
        'diff: {{diff}}',
        'audit: {{audit_log_excerpt}}',
        'commits: {{commit_subjects}}',
      ].join('\n'),
    );
    const rendered = await renderAuditBarragePrompt({
      repoRoot: tmp,
      vars: FULL_VARS,
    });
    expect(rendered).toContain('CUSTOM OVERRIDE PROMPT');
    expect(rendered).toContain('feature: sample-feature');
    expect(rendered).toContain('diff: DIFF-BODY');
    expect(rendered).not.toMatch(/\{\{[a-zA-Z0-9_]+\}\}/);
  });

  // AUDIT-20260529-10 — the guard now permits `{{name}}` strings that
  // are NOT declared in `EXPECTED_VARS`; they're treated as
  // instructional prose (the template's own documentation explaining
  // the substitution mechanism). An override that mentions
  // `{{not_in_expected_list}}` renders through with the marker left
  // intact — the renderer doesn't pretend it's a missing var.
  it('passes through {{...}} strings whose names are not in EXPECTED_VARS', async () => {
    await seedOverride(
      [
        '# OVERRIDE WITH INSTRUCTIONAL PROSE',
        'feature: {{feature_slug}}',
        'plan: {{workplan_summary}}',
        'diff: {{diff}}',
        'audit: {{audit_log_excerpt}}',
        'commits: {{commit_subjects}}',
        'instructional: write a {{var_name}} marker in the body',
      ].join('\n'),
    );
    const rendered = await renderAuditBarragePrompt({
      repoRoot: tmp,
      vars: FULL_VARS,
    });
    expect(rendered).toContain('instructional: write a {{var_name}} marker');
    expect(rendered).toContain('feature: sample-feature');
  });

  // AUDIT-20260529-10 — an EXPECTED_VARS marker that somehow survives
  // substitution IS still a real error. We can't easily reproduce a
  // surviving-marker case via normal use (the substituter handles
  // every declared var), but we exercise the failure path via a
  // template that explicitly contains a marker the renderer's loop
  // skipped... which it cannot under the current implementation, so
  // we exercise the validateVars side: pass an unknown var key in the
  // payload and assert the existing "unknown vars" guard still
  // catches it (this contract did not change).
  it('rejects an unknown var key in the supplied vars payload via the override path', async () => {
    await seedOverride('# minimal override that references no vars\n');
    const withExtra: Record<string, string> = {
      ...FULL_VARS,
      not_a_real_var: 'oops',
    };
    await expect(
      renderAuditBarragePrompt({ repoRoot: tmp, vars: withExtra }),
    ).rejects.toThrow(/unknown vars: not_a_real_var/);
  });

  it('reads the default when the override is absent', async () => {
    const rendered = await renderAuditBarragePrompt({
      repoRoot: tmp,
      vars: FULL_VARS,
    });
    // The shipped default's body has a recognizable heading; assert
    // that the renderer reached for it (i.e. did not 404).
    expect(rendered).toContain('Audit-barrage');
  });

  // Regression: pre-fix, when a substitution value contained literal
  // `{{declared_var}}` text (e.g., a diff that includes the audit-
  // barrage template itself, or a workplan summary that quotes
  // template syntax), the post-substitution check false-rejected the
  // render because it saw declared-var markers in the output. Two-phase
  // substitution prevents the recursive-substitution case AND the
  // retired post-check no longer false-rejects. The value's literal
  // marker text survives unchanged into the output, which is the
  // correct behavior: values are content, not templates.
  it('value containing a literal {{declared_var}} marker passes through verbatim', async () => {
    await seedOverride(
      [
        '# OVERRIDE',
        'feature: {{feature_slug}}',
        'plan: {{workplan_summary}}',
        'diff: {{diff}}',
        'audit: {{audit_log_excerpt}}',
        'commits: {{commit_subjects}}',
      ].join('\n'),
    );
    const varsWithMarkers: Readonly<Record<string, string>> = Object.freeze({
      feature_slug: 'sample-feature',
      workplan_summary: 'WPLAN-{{feature_slug}}',
      diff: 'DIFF includes {{diff}} and {{feature_slug}} literally',
      audit_log_excerpt: 'AUDIT-EXCERPT-BODY',
      commit_subjects: 'COMMITS-BODY',
    });
    const rendered = await renderAuditBarragePrompt({
      repoRoot: tmp,
      vars: varsWithMarkers,
    });
    // Template markers were substituted.
    expect(rendered).toContain('feature: sample-feature');
    expect(rendered).toContain('plan: WPLAN-{{feature_slug}}');
    expect(rendered).toContain('diff: DIFF includes {{diff}} and {{feature_slug}} literally');
    // The literal `{{feature_slug}}` inside the workplan_summary and
    // diff values survives unchanged — values are content.
    expect(rendered).toContain('WPLAN-{{feature_slug}}');
    expect(rendered).toContain('DIFF includes {{diff}}');
  });
});
