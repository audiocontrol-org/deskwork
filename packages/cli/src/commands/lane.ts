/**
 * deskwork-lane — CRUD operations on lane configs.
 *
 * Phase 6 Task 6.1 (graphical-entries). Thin dispatcher over
 * `@deskwork/core/lanes` operations:
 *
 *   deskwork lane list                              — enumerate active lanes
 *   deskwork lane list --include-archived           — include archived lanes
 *   deskwork lane show <id>                         — show a single lane
 *   deskwork lane create <id> --template <id> [--scaffold-default <kind>=<dir>]... [--host <h>] [--name <label>]
 *   deskwork lane update <id> [--name <label>] [--template <id>] [--scaffold-default <kind>=<dir>]... [--host <h>]
 *   deskwork lane archive <id>                      — set archivedAt
 *   deskwork lane restore <id>                      — clear archivedAt
 *   deskwork lane purge <id>                        — delete the JSON (refused when entries reference it)
 *   deskwork lane move <slug-or-uuid> --to <lane-id> [--target-stage <name>]
 *
 * Each handler maps the parsed argv onto the matching core operation
 * and emits a structured JSON result on stdout. Errors are routed
 * through `fail` (stderr + non-zero exit).
 *
 * Per Phase 39 (sites→lanes retirement) a lane carries no `contentDir`.
 * The former `--content-dir <path>` flag is replaced by the REPEATABLE
 * `--scaffold-default <kind>=<dir>` flag (one per artifact kind the
 * lane scaffolds). `scaffoldDefaults` is an add-time convenience only —
 * never identity, never resolution.
 */

import {
  absolutize,
  emit,
  fail,
  parseArgs,
  type ParsedArgs,
} from '@deskwork/core/cli-args';
import {
  archiveLane,
  createLane,
  listLanes,
  moveEntryToLane,
  purgeLane,
  restoreLane,
  showLane,
  updateLane,
  ArtifactKindSchema,
  type ArtifactKind,
  type LaneConfig,
} from '@deskwork/core/lanes';
import { resolveEntryUuid } from '@deskwork/core/sidecar';

const KNOWN_FLAGS = [
  'template',
  'name',
  'scaffold-default',
  'host',
  'to',
  'target-stage',
] as const;
const BOOLEAN_FLAGS = ['include-archived'] as const;

const VERB_USAGE: Readonly<Record<string, string>> = {
  list: 'deskwork lane <project-root> list [--include-archived]',
  show: 'deskwork lane <project-root> show <id>',
  create:
    'deskwork lane <project-root> create <id> --template <id> [--scaffold-default <kind>=<dir>]... [--host <h>] [--name <label>]',
  update:
    'deskwork lane <project-root> update <id> [--name <label>] [--template <id>] [--scaffold-default <kind>=<dir>]... [--host <h>]',
  archive: 'deskwork lane <project-root> archive <id>',
  restore: 'deskwork lane <project-root> restore <id>',
  purge: 'deskwork lane <project-root> purge <id>',
  move:
    'deskwork lane <project-root> move <slug-or-uuid> --to <lane-id> [--target-stage <name>]',
};

/**
 * Collect every `--scaffold-default <kind>=<dir>` occurrence from a raw
 * argv slice into a `Partial<Record<ArtifactKind, string>>`. The flag
 * is REPEATABLE — `parseArgs` collapses repeated flags (last-wins), so
 * the raw argv is scanned directly to honor every occurrence.
 *
 * Accepts both `--scaffold-default kind=dir` (two tokens) and
 * `--scaffold-default=kind=dir` (single token) shapes. Throws a
 * descriptive error on a malformed pair (missing `=`, unknown kind,
 * empty dir, duplicate kind).
 *
 * Returns `undefined` when no occurrence is present so callers can omit
 * the field entirely.
 */
