/**
 * Rule: sites-to-lanes-migration (Phase 39b).
 *
 * Detects the pre-migration shape and migrates it under `--fix`. Per the
 * sites→lanes retirement spec (`docs/superpowers/specs/2026-06-02-sites-
 * to-lanes-retirement-design.md` §"Migration"):
 *
 *   Detect (audit): `config.sites` is present (legacy shape) OR any
 *   artifact-bearing entry lacks `artifactPath`. The rule emits a
 *   detection finding describing what `--fix` will do, PLUS one
 *   `migration-ambiguous` finding per entry whose slug+stage resolves to
 *   more than one candidate file (AUDIT-20260602-03 — see the backfiller).
 *
 *   Fix (apply): three steps, in order:
 *     1. Lanes from sites — per legacy `site`, create/ensure a lane
 *        whose `id` is the site slug, `pipelineTemplate: editorial`,
 *        `host ← site.host` (when present), and `scaffoldDefaults` keyed
 *        at minimum by `markdown → site.contentDir`.
 *     2. Backfill `artifactPath` — stamp every UNAMBIGUOUS artifact-
 *        bearing entry from its single on-disk candidate. Ambiguous
 *        entries are REFUSED (the backfiller's ambiguity-halt).
 *     3. Drop `sites` — remove the `sites` / `defaultSite` block from the
 *        on-disk config.
 *
 * Project-scoped despite the runner's per-site loop: the runner calls
 * each rule once per `Object.keys(config.sites)`. This rule is a
 * whole-project operation (it rewrites the single config + every
 * sidecar), so it acts ONLY on the runner's FIRST site pass and no-ops
 * on the rest — guarded by `isLeadSite`. Its source of truth is the
 * on-disk config read through the migration-only tolerant reader
 * (`legacy-config.ts`), NOT `ctx.config`, so once `sites` is dropped a
 * re-run sees nothing to migrate (idempotency).
 *
 * Sibling-relative imports per the doctor convention.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { appendJournalEvent } from '../../journal/append.ts';
import { commitLaneConfig } from '../../lanes/operations/commit.ts';
import { laneConfigPath, lanesDir, loadLaneConfig } from '../../lanes/loader.ts';
import { LaneConfigSchema, type LaneConfig } from '../../lanes/types.ts';
import {
  dropSitesBlock,
  readLegacySites,
  type LegacySite,
} from '../legacy-config.ts';
import {
  backfillFromLegacySites,
  detectAmbiguousBackfills,
  type AmbiguousBackfill,
  type LaneBase,
} from '../sites-migration-backfill.ts';
import { readAllSidecars } from '../../sidecar/read-all.ts';
import type {
  DoctorContext,
  DoctorRule,
  Finding,
  RepairPlan,
  RepairResult,
} from '../types.ts';

const RULE_ID = 'sites-to-lanes-migration';
const AMBIGUOUS_RULE_ID = 'migration-ambiguous';
const MIGRATION_PIPELINE_TEMPLATE = 'editorial';

/**
 * The migration is whole-project. Phase 39c collapsed the runner's
 * per-site loop into a single project pass (`runner.ts` `PROJECT_SCOPE`),
 * so this rule now fires exactly once per run regardless. The guard is
 * retained as a constant `true` (its source of truth is the on-disk
 * config via `readLegacySites`, not `ctx.config`, so idempotency is
 * unaffected).
 */
function isLeadSite(_ctx: DoctorContext): boolean {
  return true;
}

/**
 * Collect the legacy bases (one per legacy site) — each site's contentDir
 * paired with the lane id it migrates to (the site slug). These are the
 * bases the backfiller searches; the lane id lets it stamp the migrated
 * entry's `lane` (AUDIT-20260603-12). Returns an empty array when there
 * are no legacy sites (post-migration).
 */
function legacyLaneBases(sites: ReadonlyMap<string, LegacySite>): LaneBase[] {
  return [...sites.entries()].map(([slug, s]) => ({
    laneId: slug,
    contentDir: s.contentDir,
  }));
}

/**
 * Whether any artifact-bearing entry still lacks `artifactPath`.
 *
 * Does NOT swallow read errors (AUDIT-20260603-14). A corrupt sidecar
 * makes `readAllSidecars` throw; previously this was caught and turned
 * into `false`, so `audit()` silently under-reported ("nothing missing")
 * on the exact on-disk state that `apply()` rejects — an audit/apply
 * asymmetry the project's "no swallowed exceptions" rule names as a bug
 * factory. The throw now propagates to `audit()`, which converts it into
 * an `error` finding (so audit and apply agree on corrupt input, and the
 * run still completes — AUDIT-20260603-13).
 */
