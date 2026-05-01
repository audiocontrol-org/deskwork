/**
 * deskwork-approve — terminal write step for the review loop.
 *
 * Phase 29 / pipeline redesign: longform approve goes through the
 * entry-centric helper (`approveEntryStage`) which advances the per-entry
 * sidecar's `currentStage` to its successor and emits a stage-transition
 * journal event. The workflow-object model remains in place for shortform
 * — that path is preserved as `runShortformApprove` intact, including the
 * disk SSOT semantics for the rendered file.
 *
 * Dispatcher: `--platform` set → legacy shortform path; otherwise →
 * entry-centric path.
 *
 * Usage:
 *   deskwork-approve <project-root> [--site <slug>] <slug>
 *   deskwork-approve <project-root> [--site <slug>] <slug> --platform <p> [--channel <c>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { readConfig } from '@deskwork/core/config';
import {
  resolveSite,
  resolveCalendarPath,
  resolveShortformFilePath,
} from '@deskwork/core/paths';
import { readCalendar, writeCalendar } from '@deskwork/core/calendar';
import { parseFrontmatter } from '@deskwork/core/frontmatter';
import { handleGetWorkflow } from '@deskwork/core/review/handlers';
import {
  readAnnotations,
  transitionState,
} from '@deskwork/core/review/pipeline';
import type {
  ApproveAnnotation,
  DraftAnnotation,
  DraftVersion,
  DraftWorkflowItem,
} from '@deskwork/core/review/types';
import { isPlatform } from '@deskwork/core/types';
import type { DeskworkConfig } from '@deskwork/core/config';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { approveEntryStage } from '@deskwork/core/entry/approve';
import { resolveEntryUuid } from '@deskwork/core/sidecar';

const KNOWN_FLAGS = ['site', 'platform', 'channel'] as const;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

export async function run(argv: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(argv, KNOWN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }

  const { positional, flags } = parsed;

  if (positional.length < 2) {
    fail(
      'Usage: deskwork-approve <project-root> [--site <slug>] <slug> ' +
        '[--platform <p>] [--channel <c>]',
      2,
    );
  }

  const [, slug] = positional;
  if (!SLUG_RE.test(slug)) {
    fail(`invalid slug: ${slug} (must match ${SLUG_RE})`);
  }

  if (flags.platform !== undefined) {
    if (!isPlatform(flags.platform)) {
      fail(`Invalid --platform "${flags.platform}".`);
    }
    await runShortformApprove(positional, flags);
    return;
  }

  if (flags.channel !== undefined) {
    fail('--channel is only valid with --platform.');
  }

  await runLongformApprove(positional, flags);
}

/**
 * Entry-centric approve (longform / outline). Resolves the slug to a
 * sidecar UUID and delegates to `approveEntryStage`, which advances
 * `currentStage` to its successor and writes a stage-transition journal
 * event. Refuses Final → Published (use `publish`), Published, Blocked,
 * and Cancelled.
 */
async function runLongformApprove(
  positional: string[],
  flags: Record<string, string>,
): Promise<void> {
  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  let config: DeskworkConfig;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  // Validate --site (entries are project-global today, but failing on a
  // bogus site keeps the CLI's error shape consistent with the legacy
  // command).
  const site = resolveSite(config, flags.site);

  let uuid: string;
  try {
    uuid = await resolveEntryUuid(projectRoot, slug);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  let result;
  try {
    result = await approveEntryStage(projectRoot, { uuid });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  emit({
    entryId: result.entryId,
    site,
    slug,
    fromStage: result.fromStage,
    toStage: result.toStage,
  });
}

/**
 * Legacy shortform approve (workflow-object model). Preserved intact
 * across the Phase 29 pipeline redesign — shortform's workflow-object
 * model migration is deferred. Reproduces the original `applyShortform`
 * behavior verbatim.
 */
async function runShortformApprove(
  positional: string[],
  flags: Record<string, string>,
): Promise<void> {
  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  let config: DeskworkConfig;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);

  const fetched = handleGetWorkflow(projectRoot, config, {
    id: null,
    site,
    slug,
    contentKind: 'shortform',
    platform: flags.platform ?? null,
    channel: flags.channel ?? null,
  });

  if (fetched.status !== 200 || !isSuccessBody(fetched.body)) {
    fail(
      `no shortform workflow for ${site}/${slug}: ${errorMessage(fetched.body)}`,
    );
  }

  const workflow = fetched.body.workflow;
  const versions = fetched.body.versions;

  if (workflow.state !== 'approved') {
    fail(
      `Workflow state is '${workflow.state}', not 'approved'. ` +
        `Click Approve in the review UI first (that records which version was approved).`,
    );
  }

  const annotations = readAnnotations(projectRoot, config, workflow.id);
  const approveAnn = latestApprove(annotations);
  const approvedVersion = approveAnn?.version ?? workflow.currentVersion;

  if (!flags.platform) fail('--platform is required for shortform workflows');
  if (!isPlatform(flags.platform)) fail(`Invalid --platform "${flags.platform}".`);

  // Phase 21a: shortform is now disk-backed. Read the on-disk file as
  // the SSOT — the journal version is just the latest snapshot, but
  // every save writes to disk first. Strip the frontmatter so the
  // calendar's `## Shortform Copy` section captures the body only.
  const filePath = resolveShortformFilePath(
    projectRoot,
    config,
    site,
    { slug },
    flags.platform,
    flags.channel,
  );
  if (filePath === undefined || !existsSync(filePath)) {
    const shown = filePath ?? '(unresolved)';
    fail(
      `Shortform file missing at ${shown}. ` +
        `The file is the SSOT — re-run /deskwork:shortform-start if needed.`,
    );
  }

  const fileSrc = readFileSync(filePath, 'utf-8');
  const approvedMarkdown = parseFrontmatter(fileSrc).body.replace(/^\n+/, '');

  const calendarPath = resolveCalendarPath(projectRoot, config, site);
  const cal = readCalendar(calendarPath);

  const channelLower = flags.channel?.toLowerCase();
  const match = cal.distributions.find((d) => {
    if (d.slug !== slug) return false;
    if (d.platform !== flags.platform) return false;
    if (channelLower !== undefined) {
      return (d.channel?.toLowerCase() ?? '') === channelLower;
    }
    return !d.channel;
  });

  if (!match) {
    const channelBit = flags.channel ? ` · channel=${flags.channel}` : '';
    fail(
      `No distribution record for (slug=${slug}, platform=${flags.platform}${channelBit}). ` +
        `Create it with /deskwork:distribute first.`,
    );
  }

  match.shortform = approvedMarkdown;
  writeCalendar(calendarPath, cal);
  transitionState(projectRoot, config, workflow.id, 'applied');

  void versions;
  emit({
    workflowId: workflow.id,
    site,
    slug,
    contentKind: 'shortform',
    state: 'applied',
    version: approvedVersion,
    platform: flags.platform,
    channel: flags.channel,
    calendarPath,
    filePath,
  });
}

function latestApprove(
  annotations: readonly DraftAnnotation[],
): ApproveAnnotation | undefined {
  const approves = annotations.filter(
    (a): a is ApproveAnnotation => a.type === 'approve',
  );
  if (approves.length === 0) return undefined;
  return approves.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
}

function isSuccessBody(
  body: unknown,
): body is { workflow: DraftWorkflowItem; versions: DraftVersion[] } {
  if (typeof body !== 'object' || body === null) return false;
  return 'workflow' in body && 'versions' in body;
}

function errorMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const value = Reflect.get(body, 'error');
    if (typeof value === 'string') return value;
  }
  return 'unknown error';
}
