/**
 * Data loader for the entry-keyed press-check surface (Phase 34a Layer 2).
 *
 * Resolves an entry UUID to:
 *   - the sidecar (`Entry`) + on-disk artifact body (via `resolveEntry`).
 *   - the iteration journal listing for the version strip (via Layer 1's
 *     `listEntryIterations`).
 *   - the entry-keyed annotation list for the marginalia column (via
 *     Layer 1's `listEntryAnnotations`).
 *   - which site the entry belongs to, by scanning configured calendars
 *     for a matching UUID. The scrapbook drawer + content index need the
 *     site to resolve filesystem paths and build URLs.
 *   - the matching `CalendarEntry` (when present) so the scrapbook drawer
 *     can use the index-driven binding rather than slug-template paths.
 *
 * The version-strip can optionally render historical content (when the
 * `?v=<n>` query param is set). When that param is present and resolves
 * to an iteration we have content for, the renderer swaps the on-disk
 * artifact body for the historical markdown captured in the journal.
 */

import { existsSync } from 'node:fs';
import { resolveEntry } from '../../lib/entry-resolver.ts';
import type { StudioContext } from '../../routes/api.ts';
import { readCalendar } from '@deskwork/core/calendar';
import { findEntryById } from '@deskwork/core/calendar-mutations';
import { resolveCalendarPath } from '@deskwork/core/paths';
import {
  listEntryIterations,
  getEntryIteration,
  type IterationListing,
  type IterationContent,
} from '@deskwork/core/iterate/history';
import { listEntryAnnotations } from '@deskwork/core/entry/annotations';
import { readSidecar, sidecarPath } from '@deskwork/core/sidecar';
import { isGroupEntry, isPopulatedGroupEntry } from '@deskwork/core/groups';
import {
  listLaneConfigs,
  loadLaneConfig,
  type LaneConfig,
} from '@deskwork/core/lanes';
import {
  loadPipelineTemplate,
  type PipelineTemplate,
} from '@deskwork/core/pipelines';
import type { Entry, Stage } from '@deskwork/core/schema/entry';

const VALID_STAGES: ReadonlySet<Stage> = new Set<Stage>([
  'Ideas', 'Planned', 'Outlining', 'Drafting', 'Final', 'Published', 'Blocked', 'Cancelled',
]);

function parseStageParam(raw: string | null | undefined): Stage | undefined {
  if (raw === null || raw === undefined) return undefined;
  for (const stage of VALID_STAGES) {
    if (stage === raw) return stage;
  }
  return undefined;
}
import type { CalendarEntry } from '@deskwork/core/types';
import type { DraftAnnotation } from '@deskwork/core/review/types';

/**
 * Discriminated-union row item carrying ONE position in the group's
 * declared `members[]` order (AUDIT-20260529-40). The three kinds
 * mirror the three resolution outcomes:
 *
 *   - `resolved` — the sidecar read + validated cleanly.
 *   - `missing` — the sidecar file is absent on disk (ENOENT).
 *   - `corrupt` — the sidecar file is present but failed to load.
 *
 * The renderer's list-view path walks this sequence directly so
 * insertion order is preserved end-to-end, regardless of which
 * resolution outcome each position carries. Pre-AUDIT-40 the
 * renderer concatenated resolved rows first, then corrupt, then
 * missing — re-ordering the operator's declared sequence.
 */
export type MemberItem =
  | { readonly kind: 'resolved'; readonly entry: Entry }
  | { readonly kind: 'missing'; readonly uuid: string }
  | { readonly kind: 'corrupt'; readonly uuid: string };

/**
 * When the entry is a populated group (Phase 7 Task 7.3 + 7.4), the
 * loader resolves each member sidecar plus the lane configs + pipeline
 * templates the members span. Members are returned in the original
 * `group.members[]` insertion order.
 *
 * Resolution outcomes are partitioned into three distinct buckets per
 * AUDIT-20260529-39 (no silent fallbacks):
 *
 *   - `members` — sidecars that read + validated cleanly.
 *   - `missingMemberUuids` — sidecar files that don't exist on disk
 *     (ENOENT). Surfaced as a "missing" row inline so the operator
 *     sees a referential-integrity gap rather than silent drop.
 *   - `corruptMemberUuids` — sidecar files that exist on disk but
 *     failed to load (malformed JSON, schema parse failure, other
 *     I/O errors). Surfaced as a distinct "corrupt" row so the
 *     operator can distinguish data-loss / data-corruption from a
 *     mere missing-reference gap. Conflating the two (the
 *     pre-AUDIT-39 behavior) violated the project's no-silent-
 *     fallbacks discipline.
 *
 * `orderedMembers` carries the three-variant discriminated union
 * per AUDIT-20260529-40 — one item per declared UUID in
 * `group.members[]` order. The list-view renderer walks this
 * sequence so insertion order is preserved across resolution
 * outcomes; the composed view continues to read `members` directly
 * because it buckets by (lane, stage) rather than rendering an
 * ordered flat list.
 *
 * `laneConfigsById` iterates in operator-configured lane order (per
 * `listLaneConfigs`) — the same order the dashboard uses — so the
 * composed view's per-lane block ordering is consistent across
 * surfaces.
 */