async function anyEntryMissingArtifactPath(projectRoot: string): Promise<boolean> {
  const entries = await readAllSidecars(projectRoot);
  return entries.some(
    (e) => e.artifactPath === undefined || e.artifactPath === '',
  );
}

/**
 * Build the per-site lane config (id = slug). Carries the site's
 * website-publishing metadata forward when present: `host` (Decision #2)
 * and `redirectsPath` (Decision #23 / c4) re-home onto the lane as
 * optional siblings; each is omitted entirely when the legacy site did
 * not declare it (no empty-string writes). `scaffoldDefaults.markdown`
 * captures the legacy contentDir as the add-time default — never
 * identity or resolution.
 */
function laneFromSite(slug: string, site: LegacySite): LaneConfig {
  const lane: LaneConfig = {
    id: slug,
    name: slug,
    pipelineTemplate: MIGRATION_PIPELINE_TEMPLATE,
    // Per Phase 39c the lane carries no `contentDir` — the legacy site's
    // content directory becomes the lane's add-time `scaffoldDefaults`
    // (the `markdown` kind, the editorial pipeline's artifact kind).
    // Location info is the ENTRY's `artifactPath`, never the lane.
    scaffoldDefaults: { markdown: site.contentDir },
    ...(site.host !== undefined ? { host: site.host } : {}),
    ...(site.redirectsPath !== undefined
      ? { redirectsPath: site.redirectsPath }
      : {}),
  };
  return lane;
}

/**
 * Collect the migration's detection + ambiguity findings. Extracted from
 * `audit()` so the latter can wrap it in a single try/catch that converts
 * any read throw into an `error` finding (AUDIT-20260603-13/-14) without
 * the detection logic itself growing a defensive nest. May throw —
 * `audit()` is its only caller and handles the throw.
 */
