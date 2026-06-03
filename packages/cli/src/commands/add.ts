/**
 * deskwork-add — append a new idea to the editorial calendar.
 *
 * Usage:
 *   deskwork-add <project-root> [--site <slug>] [--type blog|youtube|tool]
 *                [--content-url URL] [--source manual|analytics]
 *                [--lane <lane-id>] [--stage <stage>]
 *                [--kind markdown|html-mockup|single-file-html|image]
 *                [--layout index|readme|flat]
 *                [--artifact-path <path>]
 *                <title> [description]
 *
 * Writes the calendar atomically. Emits a JSON result on stdout:
 *   { "slug": "...", "stage": "Ideas", "site": "...", "calendarPath": "..." }
 *
 * AUDIT-20260528-39: the dashboard's per-lane compose chip generates
 * commands of the shape
 *
 *   /deskwork:add <slug> --lane <laneId> --stage <firstStage>
 *
 * to seed entries in non-editorial lanes (visual, qa-plan, custom). The
 * lane + stage + kind flags below close the parser-rejected gap that
 * surfaced in the AUDIT-20260528 dashboard sweep — pasted commands now
 * resolve the lane's pipeline template, validate the requested stage,
 * and persist the lane / stage / artifactKind to the new entry sidecar.
 */

import { readConfig } from '@deskwork/core/config';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { addEntry } from '@deskwork/core/calendar-mutations';
import { resolveSite, resolveCalendarPath } from '@deskwork/core/paths';
import { isContentType, type ContentType } from '@deskwork/core/types';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { createFreshEntrySidecar } from '@deskwork/core/entry/create';
import {
  bootstrapDefaultLaneIfMissing,
  loadLaneConfig,
  composeAddArtifactPath,
  parseScaffoldLayout,
  isLayoutLegalForKind,
  legalLayoutsForKind,
  SCAFFOLD_LAYOUTS,
} from '@deskwork/core/lanes';
import {
  ArtifactKindSchema,
  type ArtifactKind,
  type LaneConfig,
  type ScaffoldLayout,
} from '@deskwork/core/lanes';
import { loadPipelineTemplate } from '@deskwork/core/pipelines';

