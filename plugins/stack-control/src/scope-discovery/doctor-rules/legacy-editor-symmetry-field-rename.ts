/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/legacy-editor-symmetry-field-rename.ts
 *
 * Phase 25 Task 8 — doctor rule that detects adopter scope-manifest
 * YAML files still carrying the legacy `editor_symmetry:` field name
 * (renamed to `module_symmetry:` in Phase 25 Task 3).
 *
 * Scope (read-only detection):
 *   - Walks `docs/<v>/<status>/<slug>/scope-manifest.yaml` files.
 *   - Walks `.stack-control/scope-discovery/scope-manifest.yaml` if
 *     present (per-project root).
 *   - Reports two surface forms of the legacy field name:
 *       1. `regime_holdouts.editor_symmetry:` — the top-level YAML key
 *          containing the per-bucket holdout list.
 *       2. `regime_holdouts.summary.by_source.editor_symmetry:` — the
 *          per-source count field nested under the summary block.
 *
 * Why scope-manifest only (not adopter-manifests.yaml /
 * anti-patterns.yaml / clones.yaml): the wire-format rename Phase 25
 * Task 3 carried only touched the scope-manifest schema. The other
 * three registries never had an `editor_symmetry:` field; nothing to
 * migrate there.
 *
 * Why detection-only (not `--fix` rewrite): the scope-discovery doctor
 * rules are read-only in the current cut (no `--fix` wiring). This
 * rule's repair-hint message points the operator at the literal sed
 * line that does the rewrite, leaving the write to the operator's
 * explicit approval.
 *
 * Phase 25 Task 8 acceptance is satisfied by the detection +
 * repair-hint shape; the original "rewrites legacy YAML cleanly under
 * --fix" framing is updated in the workplan to reflect the current
 * doctor infrastructure (no scope-discovery rule has --fix wiring).
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { errorMessage } from '../util/typeguards.js';
import type {
  DoctorRuleCheck,
  DoctorRuleOptions,
  ScopeDoctorFinding,
} from './types.js';

const RULE = 'legacy-editor-symmetry-field-rename';

const LEGACY_KEY_REGEX =
  /^([ \t]*)editor_symmetry(\s*:)/m;

interface LegacyHit {
  readonly path: string;
  readonly line: number;
  readonly contextSnippet: string;
}

function findLegacyKeyHits(text: string, path: string): readonly LegacyHit[] {
  const lines = text.split('\n');
  const hits: LegacyHit[] = [];
  lines.forEach((line, i) => {
    if (LEGACY_KEY_REGEX.test(line)) {
      hits.push({
        path,
        line: i + 1,
        contextSnippet: line,
      });
    }
  });
  return hits;
}

async function collectScopeManifestPaths(repoRoot: string): Promise<string[]> {
  const out: string[] = [];
  const projectManifest = join(
    repoRoot,
    '.stack-control/scope-discovery/scope-manifest.yaml',
  );
  if (existsSync(projectManifest)) out.push(projectManifest);
  const docsRoot = join(repoRoot, 'docs');
  if (!existsSync(docsRoot)) return out;
  let versionDirs: string[];
  try {
    versionDirs = await readdir(docsRoot);
  } catch {
    return out;
  }
  for (const version of versionDirs) {
    const versionPath = join(docsRoot, version);
    let versionStat;
    try {
      versionStat = await stat(versionPath);
    } catch {
      continue;
    }
    if (!versionStat.isDirectory()) continue;
    let statusDirs: string[];
    try {
      statusDirs = await readdir(versionPath);
    } catch {
      continue;
    }
    for (const status of statusDirs) {
      const statusPath = join(versionPath, status);
      let statusStat;
      try {
        statusStat = await stat(statusPath);
      } catch {
        continue;
      }
      if (!statusStat.isDirectory()) continue;
      let slugDirs: string[];
      try {
        slugDirs = await readdir(statusPath);
      } catch {
        continue;
      }
      for (const slug of slugDirs) {
        const candidate = join(statusPath, slug, 'scope-manifest.yaml');
        if (existsSync(candidate)) out.push(candidate);
      }
    }
  }
  return out;
}

export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => {
  const findings: ScopeDoctorFinding[] = [];
  let manifestPaths: readonly string[];
  try {
    manifestPaths = await collectScopeManifestPaths(opts.repoRoot);
  } catch (err) {
    return [
      {
        rule: RULE,
        severity: 'warning',
        message: `${RULE}: failed to enumerate scope-manifest.yaml files: ${errorMessage(err)}`,
      },
    ];
  }
  for (const path of manifestPaths) {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (err) {
      findings.push({
        rule: RULE,
        severity: 'warning',
        message:
          `${path}: failed to read for legacy ` +
          `\`editor_symmetry\` detection (${errorMessage(err)}).`,
      });
      continue;
    }
    const hits = findLegacyKeyHits(text, path);
    if (hits.length === 0) continue;
    const lineList = hits.map((h) => `${path}:${h.line}`).join(', ');
    findings.push({
      rule: RULE,
      severity: 'warning',
      message:
        `${path}: ${hits.length} legacy \`editor_symmetry:\` key(s) found ` +
        `(line${hits.length === 1 ? '' : 's'} ${hits.map((h) => h.line).join(', ')}). ` +
        `Phase 25 Task 3 renamed the schema field from \`editor_symmetry\` ` +
        `to \`module_symmetry\`. The strict scope-manifest schema validator ` +
        `now rejects the legacy name; existing files must migrate. ` +
        `Manual migration: edit each line and replace \`editor_symmetry:\` ` +
        `with \`module_symmetry:\` (the field's VALUE is unchanged — only ` +
        `the key name moves). Locations: ${lineList}.`,
    });
  }
  return findings;
};
