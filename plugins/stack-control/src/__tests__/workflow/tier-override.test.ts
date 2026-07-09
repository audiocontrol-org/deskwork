// 035 T018/T019 (FR-007/US3/SC-005) — behavior-guard: an operator's manual tier edit
// in tasks.md is honored verbatim by resolve-tiers (there is no generation-time model
// binding that could clobber a hand-edited tag), and the non-clobber posture is
// stated in the define seam's SKILL.md (content assertion, mirroring the style of
// src/__tests__/workflow/define-tier-seam.test.ts).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../_run-helpers.js';

const CONFIGURED_MAP = ['version: 1', 'tier_map:', '  fast: haiku', '  balanced: sonnet', '  powerful: opus', ''].join('\n');

const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

function defineSkill(): string {
  return readFileSync(join(PLUGIN_ROOT, 'skills', 'define', 'SKILL.md'), 'utf8');
}

describe('035 operator override — a hand-edited [tier:] tag is honored, not clobbered (FR-007/US3/SC-005)', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'stackctl-tier-override-'));
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  function makeInstall(tasks: string): { specDir: string } {
    mkdirSync(join(work, '.stack-control'), { recursive: true });
    writeFileSync(join(work, '.stack-control', 'config.yaml'), CONFIGURED_MAP);
    const specDir = join(work, 'specs', '999-fixture');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'tasks.md'), tasks);
    return { specDir };
  }

  it('a task originally generated as [tier:balanced], edited to [tier:powerful], resolves to the edited model', () => {
    // Simulate the generator's original output.
    const generated = '- [ ] T001 [tier:balanced] a standard implementation task — in src/a.ts\n';
    const { specDir } = makeInstall(generated);
    const before = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(before.status).toBe(0);
    expect(JSON.parse(before.stdout)).toEqual({
      specDir,
      tasks: [{ id: 'T001', tierLabel: 'balanced', model: 'sonnet' }],
    });

    // Operator reviews and edits the tag by hand (the file on disk changes; nothing
    // in resolve-tiers or the parser tracks/reverts this — the edit simply IS the
    // new source of truth for the next resolve-tiers run).
    const edited = '- [ ] T001 [tier:powerful] a standard implementation task — in src/a.ts\n';
    writeFileSync(join(specDir, 'tasks.md'), edited);

    const after = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(after.status).toBe(0);
    expect(JSON.parse(after.stdout)).toEqual({
      specDir,
      tasks: [{ id: 'T001', tierLabel: 'powerful', model: 'opus' }],
    });
  });

  it('the define seam SKILL.md states the non-clobber contract: a reviewed/edited tasks.md is not clobbered', () => {
    const md = defineSkill();
    const tierSection = md.slice(md.search(/renderTierRequirement/));
    expect(tierSection).toMatch(/not.*clobber|non-?clobber/i);
    expect(tierSection).toMatch(/reviewed|edited/i);
    expect(tierSection).toMatch(/operator-initiated/i);
  });
});
