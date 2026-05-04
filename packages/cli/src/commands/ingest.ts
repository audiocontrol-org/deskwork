/**
 * deskwork ingest — backfill existing markdown content into the editorial
 * calendar.
 *
 * Discovery is the heavy lifting; this module is the CLI surface around
 * `discoverIngestCandidates` from @deskwork/core/ingest.
 *
 * Argv shape (after the dispatcher injects projectRoot when needed):
 *
 *   <project-root> [flags] <path>...
 *
 * Flags:
 *   --site <slug>             Target site (defaults to config.defaultSite)
 *   --apply                   Commit the plan; default is dry-run
 *   --json                    Machine-readable plan output
 *   --force                   Bypass duplicate-slug skip
 *   --slug-from <where>       'frontmatter' or 'path' (default 'path')
 *   --state-from <where>      'frontmatter' (default) or 'datePublished'
 *   --slug <value>            Explicit slug (only with single-file ingest)
 *   --state <stage>           Explicit stage; wins over derivation
 *   --date <YYYY-MM-DD>       Explicit ISO date; wins over derivation
 *   --title-field <name>      Frontmatter field for title (default: title)
 *   --description-field <n>   Frontmatter field for description
 *                             (default: description)
 *   --slug-field <name>       Frontmatter field for slug (default: slug)
 *   --state-field <name>      Frontmatter field for state (default: state)
 *   --date-field <name>       Frontmatter field for date (default:
 *                             datePublished)
 *
 * Dry-run output (text mode):
 *
 *   Plan: 3 add, 1 skip
 *
 *   add  whats-in-a-name             Published  2020-10-01    state:fm date:fm slug:path
 *   add  the-deskwork-experiment     Published  2026-04-20    state:fm date:fm slug:path
 *   skip on-revising-in-the-open                              already in calendar
 *
 * `--apply` writes calendar rows for non-skipped candidates and appends
 * a journal entry per ingested file (`event: 'ingest'`) so a future
 * review-start has provenance to anchor against.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { resolveSite, resolveCalendarPath, resolveContentDir } from '@deskwork/core/paths';
import { isStage, type CalendarEntry, type Stage } from '@deskwork/core/types';
import { absolutize, fail, parseArgs } from '@deskwork/core/cli-args';
import { appendJournal } from '@deskwork/core/journal';
import { updateFrontmatter } from '@deskwork/core/frontmatter';
import { writeSidecar } from '@deskwork/core/sidecar';
import type { Entry, Stage as EntryStage, ReviewState } from '@deskwork/core/schema/entry';
import {
  candidateToEntry,
  discoverIngestCandidates,
  type IngestCandidate,
  type IngestSkip,
  type SlugFrom,
  type StateFrom,
} from '@deskwork/core/ingest';

const KNOWN_FLAGS = [
  'site',
  'slug-from',
  'state-from',
  'slug',
  'state',
  'date',
  'title-field',
  'description-field',
  'slug-field',
  'state-field',
  'date-field',
] as const;

const BOOLEAN_FLAGS = ['apply', 'json', 'force', 'no-write-frontmatter'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function run(argv: string[]): Promise<void> {
  const { positional, flags, booleans } = parseInput(argv);

  if (positional.length < 2) {
    fail(
      'Usage: deskwork ingest <project-root> [--site <slug>] [--apply] [--json] ' +
        '[--force] [--no-write-frontmatter] ' +
        '[--slug-from frontmatter|path] [--state-from frontmatter|datePublished] ' +
        '[--slug <s>] [--state <stage>] [--date YYYY-MM-DD] [--title-field <n>] ' +
        '[--description-field <n>] [--slug-field <n>] [--state-field <n>] ' +
        '[--date-field <n>] <path>...',
      2,
    );
  }

  const [rootArg, ...paths] = positional;
  const projectRoot = absolutize(rootArg);

  const slugFrom = parseSlugFrom(flags['slug-from']);
  const stateFrom = parseStateFrom(flags['state-from']);
  const explicitState = parseExplicitState(flags.state);
  const explicitDate = parseExplicitDate(flags.date);

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);
  const calendarPath = resolveCalendarPath(projectRoot, config, site);
  const calendar = readCalendar(calendarPath);

  // Build absolute path arguments. Relative paths resolve against
  // the project root (not cwd) — the operator's mental model is
  // "paths inside this project", and the dispatcher's cwd may differ
  // from the project root in tests / scripted invocations.
  const absolutePaths = paths.map((p) =>
    isAbsolute(p) ? p : resolve(projectRoot, p),
  );

  // Compute scrapbook root for the resolved site so files under it
  // are skipped by default (operators have to explicitly opt in to
  // ingest a sketchpad — `deskwork ingest content/scrapbook/` works
  // because absolutePaths goes through the scrapbook check on a
  // file-by-file basis, not on the discovery root).
  const contentDir = resolveContentDir(projectRoot, config, site);
  const scrapbookRoots = [join(contentDir, 'scrapbook')];

  let discovery;
  try {
    discovery = discoverIngestCandidates(absolutePaths, {
      projectRoot,
      ...(slugFrom !== undefined ? { slugFrom } : {}),
      ...(stateFrom !== undefined ? { stateFrom } : {}),
      ...(flags.slug !== undefined ? { explicitSlug: flags.slug } : {}),
      ...(explicitState !== undefined ? { explicitState } : {}),
      ...(explicitDate !== undefined ? { explicitDate } : {}),
      fieldNames: buildFieldNames(flags),
      calendar,
      ...(booleans.has('force') ? { force: true } : {}),
      scrapbookRoots,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }

  // Split candidates into actionable vs. ambiguous-state. Ambiguous
  // ones don't get applied without an explicit --state — emit them
  // as skips with an actionable reason.
  const ambiguous: IngestSkip[] = [];
  const actionable: { candidate: IngestCandidate; stage: Stage }[] = [];
  for (const c of discovery.candidates) {
    if (c.derivedState === null) {
      ambiguous.push({
        filePath: c.filePath,
        relativePath: c.relativePath,
        slug: c.derivedSlug,
        reason: `state ambiguous (raw frontmatter value: "${c.rawState ?? ''}"); pass --state <stage> to commit`,
      });
      continue;
    }
    actionable.push({ candidate: c, stage: c.derivedState });
  }

  const allSkips = [...discovery.skips, ...ambiguous];

  if (booleans.has('json')) {
    emitJsonPlan({
      apply: booleans.has('apply'),
      site,
      calendarPath,
      add: actionable.map((a) => candidatePlanRecord(a.candidate, a.stage)),
      skip: allSkips,
    });
  } else {
    emitTextPlan({
      apply: booleans.has('apply'),
      add: actionable,
      skip: allSkips,
    });
  }

  if (!booleans.has('apply')) return;

  const writeFrontmatterBinding = !booleans.has('no-write-frontmatter');

  // Apply path: append entries and write journal records. The
  // calendar is written once at the end so a partial run does not
  // leave a torn calendar file. Issue #63: also persist the freshly-
  // minted UUID into the source file's frontmatter under `deskwork.id`
  // so the calendar entry isn't orphaned at creation (doctor was
  // immediately flagging `missing-frontmatter-id` against every ingest).
  // Issue #183: write the entry-centric sidecar at .deskwork/entries/<uuid>.json
  // — Phase 30 made sidecars the SSOT, so an ingest that only updates
  // calendar.md leaves the entry invisible on the studio dashboard and
  // unreachable by deep-link.
  for (const { candidate, stage } of actionable) {
    const id = randomUUID();
    const entry: CalendarEntry = { id, ...candidateToEntry(candidate, stage) };
    calendar.entries.push(entry);
    writeIngestJournalEntry(projectRoot, config, site, candidate, entry);
    if (writeFrontmatterBinding) {
      writeDeskworkIdToFile(candidate.filePath, id);
    }
    await writeIngestSidecar(projectRoot, candidate, stage, id);
  }
  writeCalendar(calendarPath, calendar);
}

/**
 * Map the discovery layer's legacy `Stage` (`Ideas | Planned | ... | Review | Paused | Published`)
 * onto the entry-centric `Stage` (`Ideas | Planned | ... | Final | Blocked | Cancelled |
 * Published`). Mirrors Phase 30's migration policy in
 * `packages/core/src/calendar/parse.ts:LEGACY_STAGE_MAP`:
 *   - `Paused`  → `Blocked` (paused stage retired; closest off-pipeline stage)
 *   - `Review`  → `Drafting` + `reviewState: 'in-review'` (review is a
 *                 state-of-being inside Drafting under the entry-centric model)
 * Legacy values that already exist in the entry-centric set pass through.
 */