const DEFAULT_LANE_ID = 'default';
const DEFAULT_ARTIFACT_KIND: ArtifactKind = 'markdown';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = [
    'site',
    'type',
    'content-url',
    'source',
    'slug',
    'lane',
    'stage',
    'kind',
    'layout',
    'artifact-path',
  ] as const;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail(
      'Usage: deskwork-add <project-root> [--site <slug>] [--type blog|youtube|tool] ' +
        '[--content-url URL] [--source manual|analytics] [--slug <path>] ' +
        '[--lane <lane-id>] [--stage <stage>] ' +
        '[--kind markdown|html-mockup|single-file-html|image] ' +
        '[--layout index|readme|flat] ' +
        '[--artifact-path <path>] ' +
        '<title> [description]',
      2,
    );
  }
  if (flags.slug !== undefined && !SLUG_RE.test(flags.slug)) {
    fail(
      `--slug must be one or more /-separated kebab-case segments ` +
        `(got "${flags.slug}")`,
      2,
    );
  }

  const [rootArg, title, ...rest] = positional;
  const description = rest.join(' ').trim();
  const projectRoot = absolutize(rootArg);

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);
  const calendarPath = resolveCalendarPath(projectRoot, config, site);

  let contentType: ContentType | undefined;
  if (flags.type !== undefined) {
    if (!isContentType(flags.type)) {
      fail(`Invalid --type "${flags.type}". Must be one of: blog, youtube, tool.`);
    }
    contentType = flags.type;
  }

  let source: 'manual' | 'analytics' = 'manual';
  if (flags.source !== undefined) {
    if (flags.source !== 'manual' && flags.source !== 'analytics') {
      fail(`Invalid --source "${flags.source}". Must be "manual" or "analytics".`);
    }
    source = flags.source;
  }

  // Resolve lane + stage + kind BEFORE any disk mutation. If validation
  // fails, the calendar.md write and sidecar write are both skipped —
  // adopting `fail` here on bad input is the same contract as `--type` /
  // `--source` / `--slug`.
  const { lane, laneId, currentStage, artifactKind } = await resolveLaneStageKind(
    projectRoot,
    flags,
  );

  // Resolve the artifactPath SOURCE BEFORE any disk mutation (same
  // pre-write contract as --type / --source / --stage / --kind). Two
  // mutually-exclusive sources:
  //
  //   - `image` kind: NOT templatable (AUDIT-42). Requires an explicit
  //     `--artifact-path <path>`, stamped verbatim. `--layout` is
  //     rejected (an image has no layout shape).
  //   - templatable kinds (markdown / html-mockup / single-file-html):
  //     compose from scaffoldDefaults[kind] + per-kind layout + slug.
  //     `--artifact-path` is rejected (the path is composed, not given).
  //
  // `--layout`, when supplied for a templatable kind, must be both a
  // legal value AND legal for that kind (AUDIT-44). When omitted, the
  // per-kind default fires inside composeAddArtifactPath.
  const artifactPathFlag = flags['artifact-path'];
  let layout: ScaffoldLayout | undefined;

  if (artifactKind === 'image') {
    if (flags['layout'] !== undefined) {
      fail(
        `--layout is not valid with --kind image: an image is a binary `
          + `with no layout shape. Pass --artifact-path <path> instead.`,
        2,
      );
    }
    if (artifactPathFlag === undefined) {
      fail(
        `--kind image requires --artifact-path <path>: an image is not `
          + `templatable (no body to scaffold), so deskwork cannot compose `
          + `a path. Pass the path to the image file explicitly.`,
        2,
      );
    }
  } else {
    if (artifactPathFlag !== undefined) {
      fail(
        `--artifact-path is only valid with --kind image. For kind `
          + `"${artifactKind}", the path is composed from the lane's `
          + `scaffoldDefaults plus --layout; pass --layout instead.`,
        2,
      );
    }
    if (flags['layout'] !== undefined) {
      const parsedLayout = parseScaffoldLayout(flags['layout']);
      if (parsedLayout === undefined) {
        fail(
          `Invalid --layout "${flags['layout']}". `
            + `Must be one of: ${SCAFFOLD_LAYOUTS.join(', ')}.`,
          2,
        );
      }
      if (!isLayoutLegalForKind(artifactKind, parsedLayout)) {
        const legal = legalLayoutsForKind(artifactKind).join(', ') || '(none)';
        fail(
          `--layout "${parsedLayout}" is not legal for --kind `
            + `"${artifactKind}". Legal layouts for "${artifactKind}": `
            + `${legal}.`,
          2,
        );
      }
      layout = parsedLayout;
    }
  }

  const calendar = readCalendar(calendarPath);

  let entry;
  try {
    entry = addEntry(calendar, title, {
      description,
      source,
      ...(contentType !== undefined ? { contentType } : {}),
      ...(flags['content-url'] !== undefined ? { contentUrl: flags['content-url'] } : {}),
      ...(flags.slug !== undefined ? { slug: flags.slug } : {}),
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  // Phase 39c-2b (sub-task b): determine the new entry's authoritative
  // `artifactPath`. For `image` the operator supplied it verbatim via
  // `--artifact-path` (validated above). For templatable kinds, compose
  // it kind-aware from the lane's `scaffoldDefaults[kind]` (directory) +
  // the per-kind/explicit layout + the slug. Done BEFORE `writeCalendar`
  // so a lane that declares no default for this kind fails loudly with
  // NO disk mutation (calendar.md + sidecar both skipped) — same
  // pre-write contract as the flag validations above.
  let artifactPath: string;
  if (artifactKind === 'image') {
    if (artifactPathFlag === undefined) {
      fail('--kind image requires --artifact-path (programmer error)', 2);
    }
    artifactPath = artifactPathFlag;
  } else {
    try {
      artifactPath = composeAddArtifactPath(
        lane,
        artifactKind,
        entry.slug,
        layout,
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  writeCalendar(calendarPath, calendar);

  // #184: write the entry-centric sidecar so calendar.md and
  // .deskwork/entries/<uuid>.json stay aligned per the Phase 30 SSOT
  // contract. Shared with `deskwork ingest --apply` (#183) via
  // createFreshEntrySidecar.
  if (entry.id === undefined) {
    // addEntry always mints a UUID (CalendarEntry.id is `string | undefined`
    // only because pre-id legacy test fixtures need to compile — runtime
    // adds always populate it). Fail loudly if that contract breaks
    // rather than emitting a sidecar with an empty uuid.
    fail('addEntry returned an entry without an id (programmer error)');
  }
  await createFreshEntrySidecar(projectRoot, {
    uuid: entry.id,
    slug: entry.slug,
    title: entry.title,
    ...(entry.description ? { description: entry.description } : {}),
    currentStage,
    source,
    lane: laneId,
    artifactKind,
    artifactPath,
  });

  emit({
    slug: entry.slug,
    title: entry.title,
    stage: currentStage,
    description: entry.description,
    site,
    calendarPath,
    lane: laneId,
    artifactKind,
    contentType: entry.contentType,
    contentUrl: entry.contentUrl,
  });

  function parse() {
    try {
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }
}

/**
 * Resolve and validate `--lane`, `--stage`, `--kind` together.
 *
 * Defaults:
 *   - `--lane`: `'default'` (the bootstrap-default lane bound to the
 *     `editorial` pipeline template). Operator pastes from the
 *     dashboard compose chip — which always supplies `--lane` — so this
 *     default only fires for hand-typed editorial-only invocations.
 *   - `--stage`: the resolved lane's pipeline template's first
 *     `linearStages` entry (`'Ideas'` for editorial, `'Sketched'` for
 *     visual, etc.).
 *   - `--kind`: `'markdown'` (legacy `.md` artifact path; preserves
 *     back-compat for editorial entries that scaffold idea.md).
 *
 * Validation:
 *   - `--lane` must resolve via `loadLaneConfig` — a missing lane
 *     surfaces the loader's full error (lane id + file path + advice).
 *   - `--stage`, when supplied, must appear in the lane's template
 *     `linearStages ∪ offPipelineStages`. The error message lists the
 *     legal stages so the operator can correct without grepping the
 *     template JSON.
 *   - `--kind`, when supplied, must be one of the four ArtifactKindSchema
 *     enum values. Anything else is rejected with the legal list.
 */
async function resolveLaneStageKind(
  projectRoot: string,
  flags: Record<string, string>,
): Promise<{
  lane: LaneConfig;
  laneId: string;
  currentStage: string;
  artifactKind: ArtifactKind;
}> {
  const explicitLane = flags['lane'];
  const laneId = explicitLane ?? DEFAULT_LANE_ID;

  // Migration-window convenience: when the operator does NOT supply
  // `--lane` and the project has no `.deskwork/lanes/default.json` yet
  // (pre-Phase 3 install path, or an editorial-only project that hasn't
  // run doctor's lane-migration yet), bootstrap the default lane from
  // the legacy site config so the editorial path keeps working end-to-
  // end. When the operator explicitly names a lane that does not exist,
  // we surface the loader's error verbatim — the explicit name is the
  // commitment the operator wants honored or refused, not auto-created.
  if (explicitLane === undefined) {
    try {
      await bootstrapDefaultLaneIfMissing(projectRoot);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  let lane;
  try {
    lane = loadLaneConfig(laneId, projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  let template;
  try {
    template = loadPipelineTemplate(lane.pipelineTemplate, projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const firstLinearStage = template.linearStages[0];
  const requestedStage = flags['stage'];
  let currentStage: string;
  if (requestedStage === undefined) {
    currentStage = firstLinearStage;
  } else {
    const allowed = [...template.linearStages, ...template.offPipelineStages];
    if (!allowed.includes(requestedStage)) {
      fail(
        `Invalid --stage "${requestedStage}" for lane "${laneId}" `
          + `(pipeline template "${template.id}"). `
          + `Allowed stages: ${allowed.join(', ')}.`,
        2,
      );
    }
    currentStage = requestedStage;
  }

  let artifactKind: ArtifactKind = DEFAULT_ARTIFACT_KIND;
  const requestedKind = flags['kind'];
  if (requestedKind !== undefined) {
    const parsed = ArtifactKindSchema.safeParse(requestedKind);
    if (!parsed.success) {
      const allowed = ArtifactKindSchema.options.join(', ');
      fail(
        `Invalid --kind "${requestedKind}". Must be one of: ${allowed}.`,
        2,
      );
    }
    artifactKind = parsed.data;
  }

  return { lane, laneId, currentStage, artifactKind };
}
