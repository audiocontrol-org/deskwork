#!/usr/bin/env node --experimental-strip-types
/**
 * Generate `commands/<name>.md` slash-command shim files for every
 * skill in a plugin's `skills/` directory. Closes the
 * SKILL.md-without-a-shim adoption gap surfaced in #185 — installed
 * plugins ship skills but the user-typeable
 * `/<plugin>:<skill>` form requires a `commands/<name>.md` file in
 * shipped Claude Code.
 *
 * Run from the repo root:
 *
 *   tsx scripts/generate-command-shims.ts plugins/dw-lifecycle plugins/deskwork
 *
 * Each shim contains the slash-command frontmatter (description) plus
 * a minimal body directing Claude to invoke the same-named Skill. The
 * body deliberately stays out of the way — the skill's SKILL.md is
 * the canonical procedure; the shim's only job is to register the
 * slash-command surface and route to the skill.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

interface Frontmatter {
  description: string;
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith('---\n')) {
    throw new Error('No frontmatter block at start of file');
  }
  const end = content.indexOf('\n---\n', 4);
  if (end < 0) throw new Error('Unterminated frontmatter block');
  const block = content.slice(4, end);
  // Description value may be quoted, unquoted, or span multiple lines
  // for our skills these are all single-line. Quoted handling tolerates
  // both single and double quotes; unquoted trims trailing whitespace.
  const m = /^description:\s*(.+?)\s*$/m.exec(block);
  if (!m || !m[1]) throw new Error('No `description:` field in frontmatter');
  let description = m[1];
  if (
    (description.startsWith('"') && description.endsWith('"')) ||
    (description.startsWith("'") && description.endsWith("'"))
  ) {
    description = description.slice(1, -1);
  }
  return { description };
}

function generateShim(skillName: string, description: string, pluginName: string): string {
  // Single-line description quoted defensively; embedded `"` is escaped.
  const escapedDescription = description.replace(/"/g, '\\"');
  return `---
description: "${escapedDescription}"
---

Invoke the \`${skillName}\` skill from the \`${pluginName}\` plugin via the Skill tool. The skill's SKILL.md is the canonical procedure — follow it end to end.
`;
}

function processPlugin(pluginDir: string): { generated: number; skipped: number } {
  const skillsDir = join(pluginDir, 'skills');
  if (!existsSync(skillsDir)) {
    throw new Error(`No skills/ directory in ${pluginDir}`);
  }
  const pluginManifest = JSON.parse(
    readFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  const pluginName = pluginManifest.name;
  if (typeof pluginName !== 'string' || pluginName.length === 0) {
    throw new Error(`Plugin manifest missing name: ${pluginDir}`);
  }

  const commandsDir = join(pluginDir, 'commands');
  mkdirSync(commandsDir, { recursive: true });

  let generated = 0;
  let skipped = 0;
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillName = entry.name;
    const skillPath = join(skillsDir, skillName, 'SKILL.md');
    if (!existsSync(skillPath)) {
      console.warn(`Skipping ${skillName}: no SKILL.md`);
      skipped++;
      continue;
    }
    const fm = parseFrontmatter(readFileSync(skillPath, 'utf8'));
    const shim = generateShim(skillName, fm.description, pluginName);
    const shimPath = join(commandsDir, `${skillName}.md`);
    writeFileSync(shimPath, shim, 'utf8');
    generated++;
  }
  return { generated, skipped };
}

function main(args: string[]): void {
  if (args.length === 0) {
    console.error('Usage: generate-command-shims.ts <plugin-dir> [<plugin-dir>...]');
    process.exit(2);
  }
  for (const pluginDir of args) {
    const { generated, skipped } = processPlugin(pluginDir);
    console.log(
      `${basename(pluginDir)}: generated ${generated} shim(s)${skipped > 0 ? `, skipped ${skipped}` : ''}`,
    );
  }
}

main(process.argv.slice(2));