export interface GroupMembersBundle {
  readonly members: readonly Entry[];
  readonly missingMemberUuids: readonly string[];
  readonly corruptMemberUuids: readonly string[];
  readonly orderedMembers: readonly MemberItem[];
  readonly laneConfigsById: ReadonlyMap<string, LaneConfig>;
  readonly templatesById: ReadonlyMap<string, PipelineTemplate>;
}

export interface EntryReviewData {
  readonly entry: Entry;
  readonly artifactPath: string;
  /** Markdown to render in the article column. When `historical` is set,
   *  this is the historical version's markdown, not the on-disk body. */
  readonly markdown: string;
  /** True when the renderer is showing a prior version (read-only). */
  readonly historical: IterationContent | null;
  readonly iterations: readonly IterationListing[];
  readonly annotations: readonly DraftAnnotation[];
  /** Site slug the entry belongs to (for URL building + content-index
   *  lookup). Falls back to `config.defaultSite` when the entry isn't
   *  found in any configured calendar. */
  readonly site: string;
  /** The matching CalendarEntry, when present. Drives index-bound
   *  scrapbook resolution; null falls back to slug-template paths. */
  readonly calendarEntry: CalendarEntry | null;
  /**
   * Resolved group member bundle. `null` when the entry is not a
   * populated group (no `members` array OR `members.length === 0`).
   * Phase 7 Tasks 7.3 + 7.4. Loaded only when the group has members
   * — pay-for-what-you-use per the project's "no fallback" rule.
   */
  readonly groupMembers: GroupMembersBundle | null;
}

export interface LoadOptions {
  /** Optional `?v=<n>` from the request URL. */
  readonly version?: string | null;
  /** Optional `?stage=<Stage>` from the request URL. Disambiguates
   *  historical lookup when an entry has the same version number
   *  recorded under multiple stages (e.g. Ideas v1 + Drafting v1).
   *  When omitted, falls back to first-chronological-match. */
  readonly stage?: string | null;
}

/**
 * Locate which configured site's calendar the entry belongs to. Returns
 * the first match (entry UUIDs are globally unique). Falls back to
 * `config.defaultSite` with a null `calendarEntry` when no calendar
 * carries the entry.
 *
 * Phase 39c (sites→lanes retirement) NOTE: the calendar is now a single
 * project file (`resolveCalendarPath` is site-independent), so iterating
 * `config.sites` reads the SAME calendar per key — harmless redundancy
 * while `sites` is retained for the CLI-verb path. The returned `site`
 * is still threaded into the CLI-verb content-index + verb-command
 * surfaces (`getIndex(site)`, `lookupCalendarEntryStrict`), so it must
 * remain a real configured site slug until 39c-2b migrates that path.
 * Collapsing the returned label to a synthetic `project` scope here
 * breaks the content-index keying — deferred to 39c-2b with the rest of
 * the CLI-verb resolution migration.
 *
 * Failures (calendar absent, parse error) fall through to the default
 * — the press-check surface should render even when calendar resolution
 * is wonky for an unrelated reason.
 */
function findEntrySite(
  ctx: StudioContext,
  entryId: string,
): { site: string; calendarEntry: CalendarEntry | null } {
  for (const site of Object.keys(ctx.config.sites)) {
    try {
      const calendarPath = resolveCalendarPath(ctx.projectRoot, ctx.config, site);
      if (!existsSync(calendarPath)) continue;
      const cal = readCalendar(calendarPath);
      const entry = findEntryById(cal, entryId);
      if (entry !== undefined) {
        return { site, calendarEntry: entry };
      }
    } catch {
      // Calendar unreadable for this site — try the next one.
      continue;
    }
  }
  return { site: ctx.config.defaultSite, calendarEntry: null };
}

