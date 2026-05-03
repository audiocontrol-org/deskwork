import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  EntrySchema,
  isLinearPipelineStage,
  isOffPipelineStage,
  type Entry,
  type Stage,
} from '../schema/entry.ts';
import { extractEntriesForMigration } from '../calendar/parse.ts';
import { readJournalEvents } from '../journal/read.ts';

export interface ValidationFailure {
  category:
    | 'schema'
    | 'calendar-sidecar'
    | 'frontmatter-sidecar'
    | 'journal-sidecar'
    | 'iteration-history'
    | 'file-presence'
    | 'stage-invariants'
    | 'cross-entry'
    | 'migration';
  message: string;
  entryId?: string;
  path?: string;
}

export interface ValidationResult {
  failures: ValidationFailure[];
}

async function validateSchema(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const dir = join(projectRoot, '.deskwork', 'entries');
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return failures;
  }

  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const path = join(dir, name);
    const raw = await readFile(path, 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      failures.push({ category: 'schema', message: 'JSON parse failed', path });
      continue;
    }
    const result = EntrySchema.safeParse(json);
    if (!result.success) {
      failures.push({ category: 'schema', message: result.error.message, path });
    }
  }
  return failures;
}

async function readSidecarUuids(projectRoot: string): Promise<Set<string>> {
  const dir = join(projectRoot, '.deskwork', 'entries');
  const uuids = new Set<string>();
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return uuids;
  }
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    uuids.add(name.replace(/\.json$/, ''));
  }
  return uuids;
}

async function validateCalendarSidecar(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const calendarPath = join(projectRoot, '.deskwork', 'calendar.md');
  let md: string;
  try {
    md = await readFile(calendarPath, 'utf8');
  } catch {
    return failures;
  }
  const calendarEntries = extractEntriesForMigration(md);
  const calendarUuids = new Set(calendarEntries.map((e) => e.uuid));
  const calendarStageByUuid = new Map(calendarEntries.map((e) => [e.uuid, e.currentStage] as const));
  const sidecarUuids = await readSidecarUuids(projectRoot);

  for (const uuid of calendarUuids) {
    if (!sidecarUuids.has(uuid)) {
      failures.push({
        category: 'calendar-sidecar',
        message: `calendar.md lists uuid ${uuid} but no sidecar exists at .deskwork/entries/${uuid}.json`,
        entryId: uuid,
        path: calendarPath,
      });
    }
  }
  for (const uuid of sidecarUuids) {
    if (!calendarUuids.has(uuid)) {
      failures.push({
        category: 'calendar-sidecar',
        message: `sidecar ${uuid}.json exists but calendar.md does not list this uuid`,
        entryId: uuid,
        path: join(projectRoot, '.deskwork', 'entries', `${uuid}.json`),
      });
    }
  }

  // #148: each entry should appear under the section that matches its
  // sidecar's currentStage. If a stage transition wrote the sidecar but
  // didn't regenerate calendar.md, the entry will appear under the
  // pre-transition section. Surface this as a finding so --check sees
  // the drift; the repair pass regenerates calendar.md from sidecars.
  const sidecars = await loadSidecars(projectRoot);
  for (const sc of sidecars) {
    const calendarStage = calendarStageByUuid.get(sc.entry.uuid);
    if (calendarStage === undefined) continue;
    if (calendarStage !== sc.entry.currentStage) {
      failures.push({
        category: 'calendar-sidecar',
        message: `calendar.md shows entry ${sc.entry.uuid} under "## ${calendarStage}" but sidecar.currentStage=${sc.entry.currentStage} (calendar.md is stale; run with --fix=all to regenerate)`,
        entryId: sc.entry.uuid,
        path: calendarPath,
      });
    }
  }
  return failures;
}

interface LoadedSidecar {
  filename: string;
  path: string;
  entry: Entry;
}

