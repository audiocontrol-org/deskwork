/**
 * Install pre-flight checks (Issue #42 + #45, Phase 22).
 *
 * Two non-blocking probes that run after `.deskwork/config.json` is
 * written, before the install command exits successfully:
 *
 * 1. detectExistingPipeline — heuristic walk for signals of a competing
 *    in-house editorial implementation (e.g. the audiocontrol journal
 *    layout deskwork was extracted from). When detected, the operator
 *    is warned that deskwork installs ALONGSIDE the existing pipeline
 *    rather than replacing it.
 *
 * 2. preflightSchema — for Astro sites only, statically inspect the
 *    host's content schema source for either a `deskwork` field
 *    declaration or a top-level `.passthrough()`. If neither matches
 *    (or the schema file is missing / ambiguous), the schema-patch
 *    instructions are printed inline at install time so the operator
 *    sees the requirement BEFORE the first deskwork write.
 *
 * Both probes are loud but non-blocking — they print to stdout and
 * return without throwing. Install still completes successfully.
 *
 * Sibling-relative imports per the project convention.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { printSchemaPatchInstructions } from '@deskwork/core/doctor';
import type { DeskworkConfig } from '@deskwork/core/config';

const ASTRO_CONFIG_NAMES = [
  'astro.config.mjs',
  'astro.config.ts',
  'astro.config.js',
  'astro.config.cjs',
] as const;

const CONTENT_SCHEMA_NAMES = [
  // Newer Astro convention.
  'src/content.config.ts',
  'src/content.config.js',
  'src/content.config.mjs',
  // Older Astro convention (used by the original audiocontrol tree).
  'src/content/config.ts',
  'src/content/config.js',
  'src/content/config.mjs',
] as const;

/**
 * True when the project has any Astro config file at the root. Used to
 * gate the schema preflight — non-Astro projects (Hugo / Jekyll / etc)
 * don't need the patch.
 */
function isAstroProject(projectRoot: string): boolean {
  return ASTRO_CONFIG_NAMES.some((name) =>
    existsSync(join(projectRoot, name)),
  );
}

/**
 * Locate the host's content-schema source file. Returns the absolute
 * path to the first matching candidate, or null when none exist.
 */