function mapStageToEntry(stage: Stage): {
  currentStage: EntryStage;
  reviewState?: ReviewState;
} {
  switch (stage) {
    case 'Paused':
      return { currentStage: 'Blocked' };
    case 'Review':
      return { currentStage: 'Drafting', reviewState: 'in-review' };
    default:
      return { currentStage: stage };
  }
}

/**
 * Write the entry-centric sidecar at `.deskwork/entries/<uuid>.json`
 * for a freshly-ingested candidate. Phase 30's contract: every UUID
 * in `calendar.md` must have a sidecar; doctor's `calendar-sidecar`
 * validator flags drift in either direction.
 *
 * `artifactPath` is the file's path relative to the **project root**
 * — that's the convention `doctor`'s `resolveArtifactPath` uses (it
 * does `join(projectRoot, entry.artifactPath)`) and matches what the
 * Phase 30 migration writes from the legacy ingest journal's
 * `sourceFile` field. The studio's `entry-resolver` and the #182
 * backfill capability consume the same shape.
 */
async function writeIngestSidecar(
  projectRoot: string,
  candidate: IngestCandidate,
  stage: Stage,
  uuid: string,
): Promise<void> {
  const at = new Date().toISOString();
  const artifactPath = candidate.relativePath;
  const { currentStage, reviewState } = mapStageToEntry(stage);
  const sidecar: Entry = {
    uuid,
    slug: candidate.derivedSlug,
    title: candidate.title,
    ...(candidate.description ? { description: candidate.description } : {}),
    keywords: [],
    source: 'manual',
    currentStage,
    iterationByStage: {},
    ...(reviewState !== undefined ? { reviewState } : {}),
    artifactPath,
    ...(currentStage === 'Published'
      ? { datePublished: `${candidate.derivedDate}T00:00:00.000Z` }
      : {}),
    createdAt: at,
    updatedAt: at,
  };
  await writeSidecar(projectRoot, sidecar);
}

