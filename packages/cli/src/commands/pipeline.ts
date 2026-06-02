/**
 * deskwork-pipeline — CRUD operations on pipeline templates.
 *
 * Phase 6 Task 6.2 (graphical-entries). Thin dispatcher over
 * `@deskwork/core/pipelines` operations:
 *
 *   deskwork pipeline list [--full]                       — enumerate templates
 *   deskwork pipeline show <id>                           — show a single template (resolved JSON)
 *   deskwork pipeline create <id> --shape "<s1>,<s2>,..." [--name <label>] [--description <text>]
 *   deskwork pipeline update <id> --add-stage <name> [--position N]
 *   deskwork pipeline update <id> --rename-stage <from> --to-stage <to>
 *   deskwork pipeline update <id> --remove-stage <name>
 *   deskwork pipeline update <id> --set-locked "<s1>,<s2>,..."
 *   deskwork pipeline update <id> --set-off-pipeline "<s1>,<s2>,..."
 *   deskwork pipeline delete <id> [--reassign-lanes-to <other-id>]
 *
 * Each handler maps the parsed argv onto the matching core operation
 * and emits a structured JSON result on stdout. Errors are routed
 * through `fail` (stderr + non-zero exit).
 *
 * `update`'s five operation flags are mutually exclusive — the
 * handler refuses (exit 2) when more than one is passed in a single
 * invocation. The CLI uses `--to-stage <to>` rather than the workplan
 * shape `--rename-stage <from> <to>` because the underlying argv
 * parser is single-value-per-flag; reading the second positional after
 * `--rename-stage` as `<to>` would require a special-cased parser.
 * `--to-stage` keeps the parser shape uniform and is documented in the
 * SKILL.md.
 */

import {
  absolutize,
  emit,
  fail,
  parseArgs,
  type ParsedArgs,
} from '@deskwork/core/cli-args';
import {
  createPipeline,
  deletePipeline,
  listPipelines,
  showPipeline,
  updatePipeline,
  type UpdatePipelineOperation,
} from '@deskwork/core/pipelines';

const KNOWN_FLAGS = [
  'shape',
  'name',
  'description',
  'add-stage',
  'position',
  'rename-stage',
  'to-stage',
  'remove-stage',
  'set-locked',
  'set-off-pipeline',
  'reassign-lanes-to',
] as const;
const BOOLEAN_FLAGS = ['full'] as const;

const VERB_USAGE: Readonly<Record<string, string>> = {
  list: 'deskwork pipeline <project-root> list [--full]',
  show: 'deskwork pipeline <project-root> show <id>',
  create:
    'deskwork pipeline <project-root> create <id> --shape "<s1>,<s2>,..." '
    + '[--name <label>] [--description <text>]',
  update:
    'deskwork pipeline <project-root> update <id> <one-of: '
    + '--add-stage <name> [--position N] | '
    + '--rename-stage <from> --to-stage <to> | '
    + '--remove-stage <name> | '
    + '--set-locked "<s1>,<s2>,..." | '
    + '--set-off-pipeline "<s1>,<s2>,...">',
  delete:
    'deskwork pipeline <project-root> delete <id> '
    + '[--reassign-lanes-to <other-id>]',
};

function genericUsage(): never {
  fail(
    'Usage: deskwork pipeline <project-root> <verb> [args...]\n'
      + '  verbs: list | show | create | update | delete\n'
      + '  see `deskwork pipeline <project-root> <verb>` for per-verb help',
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
      await handleList(projectRoot, booleans.has('full'));
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
    case 'delete':
      await handleDelete(projectRoot, rest, flags);
      return;
    default:
      fail(
        `Unknown pipeline verb: ${verb}\n`
          + '  verbs: list | show | create | update | delete',
        2,
      );
  }
}

