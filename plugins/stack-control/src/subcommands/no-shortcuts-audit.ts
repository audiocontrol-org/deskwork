// Shortcut-affordance audit (025 US5 — `stackctl no-shortcuts-audit`).
//
// A doctor-style phrase scan over the plugin's shipped prompt surfaces — `skills/*/SKILL.md`
// AND the cross-vendor `commands/*.md` adapters (codex-02) — that flags an agent-OFFERED
// skip/defer/shortcut (FR-015/SC-005). The enforceable surface is the prompt text itself
// (it cannot be runtime-gated), so a regression is caught here. It flags an *offer* (a
// choice presented to the operator), NOT prose that DESCRIBES the no-shortcuts rule — a
// negation guard keeps "does not offer to skip/defer" and the like from false-positives.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ShortcutFinding {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

// Offer-shaped affordances: an agent presenting a skip/defer/shortcut choice.
const OFFER_PATTERNS: readonly RegExp[] = [
  /\b(?:want me to|shall i|should i|would you like me to|do you want me to)\b[^?\n]*\b(?:skip|defer|shortcut|bypass|gloss over)\b/i,
  /\b(?:skip|defer|shortcut|bypass)\b[^.?\n]{0,60}\?/i,
];

// A line that PROHIBITS / negates a shortcut is not an offer — exclude it.
const NEGATION_GUARDS: readonly RegExp[] = [
  /\b(?:do not|don['’]?t|never|cannot|can['’]?t|without|prohibit\w*|refus\w*|offroad)\b/i,
  /\bno\s+(?:skip|defer|shortcut|bypass)\b/i,
  /\bnot\s+offer\b/i,
  /\(US5\)/,
];

/** Scan one prompt body for agent-offered shortcut affordances (pure over text). */
export function scanShortcutAffordances(text: string, file: string): ShortcutFinding[] {
  const findings: ShortcutFinding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (NEGATION_GUARDS.some((g) => g.test(line))) continue;
    if (OFFER_PATTERNS.some((p) => p.test(line))) {
      findings.push({ file, line: i + 1, text: line.trim() });
    }
  }
  return findings;
}

/** Scan a set of prompt files (each read from disk) for shortcut affordances. */
export function auditShortcutAffordances(files: readonly string[]): ShortcutFinding[] {
  return files.flatMap((file) => scanShortcutAffordances(readFileSync(file, 'utf8'), file));
}

/** The plugin's shipped prompt surfaces: every skills/<name>/SKILL.md + commands/<name>.md. */
export function shippedPromptSurfaces(pluginRoot: string): string[] {
  const surfaces: string[] = [];
  const skillsDir = join(pluginRoot, 'skills');
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skill = join(skillsDir, entry.name, 'SKILL.md');
      if (existsSync(skill)) surfaces.push(skill);
    }
  }
  const commandsDir = join(pluginRoot, 'commands');
  if (existsSync(commandsDir)) {
    for (const entry of readdirSync(commandsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.md')) surfaces.push(join(commandsDir, entry.name));
    }
  }
  return surfaces.sort();
}

const PLUGIN_ROOT = new URL('../..', import.meta.url).pathname;

export async function runNoShortcutsAudit(args: string[]): Promise<void> {
  let root = PLUGIN_ROOT;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--at') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write('no-shortcuts-audit: --at <dir> requires a value\n');
        process.exit(2);
      }
      root = value;
      i++;
      continue;
    }
    process.stderr.write(`no-shortcuts-audit: unexpected argument '${token}' (usage: no-shortcuts-audit [--at <plugin-root>])\n`);
    process.exit(2);
  }

  const findings = auditShortcutAffordances(shippedPromptSurfaces(root));
  if (findings.length > 0) {
    process.stderr.write(`no-shortcuts-audit: ${findings.length} agent-offered shortcut affordance(s) found (FR-015):\n`);
    for (const f of findings) {
      process.stderr.write(`  ${f.file}:${f.line}  ${f.text}\n`);
    }
    process.exit(1);
  }
  process.stdout.write('no-shortcuts-audit: clean — no agent-offered skip/defer/shortcut affordances.\n');
}
