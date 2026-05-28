/**
 * deskwork-lane — CRUD operations on lane configs.
 *
 * Phase 6 Task 6.1 (graphical-entries). Thin dispatcher over
 * `@deskwork/core/lanes` operations:
 *
 *   deskwork lane list                              — enumerate active lanes
 *   deskwork lane list --include-archived           — include archived lanes
 *   deskwork lane show <id>                         — show a single lane
 *   deskwork lane create <id> --template <id> --content-dir <path> [--name <label>]
 *   deskwork lane update <id> [--name <label>] [--template <id>] [--content-dir <path>]
 *   deskwork lane archive <id>                      — set archivedAt
 *   deskwork lane restore <id>                      — clear archivedAt
 *   deskwork lane purge <id>                        — delete the JSON (refused when entries reference it)
 *   deskwork lane move <slug-or-uuid> --to <lane-id> [--target-stage <name>]
 *
 * Each handler maps the parsed argv onto the matching core operation
 * and emits a structured JSON result on stdout. Errors are routed
 * through `fail` (stderr + non-zero exit).
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
} from '@deskwork/core/lanes';
import { resolveEntryUuid } from '@deskwork/core/sidecar';

const KNOWN_FLAGS = [
  'template',
  'name',
  'content-dir',
  'to',
  'target-stage',
] as const;
const BOOLEAN_FLAGS = ['include-archived'] as const;

const VERB_USAGE: Readonly<Record<string, string>> = {
  list: 'deskwork lane <project-root> list [--include-archived]',
  show: 'deskwork lane <project-root> show <id>',
  create:
    'deskwork lane <project-root> create <id> --template <id> --content-dir <path> [--name <label>]',
  update:
    'deskwork lane <project-root> update <id> [--name <label>] [--template <id>] [--content-dir <path>]',
  archive: 'deskwork lane <project-root> archive <id>',
  restore: 'deskwork lane <project-root> restore <id>',
  purge: 'deskwork lane <project-root> purge <id>',
  move:
    'deskwork lane <project-root> move <slug-or-uuid> --to <lane-id> [--target-stage <name>]',
};

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
      await handleCreate(projectRoot, rest, flags);
      return;
    case 'update':
      await handleUpdate(projectRoot, rest, flags);
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
    const lanes = listLanes(projectRoot, { includeArchived });
    emit({
      lanes: lanes.map((entry) => ({
        id: entry.id,
        name: entry.config.name,
        pipelineTemplate: entry.config.pipelineTemplate,
        contentDir: entry.config.contentDir,
        archived: entry.archived,
        ...(entry.config.archivedAt !== undefined && {
          archivedAt: entry.config.archivedAt,
        }),
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
      id: lane.id,
      name: lane.name,
      pipelineTemplate: lane.pipelineTemplate,
      contentDir: lane.contentDir,
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
 * shows up in every read/write surface together.
 */
function laneFields(lane: {
  id: string;
  name: string;
  pipelineTemplate: string;
  contentDir: string;
}): Record<string, string> {
  return {
    id: lane.id,
    name: lane.name,
    pipelineTemplate: lane.pipelineTemplate,
    contentDir: lane.contentDir,
  };
}

async function handleCreate(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  if (rest.length < 1) verbUsage('create');
  const [id] = rest;
  if (flags['template'] === undefined) {
    fail('Missing required flag --template <pipeline-id>', 2);
  }
  if (flags['content-dir'] === undefined) {
    fail('Missing required flag --content-dir <path>', 2);
  }
  const template = flags['template'];
  const contentDir = flags['content-dir'];
  const name = flags['name'] ?? id;

  try {
    const result = await createLane(projectRoot, {
      id,
      name,
      pipelineTemplate: template,
      contentDir,
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
      ...(flags['content-dir'] !== undefined && {
        contentDir: flags['content-dir'],
      }),
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
