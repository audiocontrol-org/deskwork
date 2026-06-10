/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/override-drift.ts
 *
 * Doctor rule: operator advisory (NOT error / warning of misconfig)
 * when an operator's per-file scope-discovery override at
 * `.stack-control/scope-discovery/<name>.ts` diverges substantially
 * from the plugin's default at
 * `plugins/stack-control/src/scope-discovery/<name>.ts`.
 *
 * Why "advisory": overrides are deliberate (the project explicitly
 * chose to fork the implementation), so a hard error / warning would
 * be wrong. The rule's purpose is to nudge the operator to re-read
 * the plugin's current default occasionally so the divergence stays
 * intentional rather than entropic.
 *
 * Heuristic for "substantial divergence":
 *
 *   (1) Line-count diff > 50 lines (insertion+deletion), OR
 *   (2) Exported symbol surface (top-level `export ...`) differs.
 *
 * Either condition fires the finding. The heuristic is intentionally
 * coarse — the operator is the one deciding whether the divergence is
 * worth converging on; the doctor's job is only to surface it.
 *
 * The override directory is scanned for `*.ts` files; each is compared
 * against the same-named file under
 * `plugins/stack-control/src/scope-discovery/`. Files whose default
 * doesn't exist (operator added a brand-new module) are skipped — the
 * advisory only fires when both sides exist.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorMessage } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE_ID = 'override-drift';
const OVERRIDE_DIR_REL = '.stack-control/scope-discovery';
const LINE_DIFF_THRESHOLD = 50;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_DEFAULTS_DIR = resolve(__dirname, '..');

const EXPORT_RE = /^\s*export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;
const EXPORT_DEFAULT_RE = /^\s*export\s+default\s+/m;

function safeReadDir(path: string): readonly string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function exportedSymbols(text: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const match of text.matchAll(EXPORT_RE)) {
    const name = match[1];
    if (name !== undefined) out.add(name);
  }
  if (EXPORT_DEFAULT_RE.test(text)) {
    out.add('<default>');
  }
  return out;
}

function lineDiffMagnitude(a: string, b: string): number {
  // Coarse line-count delta: |Δ lines| + |distinct non-blank lines
  // present in one but not the other|. This is an over-estimate
  // compared to a real LCS, but it's the right magnitude for the
  // > 50-line threshold and orders-of-magnitude cheaper.
  const aLines = a.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const bLines = b.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);
  let onlyInA = 0;
  let onlyInB = 0;
  for (const line of aSet) if (!bSet.has(line)) onlyInA += 1;
  for (const line of bSet) if (!aSet.has(line)) onlyInB += 1;
  return onlyInA + onlyInB;
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const overrideDir = join(opts.repoRoot, OVERRIDE_DIR_REL);
  if (!existsSync(overrideDir)) return [];
  const findings: ScopeDoctorFinding[] = [];
  const tsFiles = safeReadDir(overrideDir).filter((name) => name.endsWith('.ts'));
  for (const name of tsFiles) {
    const overridePath = join(overrideDir, name);
    const defaultPath = join(PLUGIN_DEFAULTS_DIR, name);
    if (!existsSync(defaultPath)) continue;
    let overrideText: string;
    let defaultText: string;
    try {
      overrideText = readFileSync(overridePath, 'utf8');
      defaultText = readFileSync(defaultPath, 'utf8');
    } catch (err) {
      findings.push({
        rule: RULE_ID,
        severity: 'warning',
        message:
          `${overridePath}: failed to read for drift comparison (${errorMessage(err)}).`,
      });
      continue;
    }
    if (overrideText === defaultText) continue;
    const lineDelta = lineDiffMagnitude(overrideText, defaultText);
    const overrideExports = exportedSymbols(overrideText);
    const defaultExports = exportedSymbols(defaultText);
    const exportsDiffer = !setsEqual(overrideExports, defaultExports);
    if (lineDelta <= LINE_DIFF_THRESHOLD && !exportsDiffer) {
      continue;
    }
    const reasons: string[] = [];
    if (lineDelta > LINE_DIFF_THRESHOLD) {
      reasons.push(`~${lineDelta} non-blank line(s) differ`);
    }
    if (exportsDiffer) {
      reasons.push('exported-symbol surface differs');
    }
    findings.push({
      rule: RULE_ID,
      severity: 'warning',
      message:
        `${overridePath}: deliberate-override advisory — ${reasons.join('; ')}. ` +
        `Re-read the plugin default at ${defaultPath} and decide whether to ` +
        `converge. Overrides are deliberate; this advisory only fires when ` +
        `drift exceeds the heuristic threshold (${LINE_DIFF_THRESHOLD} lines OR ` +
        `exports surface delta).`,
    });
  }
  return findings;
};
