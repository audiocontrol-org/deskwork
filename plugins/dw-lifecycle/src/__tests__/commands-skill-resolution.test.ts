/**
 * plugins/dw-lifecycle/src/__tests__/commands-skill-resolution.test.ts
 *
 * AUDIT-20260604-07 regression: every `plugins/dw-lifecycle/commands/*.md`
 * file routes a slash-command to a named skill via prose of the form
 * *"Invoke the `<skill-name>` skill from the `dw-lifecycle` plugin via
 * the Skill tool."* The slash-command resolves the skill by its
 * frontmatter `name:` field — so a command file that names a skill
 * absent from `plugins/dw-lifecycle/skills/<slug>/SKILL.md` is dead on
 * arrival.
 *
 * This test enforces the join. For every command file that names a
 * skill, the named slug MUST exist as the frontmatter `name:` of some
 * SKILL.md under `plugins/dw-lifecycle/skills/`. The test runs in two
 * shapes per Option D HIGH+ discipline:
 *
 *   - Step 1 (bug-repro): the rewritten `commands/check-editor-symmetry.md`
 *     and new `commands/check-module-symmetry.md` route at the
 *     `check-module-symmetry` skill — both must resolve.
 *   - Step 1b (regression-lock): every command file's referenced skill
 *     resolves. Catches the broader class of command-vs-skill rename
 *     drift the AUDIT-07 finding generalizes.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = resolve(HERE, '..', '..', 'commands');
const SKILLS_DIR = resolve(HERE, '..', '..', 'skills');

const INVOKE_RE = /Invoke the `([^`]+)` skill from the `dw-lifecycle` plugin/;
const NAME_RE = /^name:\s*([^\s]+)\s*$/m;

function readSkillNames(): Set<string> {
  const out = new Set<string>();
  for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(SKILLS_DIR, entry.name, 'SKILL.md');
    try {
      statSync(path);
    } catch {
      continue;
    }
    const body = readFileSync(path, 'utf8');
    const m = NAME_RE.exec(body);
    if (m === null) continue;
    const name = m[1];
    if (typeof name === 'string' && name.length > 0) {
      out.add(name);
    }
  }
  return out;
}

interface CommandRef {
  readonly file: string;
  readonly skillName: string;
}

function readCommandSkillRefs(): readonly CommandRef[] {
  const refs: CommandRef[] = [];
  for (const entry of readdirSync(COMMANDS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const body = readFileSync(join(COMMANDS_DIR, entry.name), 'utf8');
    const m = INVOKE_RE.exec(body);
    if (m === null) continue;
    const skillName = m[1];
    if (typeof skillName === 'string' && skillName.length > 0) {
      refs.push({ file: entry.name, skillName });
    }
  }
  return refs;
}

describe('commands → skill resolution (AUDIT-20260604-07 regression)', () => {
  it('AUDIT-07 bug-repro: both check-module-symmetry.md and check-editor-symmetry.md route to a registered skill', () => {
    const skills = readSkillNames();
    const refs = readCommandSkillRefs();
    const moduleEntry = refs.find((r) => r.file === 'check-module-symmetry.md');
    const editorEntry = refs.find((r) => r.file === 'check-editor-symmetry.md');
    expect(
      moduleEntry,
      'commands/check-module-symmetry.md must exist and reference a skill (Phase 25 Task 5 ship)',
    ).toBeDefined();
    expect(
      editorEntry,
      'commands/check-editor-symmetry.md must exist and reference a skill (alias preserved per Phase 25 Open Decisions #2)',
    ).toBeDefined();
    if (moduleEntry !== undefined) {
      expect(
        skills.has(moduleEntry.skillName),
        `commands/check-module-symmetry.md routes at skill '${moduleEntry.skillName}', ` +
          `but no SKILL.md frontmatter declares that name. ` +
          `Registered skills: ${Array.from(skills).sort().join(', ')}`,
      ).toBe(true);
    }
    if (editorEntry !== undefined) {
      expect(
        skills.has(editorEntry.skillName),
        `commands/check-editor-symmetry.md routes at skill '${editorEntry.skillName}', ` +
          `but no SKILL.md frontmatter declares that name. ` +
          `Registered skills: ${Array.from(skills).sort().join(', ')}`,
      ).toBe(true);
    }
  });

  it('regression-lock: every commands/*.md skill reference resolves to a registered skill', () => {
    const skills = readSkillNames();
    const refs = readCommandSkillRefs();
    expect(refs.length, 'at least one command file should reference a skill').toBeGreaterThan(0);
    const unresolved = refs.filter((r) => !skills.has(r.skillName));
    expect(
      unresolved,
      `every command file's referenced skill must exist as a SKILL.md frontmatter \`name:\`. ` +
        `Unresolved: ${JSON.stringify(unresolved)}. ` +
        `Registered skills: ${Array.from(skills).sort().join(', ')}`,
    ).toEqual([]);
  });
});