/**
 * Patch the markdown file at `filePath` so its frontmatter includes
 * `deskwork.id: <id>`. Round-trip-preserving (Issue #37): only the
 * `deskwork:` namespace is touched; existing frontmatter fields keep
 * their byte-for-byte formatting (quoting, comments, key order). When
 * the file has no existing frontmatter, a fresh `---` block is
 * prepended.
 */
function writeDeskworkIdToFile(filePath: string, id: string): void {
  const original = readFileSync(filePath, 'utf-8');
  const updated = updateFrontmatter(original, { deskwork: { id } });
  if (updated !== original) {
    writeFileSync(filePath, updated, 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Argv parsing
// ---------------------------------------------------------------------------

function parseInput(argv: string[]) {
  try {
    return parseArgs(argv, KNOWN_FLAGS, BOOLEAN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }
}

function parseSlugFrom(value: string | undefined): SlugFrom | undefined {
  if (value === undefined) return undefined;
  if (value !== 'frontmatter' && value !== 'path') {
    fail(`--slug-from must be 'frontmatter' or 'path' (got "${value}")`, 2);
  }
  return value;
}

function parseStateFrom(value: string | undefined): StateFrom | undefined {
  if (value === undefined) return undefined;
  if (value !== 'frontmatter' && value !== 'datePublished') {
    fail(
      `--state-from must be 'frontmatter' or 'datePublished' (got "${value}")`,
      2,
    );
  }
  return value;
}

function parseExplicitState(value: string | undefined): Stage | undefined {
  if (value === undefined) return undefined;
  // Accept the case-insensitive lane name as the operator types it.
  const normalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  if (!isStage(normalized)) {
    fail(
      `--state must be one of Ideas, Planned, Outlining, Drafting, Review, Published ` +
        `(got "${value}")`,
      2,
    );
  }
  return normalized;
}

function parseExplicitDate(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!DATE_RE.test(value)) {
    fail(`--date must match YYYY-MM-DD (got "${value}")`, 2);
  }
  return value;
}

function buildFieldNames(flags: Record<string, string>): {
  title?: string;
  description?: string;
  slug?: string;
  state?: string;
  date?: string;
} {
  const out: {
    title?: string;
    description?: string;
    slug?: string;
    state?: string;
    date?: string;
  } = {};
  if (flags['title-field'] !== undefined) out.title = flags['title-field'];
  if (flags['description-field'] !== undefined) out.description = flags['description-field'];
  if (flags['slug-field'] !== undefined) out.slug = flags['slug-field'];
  if (flags['state-field'] !== undefined) out.state = flags['state-field'];
  if (flags['date-field'] !== undefined) out.date = flags['date-field'];
  return out;
}

// ---------------------------------------------------------------------------
// Plan output
// ---------------------------------------------------------------------------

interface PlanRecord {
  action: 'add';
  slug: string;
  title: string;
  stage: Stage;
  date: string;
  filePath: string;
  relativePath: string;
  sources: {
    slug: string;
    state: string;
    date: string;
  };
}

function candidatePlanRecord(c: IngestCandidate, stage: Stage): PlanRecord {
  return {
    action: 'add',
    slug: c.derivedSlug,
    title: c.title,
    stage,
    date: c.derivedDate,
    filePath: c.filePath,
    relativePath: c.relativePath,
    sources: {
      slug: c.slugSource,
      state: c.stateSource,
      date: c.dateSource,
    },
  };
}

function emitJsonPlan(plan: {
  apply: boolean;
  site: string;
  calendarPath: string;
  add: PlanRecord[];
  skip: IngestSkip[];
}): void {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

function emitTextPlan(plan: {
  apply: boolean;
  add: { candidate: IngestCandidate; stage: Stage }[];
  skip: IngestSkip[];
}): void {
  const heading = plan.apply
    ? `Applying: ${plan.add.length} add, ${plan.skip.length} skip`
    : `Plan: ${plan.add.length} add, ${plan.skip.length} skip (dry-run; pass --apply to commit)`;
  process.stdout.write(`${heading}\n\n`);

  for (const { candidate, stage } of plan.add) {
    const sources =
      `slug:${candidate.slugSource} state:${candidate.stateSource} date:${candidate.dateSource}`;
    process.stdout.write(
      `add  ${pad(candidate.derivedSlug, 36)}  ${pad(stage, 10)}  ${pad(candidate.derivedDate, 12)}  ${sources}\n`,
    );
  }
  for (const skip of plan.skip) {
    const slug = skip.slug ?? '(no slug)';
    process.stdout.write(`skip ${pad(slug, 36)}  ${skip.reason}\n`);
  }
}

function pad(s: string, n: number): string {
  if (s.length >= n) return s;
  return s + ' '.repeat(n - s.length);
}

// ---------------------------------------------------------------------------
// Journal write on apply
// ---------------------------------------------------------------------------

interface IngestJournalRecord {
  id: string;
  timestamp: string;
  event: 'ingest';
  /** Slug recorded on the calendar row. */
  slug: string;
  /** Stable UUID of the calendar row. */
  entryId: string;
  /** Site the row was added to. */
  site: string;
  /** Stage the row was added at. */
  stage: Stage;
  /** Path to the source markdown file, relative to project root. */
  sourceFile: string;
  /** Snapshot of the source frontmatter for provenance. */
  frontmatterSnapshot: Record<string, unknown>;
  /** Where each derived field came from. */
  derivation: {
    slug: string;
    state: string;
    date: string;
  };
}

/**
 * Append a journal record under `<reviewJournalDir>/ingest/` so a
 * later review-start (or audit) can find provenance for the ingested
 * row. We reuse the existing journal infrastructure rather than
 * inventing a new dir — review-journal already uses one-file-per-event
 * shape that a tight-fit for ingest events.
 */
function writeIngestJournalEntry(
  projectRoot: string,
  config: ReturnType<typeof readConfig>,
  site: string,
  candidate: IngestCandidate,
  entry: CalendarEntry,
): void {
  const journalRoot = join(
    projectRoot,
    config.reviewJournalDir ?? '.deskwork/review-journal',
    'ingest',
  );
  if (!existsSync(journalRoot)) {
    mkdirSync(journalRoot, { recursive: true });
  }
  const record: IngestJournalRecord = {
    id: entry.id ?? randomUUID(),
    timestamp: new Date().toISOString(),
    event: 'ingest',
    slug: entry.slug,
    entryId: entry.id ?? '',
    site,
    stage: entry.stage,
    sourceFile: candidate.relativePath,
    frontmatterSnapshot: candidate.frontmatter,
    derivation: {
      slug: candidate.slugSource,
      state: candidate.stateSource,
      date: candidate.dateSource,
    },
  };
  appendJournal(journalRoot, record);
}
