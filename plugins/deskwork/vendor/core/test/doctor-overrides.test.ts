/**
 * Phase 23f — doctor project-rule loader and override merge tests.
 *
 * Operators can drop a `.ts` file in `<projectRoot>/.deskwork/doctor/`
 * to register a custom doctor rule. The runner picks up project rules
 * automatically; basename collisions with built-in rules let the
 * project rule REPLACE the built-in.
 *
 * These tests work at the unit level — they exercise `loadProjectRules`
 * and `mergeRules` directly, plus an end-to-end `runAudit` invocation
 * against a fixture project that ships a project rule. Avoiding the
 * spawn-based CLI test path keeps these tests fast and lets us assert
 * on the merged rule list directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadProjectRules,
  mergeRules,
} from '../src/doctor/project-rules.ts';
import { RULES, runAudit, yesInteraction } from '../src/doctor/runner.ts';
import type { DoctorRule, Finding } from '../src/doctor/types.ts';
import type { DeskworkConfig } from '../src/config.ts';
import { renderEmptyCalendar } from '../src/calendar.ts';

function bootstrapFixture(): { root: string; config: DeskworkConfig } {
  const root = mkdtempSync(join(tmpdir(), 'deskwork-doctor-overrides-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(
    join(root, 'docs', 'calendar.md'),
    renderEmptyCalendar(),
    'utf-8',
  );
  const config: DeskworkConfig = {
    version: 1,
    sites: {
      main: {
        host: 'example.com',
        contentDir: 'src/content',
        calendarPath: 'docs/calendar.md',
      },
    },
    defaultSite: 'main',
  };
  return { root, config };
}

// Fixture project rules. We deliberately keep these untyped (no
// `import type` calls) because the tmp-dir project root won't have
// node_modules linked with @deskwork/core, so type imports would fail
// at module resolution. The runner's `assertDoctorRule` validates the
// shape at load time so the test still exercises the contract.
const PROJECT_RULE_SRC = `
const rule = {
  id: 'project-only-rule',
  label: 'Project-only fixture rule',
  async audit(ctx) {
    return [
      {
        ruleId: 'project-only-rule',
        site: ctx.site,
        severity: 'info',
        message: 'project rule fired',
        details: {},
      },
    ];
  },
  async plan(_ctx, finding) {
    return { kind: 'report-only', finding, reason: 'fixture' };
  },
  async apply(_ctx, plan) {
    return { finding: plan.finding, applied: false, message: 'never applied' };
  },
};

export default rule;
`;

const OVERRIDE_RULE_SRC = `
const rule = {
  id: 'missing-frontmatter-id',
  label: 'Override of missing-frontmatter-id',
  async audit(ctx) {
    return [
      {
        ruleId: 'missing-frontmatter-id',
        site: ctx.site,
        severity: 'warning',
        message: 'OVERRIDE_FIRED',
        details: {},
      },
    ];
  },
  async plan(_ctx, finding) {
    return { kind: 'report-only', finding, reason: 'override' };
  },
  async apply(_ctx, plan) {
    return { finding: plan.finding, applied: false, message: 'override' };
  },
};

export default rule;
`;

describe('doctor — project rules', () => {
  let root: string;
  let config: DeskworkConfig;

  beforeEach(() => {
    const fixture = bootstrapFixture();
    root = fixture.root;
    config = fixture.config;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('loadProjectRules returns [] when .deskwork/doctor/ does not exist', async () => {
    const rules = await loadProjectRules(root);
    expect(rules).toEqual([]);
  });

  it('loadProjectRules picks up a single .ts rule and exposes its basename', async () => {
    const ruleDir = join(root, '.deskwork', 'doctor');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, 'project-only-rule.ts'),
      PROJECT_RULE_SRC,
      'utf-8',
    );

    const rules = await loadProjectRules(root);
    expect(rules.length).toBe(1);
    expect(rules[0].basename).toBe('project-only-rule');
    expect(rules[0].rule.id).toBe('project-only-rule');
  });

  it('loadProjectRules throws on a bad default export', async () => {
    const ruleDir = join(root, '.deskwork', 'doctor');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, 'broken.ts'),
      'export const notDefault = 1;\n',
      'utf-8',
    );
    await expect(loadProjectRules(root)).rejects.toThrow(
      /default export must be an object/,
    );
  });

  it('mergeRules appends new project rules and replaces built-ins on basename collision', () => {
    const projectOnly: DoctorRule = {
      id: 'project-only-rule',
      label: 'project',
      async audit(): Promise<Finding[]> {
        return [];
      },
      async plan(_ctx, _finding) {
        throw new Error('not used');
      },
      async apply(_ctx, _plan) {
        throw new Error('not used');
      },
    };
    const overrideRule: DoctorRule = {
      id: 'missing-frontmatter-id',
      label: 'overridden',
      async audit(): Promise<Finding[]> {
        return [];
      },
      async plan(_ctx, _finding) {
        throw new Error('not used');
      },
      async apply(_ctx, _plan) {
        throw new Error('not used');
      },
    };
    const merged = mergeRules(RULES, [
      {
        basename: 'project-only-rule',
        path: '/dev/null',
        rule: projectOnly,
      },
      {
        basename: 'missing-frontmatter-id',
        path: '/dev/null',
        rule: overrideRule,
      },
    ]);
    // Override replaces the built-in at the SAME index — no append.
    const builtInIdx = RULES.findIndex(
      (r) => r.id === 'missing-frontmatter-id',
    );
    expect(merged[builtInIdx].label).toBe('overridden');
    // New rule appended.
    expect(merged.length).toBe(RULES.length + 1);
    expect(merged[merged.length - 1].id).toBe('project-only-rule');
  });

  it('runAudit picks up a project-only rule and includes its finding', async () => {
    const ruleDir = join(root, '.deskwork', 'doctor');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, 'project-only-rule.ts'),
      PROJECT_RULE_SRC,
      'utf-8',
    );

    const report = await runAudit(
      { projectRoot: root, config },
      yesInteraction,
    );

    const projectFindings = report.findings.filter(
      (f) => f.ruleId === 'project-only-rule',
    );
    expect(projectFindings.length).toBe(1);
    expect(projectFindings[0].message).toBe('project rule fired');
  });

  it('runAudit substitutes a project override for the built-in with the same basename', async () => {
    const ruleDir = join(root, '.deskwork', 'doctor');
    mkdirSync(ruleDir, { recursive: true });
    writeFileSync(
      join(ruleDir, 'missing-frontmatter-id.ts'),
      OVERRIDE_RULE_SRC,
      'utf-8',
    );

    const report = await runAudit(
      { projectRoot: root, config },
      yesInteraction,
    );

    // The override fires for the seeded site, producing OVERRIDE_FIRED.
    const overrideFindings = report.findings.filter(
      (f) => f.ruleId === 'missing-frontmatter-id',
    );
    expect(overrideFindings.length).toBe(1);
    expect(overrideFindings[0].message).toBe('OVERRIDE_FIRED');
  });
});