async function loadSidecars(projectRoot: string): Promise<LoadedSidecar[]> {
  const dir = join(projectRoot, '.deskwork', 'entries');
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: LoadedSidecar[] = [];
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const path = join(dir, name);
    const raw = await readFile(path, 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      continue;
    }
    const result = EntrySchema.safeParse(json);
    if (!result.success) continue;
    out.push({ filename: name, path, entry: result.data });
  }
  return out;
}

/**
 * Stage-conventional artifact path. Returns null when a stage does not have a
 * primary on-disk artifact (e.g. Blocked / Cancelled).
 *
 * Note: Published shares the Drafting/Final path (`docs/<slug>/index.md`).
 */
function artifactPathForStage(projectRoot: string, slug: string, stage: Stage): string | null {
  switch (stage) {
    case 'Ideas':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'idea.md');
    case 'Planned':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'plan.md');
    case 'Outlining':
      return join(projectRoot, 'docs', slug, 'scrapbook', 'outline.md');
    case 'Drafting':
    case 'Final':
    case 'Published':
      return join(projectRoot, 'docs', slug, 'index.md');
    case 'Blocked':
    case 'Cancelled':
      return null;
  }
}

/**
 * Resolve the on-disk artifact path for an entry.
 *
 * Precedence:
 *   1. entry.artifactPath (when set — see #140 / migration)
 *   2. slug+stage heuristic (`artifactPathForStage`) for entries without
 *      an explicit path. Off-pipeline stages (Blocked / Cancelled) still
 *      return null.
 *
 * Returns null when no artifact is expected for this stage.
 */
function resolveArtifactPath(projectRoot: string, entry: Entry): string | null {
  if (entry.artifactPath) {
    return join(projectRoot, entry.artifactPath);
  }
  return artifactPathForStage(projectRoot, entry.slug, entry.currentStage);
}

/**
 * Minimal frontmatter `deskwork.stage` extractor.
 *
 * The plugin's frontmatter is YAML-ish, but for the validator's narrow purpose
 * (read `deskwork.stage`) a regex avoids pulling a full YAML parser into the
 * validator codepath. We match the `deskwork:` block and find a `stage:` line
 * inside it, accepting any indentation.
 */
