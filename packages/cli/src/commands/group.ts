/**
 * deskwork-group — CRUD operations on group entries (entries whose
 * `members[]` is non-empty per Task 7.1.2).
 *
 * Phase 7 Task 7.2 (graphical-entries). Thin dispatcher over
 * `@deskwork/core/groups` operations:
 *
 *   deskwork group list                              — enumerate active groups
 *   deskwork group list --include-archived           — include archived groups
 *   deskwork group show <slug-or-uuid>               — show a group + its members
 *   deskwork group create <slug> --lane <lane-id> [--artifact-path <path>]
 *                                                    — write a new group entry
 *   deskwork group update <slug-or-uuid> [--title <text>]
 *                                                    — mutate group metadata
 *   deskwork group add-member <group> <member> [--at <i>]
 *                                                    — append (or insert at i)
 *   deskwork group remove-member <group> <member>    — remove the member
 *   deskwork group archive <slug-or-uuid>            — set archivedAt
 *   deskwork group restore <slug-or-uuid>            — clear archivedAt
 *
 * Cancel is the universal `/deskwork:cancel` verb — group cancel does
 * NOT live here. The `--cascade` flag on `/deskwork:cancel` is what
 * gives operators the opt-in cascade per Step 7.2.6. See
 * `packages/cli/src/commands/cancel.ts`.
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
  addGroupMember,
  archiveGroup,
  createGroup,
  listGroups,
  removeGroupMember,
  restoreGroup,
  showGroup,
  updateGroup,
} from '@deskwork/core/groups';

const KNOWN_FLAGS = ['lane', 'artifact-path', 'title', 'at'] as const;
const BOOLEAN_FLAGS = ['include-archived'] as const;

const VERB_USAGE: Readonly<Record<string, string>> = {
  list: 'deskwork group <project-root> list [--include-archived]',
  show: 'deskwork group <project-root> show <slug-or-uuid>',
  create:
    'deskwork group <project-root> create <slug> --lane <lane-id> '
    + '[--artifact-path <path>] [--title <text>]',
  update:
    'deskwork group <project-root> update <slug-or-uuid> [--title <text>]',
  'add-member':
    'deskwork group <project-root> add-member <group-slug-or-uuid> '
    + '<member-slug-or-uuid> [--at <index>]',
  'remove-member':
    'deskwork group <project-root> remove-member <group-slug-or-uuid> '
    + '<member-slug-or-uuid>',
  archive: 'deskwork group <project-root> archive <slug-or-uuid>',
  restore: 'deskwork group <project-root> restore <slug-or-uuid>',
};

function genericUsage(): never {
  fail(
    'Usage: deskwork group <project-root> <verb> [args...]\n'
      + '  verbs: list | show | create | update | add-member | '
      + 'remove-member | archive | restore\n'
      + '  see `deskwork group <project-root> <verb>` for per-verb help',
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
    case 'add-member':
      await handleAddMember(projectRoot, rest, flags);
      return;
    case 'remove-member':
      await handleRemoveMember(projectRoot, rest);
      return;
    case 'archive':
      await handleArchive(projectRoot, rest);
      return;
    case 'restore':
      await handleRestore(projectRoot, rest);
      return;
    default:
      fail(
        `Unknown group verb: ${verb}\n`
          + '  verbs: list | show | create | update | add-member | '
          + 'remove-member | archive | restore',
        2,
      );
  }
}

async function handleList(
  projectRoot: string,
  includeArchived: boolean,
): Promise<void> {
  try {
    const groups = await listGroups(projectRoot, { includeArchived });
    emit({
      groups: groups.map((g) => ({
        uuid: g.entry.uuid,
        slug: g.entry.slug,
        title: g.entry.title,
        ...(g.entry.lane !== undefined && { lane: g.entry.lane }),
        currentStage: g.entry.currentStage,
        memberCount: g.memberCount,
        archived: g.archived,
        ...(g.entry.archivedAt !== undefined && {
          archivedAt: g.entry.archivedAt,
        }),
      })),
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleShow(
  projectRoot: string,
  rest: string[],
): Promise<void> {
  if (rest.length < 1) verbUsage('show');
  const [slug] = rest;
  try {
    const result = await showGroup(projectRoot, slug);
    emit({
      uuid: result.entry.uuid,
      slug: result.entry.slug,
      title: result.entry.title,
      ...(result.entry.lane !== undefined && { lane: result.entry.lane }),
      currentStage: result.entry.currentStage,
      ...(result.entry.artifactPath !== undefined && {
        artifactPath: result.entry.artifactPath,
      }),
      archived: result.archived,
      ...(result.entry.archivedAt !== undefined && {
        archivedAt: result.entry.archivedAt,
      }),
      members: result.members,
      memberCount: result.members.length,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleCreate(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  if (rest.length < 1) verbUsage('create');
  const [slug] = rest;
  if (flags['lane'] === undefined) {
    fail('Missing required flag --lane <lane-id>', 2);
  }
  const lane = flags['lane'];
  const title = flags['title'] ?? slug;

  try {
    const result = await createGroup(projectRoot, {
      slug,
      title,
      lane,
      ...(flags['artifact-path'] !== undefined && {
        artifactPath: flags['artifact-path'],
      }),
    });
    emit({
      created: true,
      uuid: result.entry.uuid,
      slug: result.entry.slug,
      title: result.entry.title,
      lane: result.entry.lane,
      currentStage: result.entry.currentStage,
      ...(result.entry.artifactPath !== undefined && {
        artifactPath: result.entry.artifactPath,
      }),
      members: result.entry.members ?? [],
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
  const [slug] = rest;

  try {
    const result = await updateGroup(projectRoot, {
      slugOrUuid: slug,
      ...(flags['title'] !== undefined && { title: flags['title'] }),
    });
    emit({
      updated: true,
      uuid: result.entry.uuid,
      slug: result.entry.slug,
      title: result.entry.title,
      changedFields: result.changedFields,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleAddMember(
  projectRoot: string,
  rest: string[],
  flags: Record<string, string>,
): Promise<void> {
  if (rest.length < 2) verbUsage('add-member');
  const [groupSlug, memberSlug] = rest;

  // Parse --at into a number with a clear error message on invalid
  // input — `parseArgs` only validates value-vs-missing, not numeric
  // shape.
  let at: number | undefined;
  if (flags['at'] !== undefined) {
    at = Number.parseInt(flags['at'], 10);
    if (!Number.isInteger(at) || at < 0 || `${at}` !== flags['at']) {
      fail(
        `Invalid --at value ${JSON.stringify(flags['at'])}: must be a `
          + 'non-negative integer (0-based insertion index).',
        2,
      );
    }
  }

  try {
    const result = await addGroupMember(projectRoot, {
      groupSlugOrUuid: groupSlug,
      memberSlugOrUuid: memberSlug,
      ...(at !== undefined && { at }),
    });
    emit({
      added: true,
      groupId: result.entry.uuid,
      groupSlug: result.entry.slug,
      memberId: result.memberId,
      memberSlug: result.memberSlug,
      index: result.index,
      members: result.members,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleRemoveMember(
  projectRoot: string,
  rest: string[],
): Promise<void> {
  if (rest.length < 2) verbUsage('remove-member');
  const [groupSlug, memberSlug] = rest;

  try {
    const result = await removeGroupMember(projectRoot, {
      groupSlugOrUuid: groupSlug,
      memberSlugOrUuid: memberSlug,
    });
    emit({
      removed: true,
      groupId: result.entry.uuid,
      groupSlug: result.entry.slug,
      memberId: result.memberId,
      memberSlug: result.memberSlug,
      members: result.members,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleArchive(
  projectRoot: string,
  rest: string[],
): Promise<void> {
  if (rest.length < 1) verbUsage('archive');
  const [slug] = rest;
  try {
    const result = await archiveGroup(projectRoot, slug);
    emit({
      archived: true,
      uuid: result.entry.uuid,
      slug: result.entry.slug,
      archivedAt: result.entry.archivedAt,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

async function handleRestore(
  projectRoot: string,
  rest: string[],
): Promise<void> {
  if (rest.length < 1) verbUsage('restore');
  const [slug] = rest;
  try {
    const result = await restoreGroup(projectRoot, slug);
    emit({
      restored: true,
      uuid: result.entry.uuid,
      slug: result.entry.slug,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