function findContentSchemaFile(projectRoot: string): string | null {
  for (const rel of CONTENT_SCHEMA_NAMES) {
    const abs = join(projectRoot, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Result of the schema preflight check for one site. The probe is
 * intentionally coarse — it asks "could this schema accept the
 * `deskwork:` namespace?" rather than parsing TypeScript.
 */
export type SchemaProbeOutcome =
  | { kind: 'compatible'; schemaPath: string; reason: string }
  | { kind: 'uncertain'; schemaPath: string | null; reason: string }
  | { kind: 'skipped'; reason: string };

/**
 * Probe the content-schema file for compatibility with deskwork's
 * `deskwork:` namespace binding. Static text inspection — does NOT
 * evaluate the TypeScript.
 *
 * Returns `compatible` when either a `deskwork`-named schema field
 * declaration OR a top-level `.passthrough()` is detected. Anything
 * else (file missing, no signal found) is `uncertain` — the caller
 * surfaces patch instructions to the operator.
 */
export function preflightSchemaForProject(
  projectRoot: string,
): SchemaProbeOutcome {
  if (!isAstroProject(projectRoot)) {
    return {
      kind: 'skipped',
      reason: 'no Astro config detected at project root; non-Astro engines (Hugo / Jekyll / Eleventy / plain markdown) do not validate frontmatter',
    };
  }
  const schemaPath = findContentSchemaFile(projectRoot);
  if (schemaPath === null) {
    return {
      kind: 'uncertain',
      schemaPath: null,
      reason: 'no src/content/config.* or src/content.config.* file found',
    };
  }
  let raw: string;
  try {
    raw = readFileSync(schemaPath, 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      kind: 'uncertain',
      schemaPath,
      reason: `could not read schema file: ${reason}`,
    };
  }
  // Heuristic 1: an explicit `deskwork:` field on the schema object.
  // We accept any of:
  //   deskwork: z.object(...)
  //   deskwork: z.unknown()
  //   deskwork: z.any()
  const explicitNamespace = /\bdeskwork\s*:\s*z\.[a-zA-Z]/u.test(raw);
  if (explicitNamespace) {
    return {
      kind: 'compatible',
      schemaPath,
      reason: 'detected explicit `deskwork:` field in the schema',
    };
  }
  // Heuristic 2: a `.passthrough()` call anywhere — this accepts
  // unknown keys including the entire `deskwork:` namespace.
  if (/\.passthrough\s*\(/u.test(raw)) {
    return {
      kind: 'compatible',
      schemaPath,
      reason: 'detected `.passthrough()` on the schema (accepts unknown keys)',
    };
  }
  return {
    kind: 'uncertain',
    schemaPath,
    reason: 'no `deskwork:` field declaration and no `.passthrough()` found',
  };
}

/**
 * Print the schema preflight result to stdout. Non-blocking — install
 * continues regardless of outcome.
 *
 * The function is responsible for the entire textual surface of the
 * check so the install command stays focused on its own concerns.
 */
export function printSchemaPreflight(
  projectRoot: string,
  config: DeskworkConfig,
): void {
  // The check applies project-wide (Astro config is at the root). We
  // run the probe once and then describe the outcome in terms of the
  // configured sites for the operator's mental model.
  const outcome = preflightSchemaForProject(projectRoot);
  const sites = Object.keys(config.sites);
  if (outcome.kind === 'skipped') {
    console.log(
      `Schema pre-flight: skipped (${outcome.reason}).`,
    );
    return;
  }
  if (outcome.kind === 'compatible') {
    console.log(
      `Schema pre-flight: OK (${outcome.reason}).`,
    );
    console.log(`  schema file: ${outcome.schemaPath}`);
    if (sites.length > 0) {
      console.log(
        `  applies to sites: ${sites.join(', ')}`,
      );
    }
    return;
  }
  // uncertain — surface the patch instructions inline. This is the
  // operator-facing reminder so they don't discover the requirement
  // mid-workflow at the first `/deskwork:outline`.
  console.log('Schema pre-flight: UNCERTAIN — patch instructions follow.');
  console.log(`  reason: ${outcome.reason}`);
  if (outcome.schemaPath !== null) {
    console.log(`  inspected: ${outcome.schemaPath}`);
  }
  if (sites.length > 0) {
    console.log(
      `  configured sites: ${sites.join(', ')}`,
    );
  }
  console.log('');
  console.log(printSchemaPatchInstructions());
}

// ---------------------------------------------------------------------------
// Existing-pipeline detection (Issue #45)
// ---------------------------------------------------------------------------

/**
 * One signal found by `detectExistingPipeline`. The `kind` discriminator
 * lets the formatter group findings logically when multiple matches
 * land in the same category.
 */
export interface PipelineSignal {
  kind:
    | 'journal-tree'
    | 'editorial-skill'
    | 'editorial-astro-page'
    | 'editorial-script-module';
  /** Path relative to the project root, for display. */
  relativePath: string;
}

/**
 * The set of editorial-* skill names we consider strong signals when
 * three or more land. Sourced from the in-house implementation
 * deskwork was extracted from (audiocontrol). A coincidental single
 * match (e.g. a project happens to have one `editorial-add` skill)
 * doesn't trip the heuristic.
 */
const EDITORIAL_SKILL_NAMES: ReadonlySet<string> = new Set([
  'editorial-add',
  'editorial-plan',
  'editorial-outline',
  'editorial-draft',
  'editorial-publish',
  'editorial-iterate',
  'editorial-approve',
  'editorial-review-cancel',
  'editorial-review-help',
  'editorial-review-report',
  'editorial-distribute',
]);

/** Minimum editorial-* skills present before we treat them as a real pipeline. */
const EDITORIAL_SKILL_SIGNAL_THRESHOLD = 3;

/**
 * Walk the project for signals of a competing in-house editorial
 * implementation. Each branch is independent — any one signal is mild,
 * the combination is loud.
 */
export function detectExistingPipeline(
  projectRoot: string,
): PipelineSignal[] {
  const out: PipelineSignal[] = [];

  // Branch 1: audiocontrol-style journal tree.
  if (existsSync(join(projectRoot, 'journal/editorial'))) {
    out.push({
      kind: 'journal-tree',
      relativePath: 'journal/editorial/',
    });
  }

  // Branch 2: editorial-* skills under .claude/skills/. We require
  // EDITORIAL_SKILL_SIGNAL_THRESHOLD matches before reporting any of
  // them — a single coincidental match shouldn't trip the heuristic.
  const skillsDir = join(projectRoot, '.claude/skills');
  const skillMatches: string[] = [];
  if (existsSync(skillsDir)) {
    let entries: string[] = [];
    try {
      entries = readdirSync(skillsDir);
    } catch {
      entries = [];
    }
    for (const name of entries) {
      if (EDITORIAL_SKILL_NAMES.has(name)) {
        const abs = join(skillsDir, name);
        try {
          if (statSync(abs).isDirectory()) {
            skillMatches.push(name);
          }
        } catch {
          // ignore stat errors — name was already matched
        }
      }
    }
  }
  if (skillMatches.length >= EDITORIAL_SKILL_SIGNAL_THRESHOLD) {
    for (const name of skillMatches) {
      out.push({
        kind: 'editorial-skill',
        relativePath: `.claude/skills/${name}/`,
      });
    }
  }

  // Branch 3: src/sites/*/pages/dev/editorial-*.astro — the multi-site
  // pattern. We don't enumerate every page; one match anywhere is
  // enough to register the signal.
  const sitesDir = join(projectRoot, 'src/sites');
  if (existsSync(sitesDir)) {
    let siteNames: string[] = [];
    try {
      siteNames = readdirSync(sitesDir);
    } catch {
      siteNames = [];
    }
    for (const site of siteNames) {
      const pagesDir = join(sitesDir, site, 'pages/dev');
      if (!existsSync(pagesDir)) continue;
      let pageEntries: string[] = [];
      try {
        pageEntries = readdirSync(pagesDir);
      } catch {
        continue;
      }
      for (const page of pageEntries) {
        if (page.startsWith('editorial-') && page.endsWith('.astro')) {
          out.push({
            kind: 'editorial-astro-page',
            relativePath: `src/sites/${site}/pages/dev/${page}`,
          });
        }
      }
    }
  }

  // Branch 4: scripts/lib/editorial/ or scripts/lib/editorial-review/.
  for (const candidate of ['scripts/lib/editorial', 'scripts/lib/editorial-review']) {
    if (existsSync(join(projectRoot, candidate))) {
      out.push({
        kind: 'editorial-script-module',
        relativePath: `${candidate}/`,
      });
    }
  }

  return out;
}

/**
 * Print the existing-pipeline warning to stdout when signals were
 * detected. No-op when nothing was found.
 */
export function printExistingPipelineWarning(
  signals: ReadonlyArray<PipelineSignal>,
): void {
  if (signals.length === 0) return;
  console.log('');
  console.log(
    'Detected existing editorial-pipeline signals in this project:',
  );
  for (const s of signals) {
    console.log(`  - ${s.relativePath}`);
  }
  console.log('');
  console.log(
    'Deskwork will install ALONGSIDE the existing implementation, not replace it.',
  );
  console.log(
    'Resolve overlap manually before driving both pipelines against the same calendar.',
  );
  console.log('');
}