function collectScaffoldDefaults(
  argv: readonly string[],
): Partial<Record<ArtifactKind, string>> | undefined {
  const out: Partial<Record<ArtifactKind, string>> = {};
  let seen = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    let pair: string | undefined;
    if (token === '--scaffold-default') {
      pair = argv[i + 1];
      i++;
    } else if (token.startsWith('--scaffold-default=')) {
      pair = token.slice('--scaffold-default='.length);
    } else {
      continue;
    }
    if (pair === undefined || pair.startsWith('--')) {
      fail('Flag --scaffold-default requires a <kind>=<dir> value', 2);
    }
    const eq = pair.indexOf('=');
    if (eq < 0) {
      fail(
        `Invalid --scaffold-default value ${JSON.stringify(pair)}: `
          + 'expected <kind>=<dir>.',
        2,
      );
    }
    const kindRaw = pair.slice(0, eq);
    const dir = pair.slice(eq + 1);
    const kindResult = ArtifactKindSchema.safeParse(kindRaw);
    if (!kindResult.success) {
      fail(
        `Invalid --scaffold-default kind ${JSON.stringify(kindRaw)}: `
          + `must be one of ${ArtifactKindSchema.options.join(', ')}.`,
        2,
      );
    }
    if (dir.length === 0) {
      fail(
        `Invalid --scaffold-default value ${JSON.stringify(pair)}: `
          + 'directory must be non-empty.',
        2,
      );
    }
    const kind = kindResult.data;
    if (out[kind] !== undefined) {
      fail(
        `Duplicate --scaffold-default kind ${JSON.stringify(kind)}: `
          + 'each artifact kind may be set at most once.',
        2,
      );
    }
    out[kind] = dir;
    seen = true;
  }
  return seen ? out : undefined;
}

function genericUsage(): never {
  fail(
    'Usage: deskwork lane <project-root> <verb> [args...]\n'
      + '  verbs: list | show | create | update | archive | restore | purge | move\n'
      + '  see `deskwork lane <project-root> <verb>` for per-verb help',
    2,
  );
}

function verbUsage(verb: string): never {
  const u = VERB_USAGE[verb];
  if (u === undefined) genericUsage();
  fail(`Usage: ${u}`, 2);
}

export async function run(argv: string[]): Promise<void> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv, KNOWN_FLAGS, BOOLEAN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }

  const { positional, flags, booleans } = parsed;
  if (positional.length < 2) genericUsage();

  const [rootArg, verb, ...rest] = positional;
  const projectRoot = absolutize(rootArg);

  switch (verb) {
    case 'list':
      await handleList(projectRoot, booleans.has('include-archived'));
      return;
    case 'show':
      await handleShow(projectRoot, rest);
      return;
    case 'create':
      await handleCreate(projectRoot, rest, flags, collectScaffoldDefaults(argv));
      return;
    case 'update':
      await handleUpdate(projectRoot, rest, flags, collectScaffoldDefaults(argv));
      return;
    case 'archive':
      await handleArchive(projectRoot, rest);
      return;
    case 'restore':
      await handleRestore(projectRoot, rest);
      return;
    case 'purge':
      await handlePurge(projectRoot, rest);
      return;
    case 'move':
      await handleMove(projectRoot, rest, flags);
      return;
    default:
      fail(
        `Unknown lane verb: ${verb}\n`
          + '  verbs: list | show | create | update | archive | restore | purge | move',
        2,
      );
  }
}

