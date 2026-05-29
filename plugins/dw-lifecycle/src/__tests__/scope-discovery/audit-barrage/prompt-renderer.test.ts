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
    expect(rendered).not.toMatch(/\{\{[a-zA-Z0-9_]+\}\}/);
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

  it('rejects an override referencing an unknown var', async () => {
    await seedOverride(
      [
        '# OVERRIDE WITH BAD VAR',
        'feature: {{feature_slug}}',
        'plan: {{workplan_summary}}',
        'diff: {{diff}}',
        'audit: {{audit_log_excerpt}}',
        'commits: {{commit_subjects}}',
        'mystery: {{not_in_expected_list}}',
      ].join('\n'),
    );
    await expect(
      renderAuditBarragePrompt({ repoRoot: tmp, vars: FULL_VARS }),
    ).rejects.toThrow(/unsubstituted token\(s\) remain.*not_in_expected_list/);
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
});
