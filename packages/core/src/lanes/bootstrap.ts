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
 *   - If the project has no `.deskwork/config.json` on disk (file
 *     ABSENT — never installed), returns `{ created: false, reason:
 *     'no-config' }` — there's no legacy site to migrate from.
 *   - If `.deskwork/config.json` is PRESENT but malformed or fails
 *     schema validation, this function THROWS (per
 *     AUDIT-20260530-10). The pre-fix docblock said "no readable
 *     config → no-config", which suggested corrupt configs would
 *     fall through to the same code path as absent ones — they do
 *     not. Loud failure is intentional: a project that has tried to
 *     install but corrupted its config should not have the bootstrap
 *     silently no-op on it; the error surfaces the config bug where
 *     the operator can fix it.
 *   - Otherwise, writes `.deskwork/lanes/default.json` with:
 *       id: 'default'
 *       name: 'Default'
 *       pipelineTemplate: 'editorial'
 *       scaffoldDefaults: { markdown: <projectConfig.sites[defaultSite].contentDir> }
 *     and appends a `lane-migration` journal event identifying the
 *     legacy site as the source. Returns
 *     `{ created: true, path: <pathWritten> }`. Per the sites→lanes
 *     retirement (Phase 39), a lane carries NO `contentDir` — the legacy
 *     site's content directory becomes the lane's add-time
 *     `scaffoldDefaults` for the `markdown` kind (the editorial
 *     pipeline's artifact kind), never identity or resolution.
 *
 * The function does NOT auto-fire from inside `loadLaneConfig`.
 * Coupling a read with a write would surprise callers; the bootstrap
 * is an explicit migration step that callers (CLI install flow,
 * studio first-boot, doctor migration) invoke when appropriate.
 *
 * The default lane's `scaffoldDefaults.markdown` is written verbatim
 * from the legacy `sites.<defaultSite>.contentDir`. Path normalization
 * (absolute vs relative, trailing slashes, symlink resolution) is
 * intentionally left to doctor — the bootstrap goal is to preserve
 * operator intent, not to second-guess it.
 */

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
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
 * yet. Returns a structured result identifying what happened —
 * `already-exists` and `no-config` (config ABSENT) are the two
 * non-throwing "nothing to do" branches, so callers can invoke this
 * unconditionally at install-flow boundaries.
 *
 * @param projectRoot - Absolute path to the project root.
 * @throws When `.deskwork/config.json` is PRESENT but malformed or
 *   fails schema validation — the read+parse failure bubbles up
 *   intentionally so the operator sees the config-side bug.
 *   AUDIT-20260530-10 locks this in: pre-fix the docblock said "no
 *   readable config → no-config", which suggested corrupt configs
 *   would fall through to no-config; they don't.
 * @throws When the config declares `defaultSite` but no matching
 *   `sites.<id>` entry exists (operator-fixable config bug).
 * @throws On filesystem-write failure or if the assembled lane config
 *   somehow fails its own schema validation (defensive guard against
 *   future schema drift; should not happen in practice).
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
  // readConfig validates the config against its Zod schema before
  // returning. Phase 39c (sites→lanes retirement): `sites`/`defaultSite`
  // are TOLERATED-as-absent. Two cases:
  //
  //   - Legacy site present (migration window): derive the default
  //     lane's `scaffoldDefaults.markdown` from the default site's
  //     contentDir, preserving operator intent.
  //   - No default site (sites-less, post-migration shape): write a
  //     default lane with NO `scaffoldDefaults`. A scaffold default is
  //     optional convenience metadata, not identity — a lane is fully
  //     valid without it. This is the path a freshly installed
  //     sites-less project takes.
  //
  // A PRESENT `defaultSite` that names a NON-existent site is still a
  // genuine config bug and throws below.
  const config = readConfig(projectRoot);
  const defaultSiteId = config.defaultSite;
  const hasDefaultSite = defaultSiteId !== '';
  const site = hasDefaultSite ? config.sites[defaultSiteId] : undefined;
  if (hasDefaultSite && site === undefined) {
    throw new Error(
      `bootstrapDefaultLaneIfMissing: config at ${cfgPath} declares `
      + `defaultSite="${defaultSiteId}" but no matching site under "sites". `
      + `Repair the config by adding a "sites.${defaultSiteId}" entry, or `
      + `updating "defaultSite" to a site that exists. The deskwork plugin's `
      + `/deskwork:install slash command can rewrite this from scratch if it `
      + `is loaded in the session.`,
    );
  }

  const lane: LaneConfig = {
    id: 'default',
    name: 'Default',
    pipelineTemplate: 'editorial',
    ...(site !== undefined ? { scaffoldDefaults: { markdown: site.contentDir } } : {}),
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

  // Compensating-write per AUDIT-20260530-13: if the journal append
  // fails, unlink the just-created lane file so the next invocation
  // can retry from a clean state. Without rollback, the project would
  // be left with a lane file + no migration audit record; subsequent
  // invocations return `already-exists` and never re-attempt the
  // missing journal event. The unlink-then-rethrow shape mirrors the
  // compensating-write pattern used elsewhere in the project.
  try {
    await appendJournalEvent(projectRoot, {
      kind: 'lane-migration',
      at: new Date().toISOString(),
      migration: site !== undefined
        ? 'default-lane-from-legacy-site'
        : 'default-lane-sites-less',
      source: hasDefaultSite ? `sites.${defaultSiteId}` : 'config(no-sites)',
      target: 'lanes.default',
      // New events emit `scaffoldDefaults` (Phase 39); the legacy
      // `contentDir` detail key is gone from new writes. Old on-disk
      // events that carry `contentDir` still parse — the event's
      // `details` is a free-form `z.record(z.string(), z.unknown())`.
      // A sites-less default lane carries no scaffoldDefaults.
      details: {
        ...(hasDefaultSite ? { legacySiteId: defaultSiteId } : {}),
        ...(site !== undefined
          ? { scaffoldDefaults: { markdown: site.contentDir } }
          : {}),
        pipelineTemplate: 'editorial',
      },
    });
  } catch (err) {
    // Best-effort cleanup: if the unlink itself fails (e.g. the file
    // was unlinked from under us between the write and the rollback)
    // we rethrow the journal error rather than the cleanup error,
    // because the journal failure is the actionable root cause.
    try {
      unlinkSync(targetPath);
    } catch {
      // Swallow the unlink-side error so the journal-append error
      // surfaces clean. The post-condition the rollback guards (no
      // orphaned lane file) is best-effort under disk contention;
      // any residual file shows up at the next bootstrap invocation,
      // which the already-exists path handles.
    }
    throw err;
  }

  return { created: true, path: targetPath, lane: validated.data };
}