function extractDeskworkStage(markdown: string): string | undefined {
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return undefined;
  const fm = fmMatch[1];
  // Find the line `deskwork:` (the block opener) and then any subsequent
  // indented child line of the form `  stage: <value>` before either the next
  // unindented line or end-of-frontmatter.
  const lines = fm.split('\n');
  let inBlock = false;
  for (const line of lines) {
    if (!inBlock) {
      if (/^deskwork:\s*$/.test(line)) inBlock = true;
      continue;
    }
    // Exit the block when we hit a non-indented, non-empty line.
    if (line.length > 0 && !/^\s/.test(line)) break;
    const m = line.match(/^\s+stage:\s*([^\s#]+)/);
    if (m) return m[1];
  }
  return undefined;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function validateFrontmatterSidecar(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const sidecars = await loadSidecars(projectRoot);
  for (const { entry, path: sidecarPath } of sidecars) {
    const artifactPath = resolveArtifactPath(projectRoot, entry);
    if (!artifactPath) continue;
    if (!(await fileExists(artifactPath))) continue; // file-presence handles missing artifacts
    const md = await readFile(artifactPath, 'utf8');
    const fmStage = extractDeskworkStage(md);
    if (fmStage === undefined) continue;
    if (fmStage !== entry.currentStage) {
      failures.push({
        category: 'frontmatter-sidecar',
        message: `frontmatter deskwork.stage=${fmStage} at ${artifactPath} does not match sidecar currentStage=${entry.currentStage}`,
        entryId: entry.uuid,
        path: sidecarPath,
      });
    }
  }
  return failures;
}

async function validateJournalSidecar(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const sidecars = await loadSidecars(projectRoot);
  for (const { entry, path } of sidecars) {
    const events = await readJournalEvents(projectRoot, { entryId: entry.uuid });

    // readJournalEvents sorts ascending by `at`, so the latest is at the end.
    const stageTransitions = events.filter((e) => e.kind === 'stage-transition');
    const latestStageTransition = stageTransitions.at(-1);
    if (latestStageTransition && latestStageTransition.kind === 'stage-transition') {
      if (latestStageTransition.to !== entry.currentStage) {
        failures.push({
          category: 'journal-sidecar',
          message: `latest stage-transition.to=${latestStageTransition.to} does not match sidecar currentStage=${entry.currentStage}`,
          entryId: entry.uuid,
          path,
        });
      }
    }

    const reviewChanges = events.filter((e) => e.kind === 'review-state-change');
    const latestReview = reviewChanges.at(-1);
    if (latestReview && latestReview.kind === 'review-state-change') {
      const sidecarReview = entry.reviewState ?? null;
      if (latestReview.to !== sidecarReview) {
        failures.push({
          category: 'journal-sidecar',
          message: `latest review-state-change.to=${String(latestReview.to)} does not match sidecar reviewState=${String(sidecarReview)}`,
          entryId: entry.uuid,
          path,
        });
      }
    }
  }
  return failures;
}

async function validateIterationHistory(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const sidecars = await loadSidecars(projectRoot);
  for (const { entry, path } of sidecars) {
    const stages = Object.keys(entry.iterationByStage);
    // Migration tolerance: a sidecar with no recorded iteration counts is
    // exempt from journal-vs-sidecar checks (legacy history may exist in the
    // journal that simply hasn't been backfilled into iterationByStage).
    if (stages.length === 0) continue;

    const events = await readJournalEvents(projectRoot, {
      entryId: entry.uuid,
      kinds: ['iteration'],
    });

    // Count iterations per stage in the journal.
    const journalCount: Record<string, number> = {};
    for (const e of events) {
      if (e.kind !== 'iteration') continue;
      journalCount[e.stage] = (journalCount[e.stage] ?? 0) + 1;
    }

    // Compare sidecar counts to journal counts for every stage we know about
    // (union of sidecar-recorded stages and journal-witnessed stages).
    //
    // We only fail when the journal has MORE events than the sidecar — that
    // direction means the sidecar lost data that the journal still witnesses
    // (real drift). The other direction (sidecar count > journal count) is
    // the migration case: #141 carries iteration counts forward from legacy
    // pipeline-workflow records that never had per-event iteration journal
    // entries. Treating that as drift would flag every migrated entry.
    const allStages = new Set<string>([...stages, ...Object.keys(journalCount)]);
    for (const stage of allStages) {
      const sidecarN = entry.iterationByStage[stage as Stage] ?? 0;
      const journalN = journalCount[stage] ?? 0;
      if (sidecarN === 0) continue; // migration tolerance: only flag stages the sidecar tracks
      if (journalN > sidecarN) {
        failures.push({
          category: 'iteration-history',
          message: `iterationByStage[${stage}]=${sidecarN} but journal has ${journalN} iteration event(s) for that stage`,
          entryId: entry.uuid,
          path,
        });
      }
    }
  }
  return failures;
}

async function validateFilePresence(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const sidecars = await loadSidecars(projectRoot);
  for (const { entry, path } of sidecars) {
    const artifactPath = resolveArtifactPath(projectRoot, entry);
    if (!artifactPath) continue;
    if (!(await fileExists(artifactPath))) {
      failures.push({
        category: 'file-presence',
        message: `sidecar currentStage=${entry.currentStage} requires artifact at ${artifactPath} but the file is missing`,
        entryId: entry.uuid,
        path,
      });
    }
  }
  return failures;
}

async function validateStageInvariants(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const sidecars = await loadSidecars(projectRoot);
  for (const { entry, path } of sidecars) {
    // Off-pipeline stages (Blocked, Cancelled) MUST record priorStage so the
    // editor knows where to send the entry on resume.
    if (isOffPipelineStage(entry.currentStage)) {
      if (!entry.priorStage) {
        failures.push({
          category: 'stage-invariants',
          message: `currentStage=${entry.currentStage} requires priorStage to be set`,
          entryId: entry.uuid,
          path,
        });
      }
    }
    // Pipeline-stage entries MUST NOT carry a priorStage — that field is for
    // off-pipeline entries to remember where they paused.
    if (isLinearPipelineStage(entry.currentStage) && entry.priorStage !== undefined) {
      failures.push({
        category: 'stage-invariants',
        message: `pipeline-stage entry (currentStage=${entry.currentStage}) must not have priorStage set (got ${entry.priorStage})`,
        entryId: entry.uuid,
        path,
      });
    }
    // Published is frozen — no further iterations are allowed.
    const publishedIters = entry.iterationByStage.Published ?? 0;
    if (publishedIters > 1) {
      failures.push({
        category: 'stage-invariants',
        message: `iterationByStage.Published=${publishedIters} but Published is frozen (max 1)`,
        entryId: entry.uuid,
        path,
      });
    }
  }
  return failures;
}

async function validateCrossEntry(projectRoot: string): Promise<ValidationFailure[]> {
  const failures: ValidationFailure[] = [];
  const sidecars = await loadSidecars(projectRoot);

  // UUID-filename mismatch: the canonical name is `<uuid>.json`. If the body's
  // uuid field doesn't match the filename, downstream lookups break.
  for (const { filename, path, entry } of sidecars) {
    const expectedUuid = filename.replace(/\.json$/, '');
    if (entry.uuid !== expectedUuid) {
      failures.push({
        category: 'cross-entry',
        message: `sidecar filename ${filename} does not match body uuid ${entry.uuid}`,
        entryId: entry.uuid,
        path,
      });
    }
  }

  // Slug uniqueness: each slug should map to at most one entry. Group sidecars
  // by slug and emit one failure per duplicate cluster.
  const bySlug = new Map<string, LoadedSidecar[]>();
  for (const sc of sidecars) {
    const list = bySlug.get(sc.entry.slug) ?? [];
    list.push(sc);
    bySlug.set(sc.entry.slug, list);
  }
  for (const [slug, group] of bySlug) {
    if (group.length < 2) continue;
    const uuids = group.map((g) => g.entry.uuid).join(', ');
    for (const sc of group) {
      failures.push({
        category: 'cross-entry',
        message: `slug "${slug}" is shared by ${group.length} sidecars (uuids: ${uuids})`,
        entryId: sc.entry.uuid,
        path: sc.path,
      });
    }
  }

  // UUID uniqueness across body fields. Same body uuid in two different files
  // is unusual (the filename naming convention prevents the obvious case) but
  // worth catching when it happens.
  const byUuid = new Map<string, LoadedSidecar[]>();
  for (const sc of sidecars) {
    const list = byUuid.get(sc.entry.uuid) ?? [];
    list.push(sc);
    byUuid.set(sc.entry.uuid, list);
  }
  for (const [uuid, group] of byUuid) {
    if (group.length < 2) continue;
    const filenames = group.map((g) => g.filename).join(', ');
    for (const sc of group) {
      failures.push({
        category: 'cross-entry',
        message: `uuid ${uuid} appears in ${group.length} sidecar bodies (files: ${filenames})`,
        entryId: uuid,
        path: sc.path,
      });
    }
  }

  return failures;
}

export async function validateAll(projectRoot: string): Promise<ValidationResult> {
  const failures: ValidationFailure[] = [];
  failures.push(...(await validateSchema(projectRoot)));
  failures.push(...(await validateCalendarSidecar(projectRoot)));
  failures.push(...(await validateFrontmatterSidecar(projectRoot)));
  failures.push(...(await validateJournalSidecar(projectRoot)));
  failures.push(...(await validateIterationHistory(projectRoot)));
  failures.push(...(await validateFilePresence(projectRoot)));
  failures.push(...(await validateStageInvariants(projectRoot)));
  failures.push(...(await validateCrossEntry(projectRoot)));
  return { failures };
}
