/**
 * plugins/dw-lifecycle/src/scope-discovery/migrate-from-pilot-plan.ts
 *
 * Pure planning + diff + render logic for `migrate-from-pilot`. Carved
 * out of `migrate-from-pilot.ts` to keep that file under the 300–500
 * line guideline; the orchestrator entrypoint owns CLI parsing, the
 * apply-side disk I/O, and `migrateFromPilotMain`'s exit-code handling,
 * while this module owns:
 *
 *   - constants for the pilot ↔ adopter layout (config dir names,
 *     CONFIG YAML allowlist, plugin defaults dir)
 *   - the planning pass (`planMigration`) that classifies CONFIG entries
 *     + CODE diffs into structured `ConfigEntry` / `CodeEntry` shapes
 *   - the categorization primitive (`diffCodeFile`) that maps the
 *     set-based pilot-vs-plugin line diff to one of six `CodeStatus`
 *     values
 *   - the markdown report renderer (`renderReport`) the orchestrator
 *     prints to stdout or `--report-out <path>`
 *
 * Everything here is synchronous and FS-read-only by design: keeping
 * the planning pass deterministic + side-effect-free makes the verb's
 * dry-run mode trivially auditable (same inputs → same plan, no
 * filesystem state changes).
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Plugin defaults directory (the dw-lifecycle plugin's
 * `src/scope-discovery/` source tree). Used for the CODE diff side of
 * the migration: each pilot `tools/scope-discovery/<name>.ts` is
 * compared against `<PLUGIN_DEFAULTS_DIR>/<name>.ts`.
 *
 * `import.meta.url`-relative resolution makes this stable across the
 * workspace symlink dev path AND the marketplace-installed npm cache
 * path — both place the file at `.../scope-discovery/migrate-from-pilot-plan.js`
 * so the sibling files resolve identically.
 */
export const PLUGIN_DEFAULTS_DIR = __dirname;

/** Subdirectory under the pilot root where CONFIG YAMLs live. */
export const PILOT_CONFIG_REL = join('docs', 'scope-discovery');

/** Subdirectory under the pilot root where CODE TypeScript sources live. */
export const PILOT_CODE_REL = join('tools', 'scope-discovery');

/** Subdirectory under the adopter root where CONFIG YAMLs go. */
export const ADOPTER_CONFIG_REL = join('.dw-lifecycle', 'scope-discovery');

/**
 * CONFIG YAMLs the verb migrates verbatim from the pilot. The
 * deprecation-queue extension lands when the pilot has a YAML form of
 * it (the pilot's v1 ships an `.md` form; the YAML is the v2 shape).
 * Missing files on the pilot side are skipped (recorded as "absent").
 */
export const CONFIG_YAML_NAMES: ReadonlyArray<string> = [
  'clones.yaml',
  'anti-patterns.yaml',
  'adopter-manifests.yaml',
  'deprecation-queue.yaml',
];

/** Per-CONFIG-file action recorded during the plan/apply pass. */
export type ConfigAction =
  | 'absent-on-pilot'
  | 'planned-copy'
  | 'copied'
  | 'matches'
  | 'conflict-refused'
  | 'overwritten';

export interface ConfigEntry {
  readonly name: string;
  readonly action: ConfigAction;
  readonly pilotPath: string;
  readonly targetPath: string;
  readonly reason?: string;
}

/** Per-CODE-file diff classification. */
export type CodeStatus =
  | 'identical'
  | 'pilot-ahead'
  | 'pilot-behind'
  | 'diverges'
  | 'plugin-only'
  | 'pilot-only';

export interface CodeEntry {
  readonly name: string;
  readonly status: CodeStatus;
  readonly pilotPath: string;
  readonly pluginPath: string;
  /** Lines unique to the pilot (present pilot-side, absent plugin-side). */
  readonly addedInPilot: number;
  /** Lines unique to the plugin (absent pilot-side, present plugin-side). */
  readonly removedInPilot: number;
  /** Operator-facing one-liner that names the suggested follow-up action. */
  readonly suggestedAction: string;
}

