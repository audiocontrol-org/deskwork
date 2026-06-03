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
import { laneConfigPath, lanesDir } from '../../lanes/loader.ts';
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
 * The migration is whole-project. The runner invokes a rule once per
 * configured site; this guard restricts the rule's real work to the
 * lead site so it fires exactly once per `runRepair` invocation. When
 * `config.sites` is empty (post-migration), `ctx.site` will not match
 * any key — but then `readLegacySites` returns an empty map and the
 * rule no-ops anyway, so the guard simply admits the first pass.
 */
function isLeadSite(ctx: DoctorContext): boolean {
  const keys = Object.keys(ctx.config.sites);
  if (keys.length === 0) return true;
  return ctx.site === keys[0];
}

/**
 * Collect the legacy contentDirs (one per legacy site) — the base dirs
 * the backfiller searches. Returns an empty array when there are no
 * legacy sites (post-migration).
 */
function legacyContentDirs(sites: ReadonlyMap<string, LegacySite>): string[] {
  return [...sites.values()].map((s) => s.contentDir);
}

/** Whether any artifact-bearing entry still lacks `artifactPath`. */
async function anyEntryMissingArtifactPath(projectRoot: string): Promise<boolean> {
  let entries;
  try {
    entries = await readAllSidecars(projectRoot);
  } catch {
    return false;
  }
  return entries.some(
    (e) => e.artifactPath === undefined || e.artifactPath === '',
  );
}

/** Build the per-site lane config (id = slug; host + scaffoldDefaults). */
function laneFromSite(slug: string, site: LegacySite): LaneConfig {
  const lane: LaneConfig = {
    id: slug,
    name: slug,
    pipelineTemplate: MIGRATION_PIPELINE_TEMPLATE,
    // `contentDir` is still required by the 39b schema (removed in 39c).
    // Write it from the legacy site verbatim so the file validates; the
    // authoritative location info is the new `scaffoldDefaults`.
    contentDir: site.contentDir,
    scaffoldDefaults: { markdown: site.contentDir },
    ...(site.host !== undefined ? { host: site.host } : {}),
  };
  return lane;
}

const rule: DoctorRule = {
  id: RULE_ID,
  label: 'Migrate legacy sites to lanes (Phase 39 sites→lanes retirement)',

  async audit(ctx: DoctorContext): Promise<Finding[]> {
    if (!isLeadSite(ctx)) return [];

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
    const baseDirs = legacyContentDirs(sites);
    if (baseDirs.length > 0) {
      const ambiguous = await detectAmbiguousBackfills(ctx.projectRoot, baseDirs);
      for (const amb of ambiguous) {
        findings.push(ambiguousFinding(ctx.site, amb));
      }
    }

    return findings;
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
      const baseDirs = legacyContentDirs(sites);

      // Step 1 — lanes from sites (idempotent: skip an existing lane file).
      const lanesCreated: string[] = [];
      if (sites.size > 0) {
        mkdirSync(lanesDir(ctx.projectRoot), { recursive: true });
      }
      for (const [slug, site] of sites) {
        const target = laneConfigPath(ctx.projectRoot, slug);
        if (existsSync(target)) continue;
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
          },
        });
        lanesCreated.push(slug);
      }

      // Step 2 — backfill unambiguous entry artifactPaths (ambiguity-halt).
      const backfill = await backfillFromLegacySites(ctx.projectRoot, baseDirs);

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