async function handleList(
  projectRoot: string,
  includeArchived: boolean,
): Promise<void> {
  try {
    // AUDIT-20260530-57 (Task 0.33): consume the operation's two-channel
    // result (healthy `lanes` + `malformed` entries) so a single corrupt
    // lane JSON cannot abort the whole enumeration. The CLI surfaces the
    // malformed channel alongside the healthy list so the operator can
    // see both at once instead of losing the entire list to the first
    // parse error.
    const result = listLanes(projectRoot, { includeArchived });
    emit({
      lanes: result.lanes.map((entry) => ({
        id: entry.id,
        name: entry.config.name,
        pipelineTemplate: entry.config.pipelineTemplate,
        ...(entry.config.scaffoldDefaults !== undefined && {
          scaffoldDefaults: entry.config.scaffoldDefaults,
        }),
        ...(entry.config.host !== undefined && { host: entry.config.host }),
        archived: entry.archived,
        ...(entry.config.archivedAt !== undefined && {
          archivedAt: entry.config.archivedAt,
        }),
      })),
      malformed: result.malformed.map((entry) => ({
        id: entry.id,
        error: entry.error,
      })),
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow(projectRoot: string, rest: string[]): Promise<void> {
  if (rest.length < 1) verbUsage('show');
  const [id] = rest;
  try {
    const lane = showLane(projectRoot, id);
    emit({
      ...laneFields(lane),
      archived:
        typeof lane.archivedAt === 'string' && lane.archivedAt.length > 0,
      ...(lane.archivedAt !== undefined && { archivedAt: lane.archivedAt }),
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Shared envelope for create / update / show emit payloads. Keeps the
 * key set named once so adding e.g. a `description` field to a lane
 * shows up in every read/write surface together. Per Phase 39 a lane
 * has no `contentDir`; the optional `scaffoldDefaults` / `host` fields
 * render only when present.
 */
function laneFields(lane: LaneConfig): Record<string, unknown> {
  return {
    id: lane.id,
    name: lane.name,
    pipelineTemplate: lane.pipelineTemplate,
    ...(lane.scaffoldDefaults !== undefined && {
      scaffoldDefaults: lane.scaffoldDefaults,
    }),
    ...(lane.host !== undefined && { host: lane.host }),
  };
}

async function handleCreate(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
  scaffoldDefaults: Partial<Record<ArtifactKind, string>> | undefined,
): Promise<void> {
  if (rest.length < 1) verbUsage('create');
  const [id] = rest;
  if (flags['template'] === undefined) {
    fail('Missing required flag --template <pipeline-id>', 2);
  }
  const template = flags['template'];
  const name = flags['name'] ?? id;

  try {
    const result = await createLane(projectRoot, {
      id,
      name,
      pipelineTemplate: template,
      ...(scaffoldDefaults !== undefined && { scaffoldDefaults }),
      ...(flags['host'] !== undefined && { host: flags['host'] }),
    });
    emit({
      created: true,
      ...laneFields(result.lane),
      path: result.path,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleUpdate(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
  scaffoldDefaults: Partial<Record<ArtifactKind, string>> | undefined,
): Promise<void> {
  if (rest.length < 1) verbUsage('update');
  const [id] = rest;

  try {
    const result = await updateLane(projectRoot, {
      id,
      ...(flags['name'] !== undefined && { name: flags['name'] }),
      ...(flags['template'] !== undefined && {
        pipelineTemplate: flags['template'],
      }),
      ...(scaffoldDefaults !== undefined && { scaffoldDefaults }),
      ...(flags['host'] !== undefined && { host: flags['host'] }),
    });
    emit({
      updated: true,
      ...laneFields(result.lane),
      changedFields: result.changedFields,
      path: result.path,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleArchive(projectRoot: string, rest: string[]): Promise<void> {
  if (rest.length < 1) verbUsage('archive');
  const [id] = rest;
  try {
    const result = await archiveLane(projectRoot, id);
    emit({
      archived: true,
      id: result.lane.id,
      archivedAt: result.lane.archivedAt,
      path: result.path,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleRestore(projectRoot: string, rest: string[]): Promise<void> {
  if (rest.length < 1) verbUsage('restore');
  const [id] = rest;
  try {
    const result = await restoreLane(projectRoot, id);
    emit({
      restored: true,
      id: result.lane.id,
      path: result.path,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handlePurge(projectRoot: string, rest: string[]): Promise<void> {
  if (rest.length < 1) verbUsage('purge');
  const [id] = rest;
  try {
    const result = await purgeLane(projectRoot, id);
    emit({
      purged: true,
      id,
      path: result.purgedPath,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleMove(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  if (rest.length < 1) verbUsage('move');
  const [slug] = rest;
  if (flags['to'] === undefined) {
    fail('Missing required flag --to <lane-id>', 2);
  }
  const toLane = flags['to'];

  try {
    const uuid = await resolveEntryUuid(projectRoot, slug);
    const result = await moveEntryToLane(projectRoot, {
      uuid,
      toLane,
      ...(flags['target-stage'] !== undefined && {
        targetStage: flags['target-stage'],
      }),
    });
    emit({
      moved: true,
      entryId: result.entryId,
      slug,
      fromLane: result.fromLane,
      toLane: result.toLane,
      fromStage: result.fromStage,
      toStage: result.toStage,
      ...(result.fromArtifactPath !== undefined && {
        fromArtifactPath: result.fromArtifactPath,
      }),
      ...(result.toArtifactPath !== undefined && {
        toArtifactPath: result.toArtifactPath,
      }),
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
