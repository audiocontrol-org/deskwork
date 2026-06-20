// 028 US4 (claude-02 DRY) — the single shared SKILL.md frontmatter `name:` reader.
//
// Both the fronted-operations registry builder (which resolves a verb's fronting
// skill) and check-front-door's C2a/C2d live seams (which resolve a skill body by
// its declared name) need to read a SKILL.md's frontmatter `name:`. This was
// duplicated verbatim in two modules; any future change to the parse (indented
// values, block scalars, quoted multi-word names) had to be applied twice with no
// compiler enforcement, risking a silent divergence between how the two modules
// resolve skill names. It now lives here, imported by both.

import { readFileSync } from 'node:fs';

/** Read a SKILL.md's frontmatter `name:` (the skill's declared id), or undefined
 *  when the file has no leading `---` frontmatter block or no `name:` line. */
export function frontmatterName(skillMdPath: string): string | undefined {
  const src = readFileSync(skillMdPath, 'utf8');
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = match?.[1];
  if (frontmatter === undefined) return undefined;
  const nameLine = frontmatter.split(/\r?\n/).find((line) => /^name:\s*/.test(line));
  if (nameLine === undefined) return undefined;
  return nameLine.replace(/^name:\s*/, '').trim().replace(/^["']|["']$/g, '');
}