async function collectFindings(ctx: DoctorContext): Promise<Finding[]> {
  const { sites } = readLegacySites(ctx.projectRoot);
  const sitesPresent = sites.size > 0;
  const missingArtifactPath = await anyEntryMissingArtifactPath(ctx.projectRoot);

  const findings: Finding[] = [];

  if (sitesPresent || missingArtifactPath) {
    const slugs = [...sites.keys()];
    findings.push({
      ruleId: RULE_ID,
      site: ctx.site,
      severity: 'warning',
      message:
        `Project uses the legacy "sites" model` +
        (sitesPresent ? ` (${slugs.length} site(s): ${slugs.join(', ')})` : '') +
        (missingArtifactPath ? ' and has entries missing artifactPath' : '') +
        `. --fix migrates each site to a lane (host + scaffoldDefaults), ` +
        `backfills each unambiguous entry's artifactPath, and drops the ` +
        `sites block. Slug-collision entries (resolving to >1 file) are ` +
        `refused and reported as migration-ambiguous.`,
      details: {
        siteSlugs: slugs,
        sitesPresent,
        missingArtifactPath,
      },
    });
  }

  // Surface ambiguity collisions as their own findings BEFORE any fix
  // runs (AUDIT-20260602-03). These are report-only — the migration
  // refuses to stamp them.
  const bases = legacyLaneBases(sites);
  if (bases.length > 0) {
    const ambiguous = await detectAmbiguousBackfills(ctx.projectRoot, bases);
    for (const amb of ambiguous) {
      findings.push(ambiguousFinding(ctx.site, amb));
    }
  }

  return findings;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Migrate legacy sites to lanes (Phase 39 sites→lanes retirement)',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    if (!isLeadSite(ctx)) return [];

    // The migration's reads can throw on a broken-but-present config (a
    // legacy site missing `contentDir` — `readLegacySites`) or a corrupt
    // sidecar (`readAllSidecars` via `anyEntryMissingArtifactPath` /
    // `detectAmbiguousBackfills`). An uncaught throw here aborts the WHOLE
    // doctor run, denying the operator every other rule's output
    // (AUDIT-20260603-13). The runner does not guard `rule.audit()`, so
    // the rule guards itself: any throw becomes an `error`-severity
    // finding naming the problem, and the run continues. This also keeps
    // audit and apply consistent on corrupt sidecars (AUDIT-20260603-14):
    // both surface the corruption loudly rather than audit silently
    // reporting clean while apply throws.
    try {
      return await collectFindings(ctx);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return [
        {
          ruleId: RULE_ID,
          site: ctx.site,
          severity: 'error',
          message:
            `sites-to-lanes migration could not inspect the project: ${reason}. ` +
            `Repair the offending config or sidecar and re-run doctor.`,
          details: { error: reason },
        },
      ];
    }
  },

  async plan(_ctx: DoctorContext, finding: Finding): Promise<RepairPlan> {
    if (finding.ruleId === AMBIGUOUS_RULE_ID) {
      const rawCandidates = finding.details.candidates;
      const candidates = Array.isArray(rawCandidates)
        ? rawCandidates.map((c) => String(c))
        : [];
      return {
        kind: 'report-only',
        finding,
        reason:
          `Entry ${String(finding.details.entryUuid)} (slug=${String(finding.details.slug)}) ` +
          `resolves to ${candidates.length} candidate files across legacy site ` +
          `contentDirs: ${candidates.join(', ')}. The migration refuses to stamp ` +
          `an ambiguous guess (it would launder a #394-class collision into ` +
          `permanent data). Disambiguate manually — set the entry's artifactPath ` +
          `explicitly, or remove the duplicate file — then re-run doctor --fix.`,
      };
    }
    return {
      kind: 'apply',
      finding,
      summary:
        'migrate legacy sites → lanes: create lanes (host + scaffoldDefaults), ' +
        'backfill unambiguous entry artifactPaths, drop the sites block',
      payload: {},
    };
  },

  async apply(ctx: DoctorContext, plan: RepairPlan): Promise<RepairResult> {
    if (plan.kind !== 'apply') {
      return {
        finding: plan.finding,
        applied: false,
        message: 'plan is not directly appliable',
        skipReason: 'apply-failed',
      };
    }

    try {
      const { sites } = readLegacySites(ctx.projectRoot);
      const bases = legacyLaneBases(sites);

      // No legacy sites to migrate, but the detection still fired — that
      // means it fired on `missingArtifactPath` alone (AUDIT-20260603-15).
      // Every repair action keys off legacy sites: lane creation iterates
      // `sites`, and the backfiller only searches each legacy
      // `site.contentDir`. With no bases there is nothing this migration
      // can stamp, so claiming `applied: true` would advertise a
      // successful fix for a run that changed nothing and did not converge
      // (the next audit re-fires the same finding). Report honestly: the
      // entries need the lane-native back-fill, not the sites→lanes path.
      if (bases.length === 0) {
        const stillMissing = await anyEntryMissingArtifactPath(ctx.projectRoot);
        if (stillMissing) {
          return {
            finding: plan.finding,
            applied: false,
            message:
              'sites-to-lanes: no legacy sites to migrate, but entries still ' +
              'lack artifactPath. This migration only back-fills from legacy ' +
              'site contentDirs, of which there are none — it cannot stamp ' +
              'these entries. Back-fill via the lane-native path ' +
              '(`migrateLaneMembership` / `/deskwork:lane move`) instead.',
            skipReason: 'prerequisite-missing',
          };
        }
        // No sites AND nothing missing → genuinely nothing to do.
        return {
          finding: plan.finding,
          applied: false,
          message:
            'sites-to-lanes: no legacy sites and no entries missing ' +
            'artifactPath — nothing to migrate.',
          skipReason: 'no-action-needed',
        };
      }

      // Step 1 — lanes from sites (idempotent: skip an existing lane file).
      const lanesCreated: string[] = [];
      if (sites.size > 0) {
        mkdirSync(lanesDir(ctx.projectRoot), { recursive: true });
      }
      for (const [slug, site] of sites) {
        const target = laneConfigPath(ctx.projectRoot, slug);
        if (existsSync(target)) {
          // AUDIT-20260604-10: a pre-existing lane file (re-run / partial
          // migration) was previously skipped wholesale — then Step 3's
          // dropSitesBlock removed the only remaining copy of the legacy
          // `redirectsPath`, silently discarding it. Merge the legacy
          // redirectsPath onto the existing lane when the lane lacks it.
          //
          // Faithfulness (AUDIT-20260604-08-followup / claude-02): reading
          // via loadLaneConfig is faithful here because LaneConfigSchema is
          // `.strict()` with NO `.default()` fields — a successfully-loaded
          // lane carries exactly its on-disk valid fields ($rationale
          // included), and an unknown key would have THROWN at load (strict),
          // not been silently stripped. So `{ ...existing, redirectsPath }`
          // adds one field and re-writes the rest verbatim; commitLaneConfig
          // re-validates via the same LaneConfigSchema.safeParse gate the
          // create branch uses below. Only the c4-introduced redirectsPath is
          // reconciled; other fields are not re-derived (the lane already
          // exists by operator/earlier intent).
          if (site.redirectsPath !== undefined) {
            const existing = loadLaneConfig(slug, ctx.projectRoot);
            if (existing.redirectsPath === undefined) {
              commitLaneConfig(
                ctx.projectRoot,
                slug,
                { ...existing, redirectsPath: site.redirectsPath },
                'merge-legacy-redirectsPath',
              );
              await appendJournalEvent(ctx.projectRoot, {
                kind: 'lane-migration',
                at: new Date().toISOString(),
                migration: 'merge-redirectsPath-into-existing-lane',
                source: `sites.${slug}`,
                target: `lanes.${slug}`,
                details: { legacySiteId: slug, redirectsPath: site.redirectsPath },
              });
            }
          }
          continue;
        }
        const lane = laneFromSite(slug, site);
        const validated = LaneConfigSchema.safeParse(lane);
        if (!validated.success) {
          return {
            finding: plan.finding,
            applied: false,
            message:
              `sites-to-lanes: lane for site "${slug}" failed schema validation: ` +
              validated.error.message,
            skipReason: 'apply-failed',
          };
        }
        commitLaneConfig(ctx.projectRoot, slug, validated.data, 'create');
        await appendJournalEvent(ctx.projectRoot, {
          kind: 'lane-migration',
          at: new Date().toISOString(),
          migration: 'lane-from-legacy-site',
          source: `sites.${slug}`,
          target: `lanes.${slug}`,
          details: {
            legacySiteId: slug,
            scaffoldMarkdown: site.contentDir,
            ...(site.host !== undefined ? { host: site.host } : {}),
            ...(site.redirectsPath !== undefined
              ? { redirectsPath: site.redirectsPath }
              : {}),
          },
        });
        lanesCreated.push(slug);
      }

      // Step 2 — backfill unambiguous entry artifactPaths (ambiguity-halt).
      const backfill = await backfillFromLegacySites(ctx.projectRoot, bases);

      // Step 3 — drop the sites block from the config.
      const dropped = dropSitesBlock(ctx.projectRoot);
      if (dropped) {
        await appendJournalEvent(ctx.projectRoot, {
          kind: 'lane-migration',
          at: new Date().toISOString(),
          migration: 'drop-sites-block',
          source: '.deskwork/config.json#sites',
          target: '.deskwork/config.json',
          details: {
            lanesCreated: lanesCreated.length,
            entriesStamped: backfill.stamped.length,
            entriesAmbiguous: backfill.ambiguous.length,
          },
        });
      }

      const ambiguousNote =
        backfill.ambiguous.length > 0
          ? ` ${backfill.ambiguous.length} entry(ies) refused as ambiguous ` +
            `(reported separately as migration-ambiguous).`
          : '';

      return {
        finding: plan.finding,
        applied: true,
        message:
          `migrated: ${lanesCreated.length} lane(s) created, ` +
          `${backfill.stamped.length} entry artifactPath(s) backfilled, ` +
          `sites block ${dropped ? 'dropped' : 'already absent'}.${ambiguousNote}`,
        details: {
          lanesCreated,
          entriesStamped: backfill.stamped,
          entriesAmbiguous: backfill.ambiguous.map((a) => a.entryUuid),
          sitesDropped: dropped,
        },
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        finding: plan.finding,
        applied: false,
        message: `sites-to-lanes migration failed: ${reason}`,
        skipReason: 'apply-failed',
      };
    }
  },
};

function ambiguousFinding(site: string, amb: AmbiguousBackfill): Finding {
  return {
    ruleId: AMBIGUOUS_RULE_ID,
    site,
    severity: 'error',
    message:
      `Entry ${amb.entryUuid} (slug=${amb.slug}, stage=${amb.stage}) resolves to ` +
      `${amb.candidates.length} candidate files across legacy site contentDirs ` +
      `(${amb.candidates.join(', ')}). The migration refuses to stamp an ` +
      `ambiguous artifactPath — disambiguate manually and re-run.`,
    details: {
      entryUuid: amb.entryUuid,
      slug: amb.slug,
      stage: amb.stage,
      candidates: amb.candidates,
    },
  };
}

export default rule;