function parseVersionParam(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Resolve each member UUID to a sidecar; collect lane configs +
 * pipeline templates for every lane the resolved members span.
 *
 * Resolution failures are partitioned into TWO distinct buckets per
 * AUDIT-20260529-39 (no silent fallbacks):
 *
 *   - `missing` — the sidecar file doesn't exist on disk (ENOENT).
 *     The doctor `group-member-missing` rule (Task 7.5.2) catches
 *     this case at the project level; the studio surfaces it inline
 *     as a "missing" row so the operator sees the gap.
 *   - `corrupt` — the sidecar file exists on disk but failed to
 *     load (malformed JSON, schema parse failure, permission error,
 *     other I/O failure). Surfaced as a distinct "corrupt" row so
 *     data-corruption isn't laundered as a mere reference gap. The
 *     pre-AUDIT-39 implementation conflated the two — every failure
 *     ended up as "missing", hiding real corruption from the
 *     operator.
 *
 * The distinction is made by checking sidecar-file existence BEFORE
 * calling `readSidecar`. File present + read fails ⇒ corrupt; file
 * absent ⇒ missing. This avoids parsing readSidecar's error-message
 * shape (fragile cross-package coupling).
 *
 * Lane configs are loaded for every member's lane (deduped). The
 * resulting Map iterates in the operator-configured lane order from
 * `listLaneConfigs` — the same order the dashboard's swimlane uses —
 * so per-lane composed blocks render in a stable, operator-recognizable
 * sequence.
 */
async function loadGroupMembersBundle(
  projectRoot: string,
  group: Entry,
): Promise<GroupMembersBundle> {
  const uuids = group.members ?? [];
  const members: Entry[] = [];
  const missing: string[] = [];
  const corrupt: string[] = [];
  // AUDIT-20260529-40: parallel ordered sequence of {kind, ...}
  // items so the renderer can walk declared `group.members[]` order
  // regardless of which resolution outcome each position carries.
  const orderedMembers: MemberItem[] = [];
  for (const uuid of uuids) {
    // Distinguish ENOENT-missing from read/parse failure (corrupt)
    // by file-existence check before the read. existsSync is sync +
    // cheap (a single stat per UUID) and avoids fragile error-message
    // matching against readSidecar's internal failure strings.
    const path = sidecarPath(projectRoot, uuid);
    if (!existsSync(path)) {
      missing.push(uuid);
      orderedMembers.push({ kind: 'missing', uuid });
      continue;
    }
    try {
      const sidecar = await readSidecar(projectRoot, uuid);
      members.push(sidecar);
      orderedMembers.push({ kind: 'resolved', entry: sidecar });
    } catch (err) {
      // Sidecar file exists but the read / parse / schema validation
      // failed. Surface as corrupt — NOT missing — so the operator
      // sees the corruption inline and can investigate. Log the
      // underlying error so it surfaces in studio logs for the
      // operator to triage.
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(`entry-review: corrupt member sidecar ${uuid}: ${detail}`);
      corrupt.push(uuid);
      orderedMembers.push({ kind: 'corrupt', uuid });
    }
  }

  // Lane configs + templates: load only what the resolved members
  // actually use. Iterate in operator-configured lane order.
  //
  // Per AUDIT-20260529-37 (failure B): `laneConfigsById.set` only
  // fires AFTER the corresponding template successfully resolves. If
  // we set the lane first and the template load throws, the lane
  // ends up in `laneConfigsById` while its template is absent from
  // `templatesById`. Downstream `bucketMembersByLane` would then
  // pass the lane guard, bucket members under it, and silently drop
  // the entire bucket when the template lookup returns undefined.
  // Set-after-template-resolves keeps the two maps in lockstep so
  // members of a broken-template lane fall into the unbucketed tail
  // instead of vanishing.
  const usedLaneIds = new Set<string>();
  for (const m of members) {
    if (m.lane !== undefined) usedLaneIds.add(m.lane);
  }
  const laneConfigsById = new Map<string, LaneConfig>();
  const templatesById = new Map<string, PipelineTemplate>();
  if (usedLaneIds.size > 0) {
    // Lane configs may not all exist on disk (legacy / mis-set). Skip
    // missing ones — they show up in the members section as
    // unrouted (lane label = the raw id).
    const allLaneIds = listLaneConfigs(projectRoot);
    for (const laneId of allLaneIds) {
      if (!usedLaneIds.has(laneId)) continue;
      try {
        const config = loadLaneConfig(laneId, projectRoot);
        // Phase 39 (sites→lanes retirement): a lane carries no
        // contentDir. Project the runtime-contract fields; scaffoldDefaults
        // / host are optional and copied only when present.
        const strict: LaneConfig = {
          id: config.id,
          name: config.name,
          pipelineTemplate: config.pipelineTemplate,
          ...(config.scaffoldDefaults !== undefined && {
            scaffoldDefaults: config.scaffoldDefaults,
          }),
          ...(config.host !== undefined && { host: config.host }),
        };
        // Load template FIRST; only register the lane once the
        // template-side load succeeds. If the template load throws,
        // the lane stays absent from `laneConfigsById` and the
        // bucketer falls back to unbucketed-rendering for its
        // members.
        if (!templatesById.has(strict.pipelineTemplate)) {
          const tpl = loadPipelineTemplate(strict.pipelineTemplate, projectRoot);
          templatesById.set(strict.pipelineTemplate, tpl);
        }
        laneConfigsById.set(strict.id, strict);
      } catch {
        // Lane / template failed to resolve. Skip — the member row
        // surfaces in the composed view's unbucketed tail (and in
        // list view as unrouted) instead of crashing the render or
        // silently vanishing.
        continue;
      }
    }
  }

  return {
    members,
    missingMemberUuids: missing,
    corruptMemberUuids: corrupt,
    orderedMembers,
    laneConfigsById,
    templatesById,
  };
}

/**
 * Resolve an entry's sidecar + artifact body, with a declared-group
 * fallback (Phase 39c). For a non-group entry, defers entirely to
 * `resolveEntry` (stored-path-only; throws when artifactPath is absent).
 * For a DECLARED GROUP entry (`members` array present) that has no
 * artifactPath, the group has no artifact of its own — read the sidecar
 * and return an empty body so the Members section renders. A group that
 * DOES carry an artifactPath still resolves through `resolveEntry`.
 */
async function resolveEntryOrGroup(
  projectRoot: string,
  entryId: string,
): Promise<{ entry: Entry; artifactBody: string; artifactPath: string }> {
  const sidecar = await readSidecar(projectRoot, entryId);
  if (isGroupEntry(sidecar) && sidecar.artifactPath === undefined) {
    return { entry: sidecar, artifactBody: '', artifactPath: '' };
  }
  return resolveEntry(projectRoot, entryId);
}

export async function loadEntryReviewData(
  ctx: StudioContext,
  entryId: string,
  opts: LoadOptions = {},
): Promise<EntryReviewData> {
  // Phase 39c (sites→lanes retirement): entry resolution reads the stored
  // artifactPath only (no slug+stage fallback) and THROWS when it is
  // absent. A DECLARED GROUP (`members` array present) legitimately has
  // no artifact of its own — its body is its members. For such an entry
  // without an artifactPath, read the sidecar directly and render with
  // empty markdown so the Members section / empty-state CTA shows instead
  // of a 404. Non-group entries still require an artifact (resolveEntry
  // throws → the route renders the not-found shell).
  const resolved = await resolveEntryOrGroup(ctx.projectRoot, entryId);
  const iterations = await listEntryIterations(ctx.projectRoot, entryId);
  const annotations = await listEntryAnnotations(ctx.projectRoot, entryId);
  const { site, calendarEntry } = findEntrySite(ctx, entryId);
  const groupMembers = isPopulatedGroupEntry(resolved.entry)
    ? await loadGroupMembersBundle(ctx.projectRoot, resolved.entry)
    : null;

  // Historical-version handling. Only swap the markdown when both the
  // version param resolves and the journal has content for it. Stage
  // qualification disambiguates the multi-stage case (Ideas v1 +
  // Drafting v1); when missing, the reader falls back to the first
  // chronological match (loud warn since this means the URL was
  // emitted by something other than the current version-strip).
  let historical: IterationContent | null = null;
  let markdown = resolved.artifactBody;
  const requested = parseVersionParam(opts.version ?? null);
  const requestedStage = parseStageParam(opts.stage ?? null);
  if (requested !== null) {
    if (requestedStage === undefined && opts.stage !== null && opts.stage !== undefined) {
      // Caller passed a non-empty ?stage= that didn't match any known
      // stage — treat as a malformed query rather than silently
      // dropping it.
      console.warn(
        `entry-review: ignoring unknown stage param "${opts.stage}" for entry ${entryId}`,
      );
    }
    const found = await getEntryIteration(
      ctx.projectRoot,
      entryId,
      requested,
      requestedStage,
    );
    if (found !== null) {
      historical = found;
      markdown = found.markdown;
    }
  }

  return {
    entry: resolved.entry,
    artifactPath: resolved.artifactPath,
    markdown,
    historical,
    iterations,
    annotations,
    site,
    calendarEntry,
    groupMembers,
  };
}