export interface PlanInput {
  readonly pilotRoot: string;
  readonly target: string;
  readonly apply: boolean;
  readonly force: boolean;
}

export interface MigrationPlan {
  readonly pilotRoot: string;
  readonly target: string;
  readonly apply: boolean;
  readonly force: boolean;
  readonly configEntries: ReadonlyArray<ConfigEntry>;
  readonly codeEntries: ReadonlyArray<CodeEntry>;
}

/**
 * Read a file's text content; return null when missing. Used for both
 * pilot-side and plugin-side lookups so absent files surface as
 * categorization signals rather than orchestrator errors.
 */
function readTextOrNull(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

/**
 * Enumerate the pilot's `tools/scope-discovery/` TypeScript filenames.
 * Throws when the directory is absent — the verb's primary precondition.
 * Filters to `.ts` (excluding `.d.ts`) to match the source surface the
 * plugin ships. Returns names sorted alphabetically for deterministic
 * report ordering.
 */
function listPilotCodeFiles(pilotRoot: string): ReadonlyArray<string> {
  const dir = join(pilotRoot, PILOT_CODE_REL);
  if (!existsSync(dir)) {
    throw new Error(
      `pilot directory not found: ${dir}\n` +
        '  The pilot root must contain `tools/scope-discovery/` to migrate from. ' +
        'Pass `--pilot-root <path>` pointing at the project root that ships ' +
        '`tools/scope-discovery/` + `docs/scope-discovery/`.',
    );
  }
  const entries: ReadonlyArray<string> = readdirSync(dir);
  return entries
    .filter((n) => n.endsWith('.ts') && !n.endsWith('.d.ts'))
    .sort();
}

/**
 * Categorize a pilot CODE file against the plugin default. The
 * line-diff is set-based (lines unique to one side / the other side)
 * rather than a textual unified diff — the report's column is "lines
 * added / removed" not "lines changed," so set membership is the right
 * primitive.
 */
function diffCodeFile(args: {
  readonly name: string;
  readonly pilotText: string | null;
  readonly pluginText: string | null;
  readonly pilotPath: string;
  readonly pluginPath: string;
}): CodeEntry {
  const { name, pilotText, pluginText, pilotPath, pluginPath } = args;
  if (pilotText === null && pluginText === null) {
    return {
      name,
      status: 'pilot-only',
      pilotPath,
      pluginPath,
      addedInPilot: 0,
      removedInPilot: 0,
      suggestedAction: 'file disappeared between enumeration and read',
    };
  }
  if (pilotText === null) {
    return {
      name,
      status: 'plugin-only',
      pilotPath,
      pluginPath,
      addedInPilot: 0,
      removedInPilot: 0,
      suggestedAction:
        'plugin ships this file; pilot does not. Nothing to migrate.',
    };
  }
  if (pluginText === null) {
    return {
      name,
      status: 'pilot-only',
      pilotPath,
      pluginPath,
      addedInPilot: pilotText.split('\n').length,
      removedInPilot: 0,
      suggestedAction:
        'pilot-only file; no plugin counterpart. Contribute-back candidate (new file the plugin does not ship yet).',
    };
  }
  if (pilotText === pluginText) {
    return {
      name,
      status: 'identical',
      pilotPath,
      pluginPath,
      addedInPilot: 0,
      removedInPilot: 0,
      suggestedAction: 'no divergence; nothing to do.',
    };
  }
  const pilotLines = new Set(pilotText.split('\n'));
  const pluginLines = new Set(pluginText.split('\n'));
  let addedInPilot = 0;
  let removedInPilot = 0;
  for (const line of pilotLines) {
    if (!pluginLines.has(line)) addedInPilot += 1;
  }
  for (const line of pluginLines) {
    if (!pilotLines.has(line)) removedInPilot += 1;
  }
  // Categorization:
  //   - addedInPilot > 0 AND removedInPilot === 0  → pilot is ahead (superset)
  //   - addedInPilot === 0 AND removedInPilot > 0  → pilot is behind (subset)
  //   - both > 0                                   → diverges (overlapping changes)
  // The (0, 0) case is excluded above by the early `pilotText === pluginText`.
  if (addedInPilot > 0 && removedInPilot === 0) {
    return {
      name,
      status: 'pilot-ahead',
      pilotPath,
      pluginPath,
      addedInPilot,
      removedInPilot,
      suggestedAction:
        'contribute-back candidate; file an issue + PR upstream to dw-lifecycle.',
    };
  }
  if (addedInPilot === 0 && removedInPilot > 0) {
    return {
      name,
      status: 'pilot-behind',
      pilotPath,
      pluginPath,
      addedInPilot,
      removedInPilot,
      suggestedAction:
        'pilot stale; sync from plugin via `/dw-lifecycle:customize scope-discovery ' +
        name.replace(/\.ts$/, '') +
        '`.',
    };
  }
  return {
    name,
    status: 'diverges',
    pilotPath,
    pluginPath,
    addedInPilot,
    removedInPilot,
    suggestedAction:
      'customize-override candidate; copy pilot version to `.dw-lifecycle/scope-discovery/' +
      name +
      '` via `/dw-lifecycle:customize`.',
  };
}

/**
 * Compute the migration plan: enumerate CONFIG entries (pilot YAMLs to
 * adopter destinations) + CODE entries (per-file diff classifications).
 * No FS writes — the caller decides whether to materialize the plan
 * (orchestrator's `applyConfigCopies`).
 */
export function planMigration(input: PlanInput): MigrationPlan {
  // Validate the pilot root presence first — failures here are the
  // verb's primary refusal mode and must be unmistakable.
  const codeFiles = listPilotCodeFiles(input.pilotRoot);

  // CONFIG entries.
  const configEntries: ConfigEntry[] = [];
  for (const name of CONFIG_YAML_NAMES) {
    const pilotPath = join(input.pilotRoot, PILOT_CONFIG_REL, name);
    const targetPath = join(input.target, ADOPTER_CONFIG_REL, name);
    if (!existsSync(pilotPath)) {
      configEntries.push({
        name,
        action: 'absent-on-pilot',
        pilotPath,
        targetPath,
        reason: 'pilot does not ship this YAML; nothing to copy.',
      });
      continue;
    }
    const pilotText = readFileSync(pilotPath, 'utf8');
    const targetExists = existsSync(targetPath);
    if (!targetExists) {
      configEntries.push({
        name,
        action: 'planned-copy',
        pilotPath,
        targetPath,
      });
      continue;
    }
    const targetText = readFileSync(targetPath, 'utf8');
    if (pilotText === targetText) {
      configEntries.push({
        name,
        action: 'matches',
        pilotPath,
        targetPath,
        reason: 'target already matches pilot byte-for-byte.',
      });
      continue;
    }
    if (!input.force) {
      configEntries.push({
        name,
        action: 'conflict-refused',
        pilotPath,
        targetPath,
        reason:
          'target file exists with different content; pass `--force` to overwrite.',
      });
      continue;
    }
    configEntries.push({
      name,
      action: 'planned-copy',
      pilotPath,
      targetPath,
      reason: 'target differs from pilot; --force will overwrite.',
    });
  }

  // CODE entries.
  const codeEntries: CodeEntry[] = [];
  for (const name of codeFiles) {
    const pilotPath = join(input.pilotRoot, PILOT_CODE_REL, name);
    const pluginPath = join(PLUGIN_DEFAULTS_DIR, name);
    codeEntries.push(
      diffCodeFile({
        name,
        pilotText: readTextOrNull(pilotPath),
        pluginText: readTextOrNull(pluginPath),
        pilotPath,
        pluginPath,
      }),
    );
  }

  return {
    pilotRoot: input.pilotRoot,
    target: input.target,
    apply: input.apply,
    force: input.force,
    configEntries,
    codeEntries,
  };
}

const STATUS_SYMBOL: Record<CodeStatus, string> = {
  identical: '✓',
  'pilot-ahead': '↑',
  'pilot-behind': '↓',
  diverges: '≠',
  'plugin-only': '—',
  'pilot-only': '+',
};

/**
 * Render the migration plan as a markdown report. The CODE table is the
 * primary operator deliverable: per-file status + suggested action.
 * CONFIG actions surface above it as a short bullet list because copy
 * semantics are simpler than diff categorization.
 */
export function renderReport(args: {
  readonly plan: MigrationPlan;
  readonly configEntries: ReadonlyArray<ConfigEntry>;
}): string {
  const { plan, configEntries } = args;
  const lines: string[] = [];
  lines.push('# migrate-from-pilot report');
  lines.push('');
  lines.push(`- Pilot root: \`${plan.pilotRoot}\``);
  lines.push(`- Adopter target: \`${plan.target}\``);
  lines.push(`- Mode: ${plan.apply ? 'apply' : 'dry-run'}`);
  if (plan.force) lines.push('- Force: enabled');
  lines.push('');
  lines.push('## CONFIG migration');
  lines.push('');
  if (configEntries.length === 0) {
    lines.push('_No CONFIG entries planned._');
  } else {
    for (const e of configEntries) {
      const note =
        e.reason !== undefined && e.reason !== ''
          ? ` — ${e.reason}`
          : '';
      lines.push(`- **${e.name}** — ${e.action}${note}`);
    }
  }
  lines.push('');
  lines.push('## CODE diff (pilot vs plugin defaults)');
  lines.push('');
  if (plan.codeEntries.length === 0) {
    lines.push('_No CODE files found at `<pilot-root>/tools/scope-discovery/`._');
  } else {
    lines.push('| File | Status | +/- (pilot vs plugin) | Suggested action |');
    lines.push('|---|---|---|---|');
    for (const e of plan.codeEntries) {
      const symbol = STATUS_SYMBOL[e.status];
      lines.push(
        `| \`${e.name}\` | ${symbol} ${e.status} | ` +
          `+${e.addedInPilot} / -${e.removedInPilot} | ` +
          `${e.suggestedAction} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Legend');
  lines.push('');
  lines.push('- ✓ **identical** — no divergence; nothing to do.');
  lines.push(
    '- ↑ **pilot-ahead** — contribute-back candidate; the pilot has lines the plugin defaults lack.',
  );
  lines.push(
    '- ↓ **pilot-behind** — pilot stale; sync from plugin via `/dw-lifecycle:customize scope-discovery <name>`.',
  );
  lines.push(
    '- ≠ **diverges** — customize-override candidate; the pilot has overlapping changes vs the plugin defaults.',
  );
  lines.push(
    '- **pilot-only** — pilot ships a file the plugin does not; contribute-back candidate (new module).',
  );
  lines.push(
    '- **plugin-only** — plugin ships a file the pilot does not; nothing to migrate.',
  );
  lines.push('');
  return lines.join('\n');
}

export interface CodeSummary {
  readonly identical: number;
  readonly pilotAhead: number;
  readonly pilotBehind: number;
  readonly diverges: number;
  readonly pilotOnly: number;
  readonly pluginOnly: number;
}

export function summarizeCodeEntries(
  entries: ReadonlyArray<CodeEntry>,
): CodeSummary {
  let identical = 0;
  let pilotAhead = 0;
  let pilotBehind = 0;
  let diverges = 0;
  let pilotOnly = 0;
  let pluginOnly = 0;
  for (const e of entries) {
    switch (e.status) {
      case 'identical':
        identical += 1;
        break;
      case 'pilot-ahead':
        pilotAhead += 1;
        break;
      case 'pilot-behind':
        pilotBehind += 1;
        break;
      case 'diverges':
        diverges += 1;
        break;
      case 'pilot-only':
        pilotOnly += 1;
        break;
      case 'plugin-only':
        pluginOnly += 1;
        break;
    }
  }
  return { identical, pilotAhead, pilotBehind, diverges, pilotOnly, pluginOnly };
}