async function handleList(projectRoot: string, full: boolean): Promise<void> {
  try {
    // AUDIT-20260530-57 (Task 0.33): consume the operation's two-channel
    // result (healthy `pipelines` + `malformed` entries) so a single
    // corrupt project-override JSON cannot abort the whole enumeration.
    // The CLI surfaces the malformed channel alongside the healthy list
    // so the operator's picker still shows every built-in preset even
    // when one of their overrides fails to parse.
    const result = listPipelines(projectRoot);
    const malformed = result.malformed.map((m) => ({
      id: m.id,
      error: m.error,
    }));
    if (!full) {
      emit({
        pipelines: result.pipelines.map((p) => ({ id: p.id })),
        malformed,
      });
      return;
    }
    emit({
      pipelines: result.pipelines.map((p) => ({
        id: p.id,
        name: p.template.name,
        source: p.source,
        linearStageCount: p.linearStageCount,
        lockedStageCount: p.lockedStageCount,
        offPipelineStageCount: p.offPipelineStageCount,
      })),
      malformed,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow(projectRoot: string, rest: string[]): Promise<void> {
  if (rest.length < 1) verbUsage('show');
  const [id] = rest;
  try {
    const result = showPipeline(projectRoot, id);
    emit({
      id: result.template.id,
      name: result.template.name,
      description: result.template.description,
      linearStages: result.template.linearStages,
      ...(result.template.lockedStages !== undefined && {
        lockedStages: result.template.lockedStages,
      }),
      offPipelineStages: result.template.offPipelineStages,
      source: result.source,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Split a comma-separated stage list. Trims whitespace around each
 * entry; refuses empty results.
 */
function splitStageList(raw: string, flagName: string): string[] {
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length === 0 || (parts.length === 1 && parts[0].length === 0)) {
    fail(`Flag --${flagName} requires a non-empty comma-separated stage list`, 2);
  }
  return parts;
}

async function handleCreate(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  if (rest.length < 1) verbUsage('create');
  const [id] = rest;
  if (flags['shape'] === undefined) {
    fail('Missing required flag --shape "<s1>,<s2>,..."', 2);
  }
  const linearStages = splitStageList(flags['shape'], 'shape');

  try {
    const result = await createPipeline(projectRoot, {
      id,
      linearStages,
      ...(flags['name'] !== undefined && { name: flags['name'] }),
      ...(flags['description'] !== undefined && {
        description: flags['description'],
      }),
    });
    emit({
      created: true,
      id: result.template.id,
      name: result.template.name,
      linearStages: result.template.linearStages,
      lockedStages: result.template.lockedStages ?? [],
      offPipelineStages: result.template.offPipelineStages,
      path: result.path,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Build the discriminated `UpdatePipelineOperation` from the parsed
 * flags. Refuses (exit 2) if zero or more-than-one operation flag is
 * present.
 */
function resolveUpdateOperation(
  id: string,
  flags: Record<string, string>,
): UpdatePipelineOperation {
  const present: string[] = [];
  if (flags['add-stage'] !== undefined) present.push('add-stage');
  if (flags['rename-stage'] !== undefined) present.push('rename-stage');
  if (flags['remove-stage'] !== undefined) present.push('remove-stage');
  if (flags['set-locked'] !== undefined) present.push('set-locked');
  if (flags['set-off-pipeline'] !== undefined) present.push('set-off-pipeline');

  if (present.length === 0) {
    fail(
      `Cannot update pipeline "${id}": no operation flag supplied. Pass `
      + 'exactly one of --add-stage, --rename-stage, --remove-stage, '
      + '--set-locked, --set-off-pipeline.',
      2,
    );
  }
  if (present.length > 1) {
    fail(
      `Cannot update pipeline "${id}": operation flags are mutually `
      + `exclusive; received ${present.join(', ')}. Pass exactly one per `
      + `invocation.`,
      2,
    );
  }

  if (flags['add-stage'] !== undefined) {
    const positionStr = flags['position'];
    let position: number | undefined;
    if (positionStr !== undefined) {
      const parsed = Number(positionStr);
      if (!Number.isInteger(parsed) || parsed < 0) {
        fail(`--position must be a non-negative integer; received "${positionStr}"`, 2);
      }
      position = parsed;
    }
    return position === undefined
      ? { op: 'add-stage', stage: flags['add-stage'] }
      : { op: 'add-stage', stage: flags['add-stage'], position };
  }
  if (flags['rename-stage'] !== undefined) {
    if (flags['to-stage'] === undefined) {
      fail('--rename-stage requires --to-stage <new-name>', 2);
    }
    return {
      op: 'rename-stage',
      from: flags['rename-stage'],
      to: flags['to-stage'],
    };
  }
  if (flags['remove-stage'] !== undefined) {
    return { op: 'remove-stage', stage: flags['remove-stage'] };
  }
  if (flags['set-locked'] !== undefined) {
    return {
      op: 'set-locked',
      stages: splitStageList(flags['set-locked'], 'set-locked'),
    };
  }
  // set-off-pipeline is the only remaining branch (present.length === 1
  // and the earlier branches didn't match).
  return {
    op: 'set-off-pipeline',
    stages: splitStageList(flags['set-off-pipeline'], 'set-off-pipeline'),
  };
}

async function handleUpdate(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  if (rest.length < 1) verbUsage('update');
  const [id] = rest;
  const operation = resolveUpdateOperation(id, flags);

  try {
    const result = await updatePipeline(projectRoot, { id, operation });
    emit({
      updated: true,
      id: result.template.id,
      operation: operation.op,
      linearStages: result.template.linearStages,
      lockedStages: result.template.lockedStages ?? [],
      offPipelineStages: result.template.offPipelineStages,
      path: result.path,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleDelete(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  if (rest.length < 1) verbUsage('delete');
  const [id] = rest;
  // AUDIT-20260530-55 (cross-model: AUDIT-BARRAGE-claude-P6-1):
  // normalize an empty `--reassign-lanes-to ""` (or an unset shell
  // variable expanding to the empty string) to "flag not supplied" so
  // the operation-side dependent-lane refusal fires instead of
  // silently bypassing the refusal AND the rebind block. Defense-in-
  // depth — `deletePipeline` independently rejects an empty value;
  // the CLI normalization here ensures the operation also receives
  // a clean `undefined`.
  const reassignRaw = flags['reassign-lanes-to'];
  const reassignLanesTo =
    reassignRaw !== undefined && reassignRaw.length > 0 ? reassignRaw : undefined;
  try {
    const result = await deletePipeline(projectRoot, {
      id,
      ...(reassignLanesTo !== undefined && { reassignLanesTo }),
    });
    emit({
      deleted: true,
      id,
      purgedPath: result.purgedPath,
      reassignedLanes: result.reassignedLanes,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
