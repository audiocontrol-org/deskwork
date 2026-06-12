#!/usr/bin/env tsx
/**
 * Prepends a retirement notice to every dw-lifecycle skill's SKILL.md,
 * inserted after the YAML frontmatter block and before the first heading.
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

const PLUGIN_DIR = resolve(process.cwd(), "plugins/dw-lifecycle/skills");

const NOTICE = `> **RETIRED.** \`dw-lifecycle\` has been superseded by \`stack-control\`. This skill is preserved for historical reference only and is no longer maintained. Use [stack-control](../../../stack-control/) skills instead.

`;

function insertNotice(content: string): string {
  // Split on the closing frontmatter delimiter (second ---)
  // Pattern: ---\n<yaml>\n---\n
  const frontmatterEnd = /^---\r?\n/m;
  const parts = content.split(frontmatterEnd);
  if (parts.length < 3) {
    // No valid frontmatter found — prepend notice at top
    return NOTICE + content;
  }
  // parts[0] = "---\n<yaml>"
  // parts[1] = "" (empty from split at closing ---)
  // parts[2..] = rest
  // Rejoin: frontmatter + closing --- + \n + notice + rest
  const frontmatter = parts[0];
  const rest = parts.slice(2).join("---\n");
  // Trim leading blank lines from rest so notice sits cleanly
  const trimmedRest = rest.replace(/^\n+/, "");
  return `${frontmatter}---\n\n${NOTICE}${trimmedRest}`;
}

const skills = readdirSync(PLUGIN_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

let updated = 0;
let skipped = 0;

for (const skill of skills) {
  const filePath = join(PLUGIN_DIR, skill, "SKILL.md");
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    console.error(`  SKIP (not found): ${skill}/SKILL.md`);
    skipped++;
    continue;
  }

  if (content.includes("RETIRED.")) {
    console.log(`  already-tagged: ${skill}`);
    skipped++;
    continue;
  }

  const updated_content = insertNotice(content);
  writeFileSync(filePath, updated_content, "utf8");
  console.log(`  tagged: ${skill}`);
  updated++;
}

console.log(`\nDone. Tagged: ${updated}, skipped: ${skipped}`);
