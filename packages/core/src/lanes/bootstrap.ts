/**
 * Default-lane bootstrap (Phase 3 Task 3.4).
 *
 * `bootstrapDefaultLaneIfMissing(projectRoot)` is the migration hook
 * that lets a pre-graphical-entries project — one with a legacy
 * `sites.<defaultSite>.contentDir` block in its `.deskwork/config.json`
 * but no `.deskwork/lanes/default.json` — start participating in the
 * new lane-aware model without explicit operator setup.
 *
 * Behavior:
 *
 *   - If `.deskwork/lanes/default.json` already exists, returns
 *     `{ created: false, reason: 'already-exists' }` without
 *     side-effects.
 *   - If the project has no readable `.deskwork/config.json` (e.g.
 *     never installed), returns `{ created: false, reason:
 *     'no-config' }` — there's no legacy site to migrate from.
 *   - Otherwise, writes `.deskwork/lanes/default.json` with:
 *       id: 'default'
 *       name: 'Default'
 *       pipelineTemplate: 'editorial'
 *       contentDir: <projectConfig.sites[defaultSite].contentDir>
 *     and appends a `lane-migration` journal event identifying the
 *     legacy site as the source. Returns
 *     `{ created: true, path: <pathWritten> }`.
 *
 * The function does NOT auto-fire from inside `loadLaneConfig`.
 * Coupling a read with a write would surprise callers; the bootstrap
 * is an explicit migration step that callers (CLI install flow,
 * studio first-boot, doctor migration) invoke when appropriate.
 *
 * The default lane's `contentDir` is written verbatim from the legacy
 * `sites.<defaultSite>.contentDir`. Path normalization (absolute vs
 * relative, trailing slashes, symlink resolution) is intentionally
 * left to doctor — the bootstrap goal is to preserve operator intent,
 * not to second-guess it.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readConfig, configPath } from '../config.ts';
import { appendJournalEvent } from '../journal/append.ts';
import { laneConfigPath } from './loader.ts';
import { LaneConfigSchema, type LaneConfig } from './types.ts';

export type BootstrapResult =
  | { created: false; reason: 'already-exists'; path: string }
  | { created: false; reason: 'no-config'; path: string }
  | { created: true; path: string; lane: LaneConfig };

/**
 * Bootstrap a `default` lane bound to `editorial` from the project's
 * legacy `sites.<defaultSite>.contentDir`, if no default lane exists
 * yet. Returns a structured result identifying what happened — never
 * throws on the "nothing to do" cases (already-exists, no-config), so
 * callers can invoke this unconditionally at install-flow boundaries.
 *
 * @param projectRoot - Absolute path to the project root.
 * @throws Only on filesystem-write failure or if the assembled lane
 *   config somehow fails its own schema validation (defensive guard
 *   against future schema drift; should not happen in practice).
 */
export async function bootstrapDefaultLaneIfMissing(
  projectRoot: string,
): Promise<BootstrapResult> {
  const targetPath = laneConfigPath(projectRoot, 'default');
  if (existsSync(targetPath)) {
    return { created: false, reason: 'already-exists', path: targetPath };
  }

  // Probe the legacy config. If it's absent or unreadable, there's
  // no legacy site to migrate from — return "no-config" rather than
  // bubbling the read error, so callers can treat this as a
  // best-effort hook.
  const cfgPath = configPath(projectRoot);
  if (!existsSync(cfgPath)) {
    return { created: false, reason: 'no-config', path: targetPath };
  }
  const config = readConfig(projectRoot);
  const defaultSiteId = config.defaultSite;
  const site = config.sites[defaultSiteId];
  if (!site) {
    throw new Error(
      `bootstrapDefaultLaneIfMissing: config at ${cfgPath} declares `
      + `defaultSite="${defaultSiteId}" but no matching site under "sites". `
      + `Run /deskwork:install to fix the config.`,
    );
  }

  const lane: LaneConfig = {
    id: 'default',
    name: 'Default',
    pipelineTemplate: 'editorial',
    contentDir: site.contentDir,
  };

  // Defensive: round-trip through the schema before writing, so the
  // file on disk is guaranteed to satisfy the loader's contract.
  const validated = LaneConfigSchema.safeParse(lane);
  if (!validated.success) {
    throw new Error(
      `bootstrapDefaultLaneIfMissing: assembled lane config failed schema validation: `
      + `${validated.error.message}`,
    );
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(validated.data, null, 2) + '\n', 'utf8');

  await appendJournalEvent(projectRoot, {
    kind: 'lane-migration',
    at: new Date().toISOString(),
    migration: 'default-lane-from-legacy-site',
    source: `sites.${defaultSiteId}`,
    target: 'lanes.default',
    details: {
      legacySiteId: defaultSiteId,
      contentDir: site.contentDir,
      pipelineTemplate: 'editorial',
    },
  });

  return { created: true, path: targetPath, lane: validated.data };
}
