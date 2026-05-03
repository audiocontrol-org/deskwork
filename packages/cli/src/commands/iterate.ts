/**
 * deskwork-iterate — snapshot the agent's revised content file as a new
 * workflow version (legacy shortform) or a new entry-stage iteration
 * (entry-centric longform/outline).
 *
 * Phase 29 / pipeline redesign: longform + outline iterate now go through
 * the entry-centric helper (`iterateEntry`) which mutates the per-entry
 * sidecar and emits journal events. The workflow-object model remains in
 * place for shortform — that path is preserved as `runShortformIterate`
 * intact, including its dispositions, annotations, and pipeline
 * transitions.
 *
 * Dispatcher: `--kind shortform` → legacy path; otherwise (longform /
 * outline / unset) → entry-centric path.
 *
 * Usage:
 *   deskwork-iterate <project-root> [--site <slug>]
 *                    [--kind longform|outline|shortform]
 *                    [--platform <p>] [--channel <c>]
 *                    [--dispositions <path>] <slug>
 *
 * The dispositions file (optional, shortform only) is a JSON object mapping
 * commentId to { disposition: 'addressed'|'deferred'|'wontfix', reason?: string }.
 */

import { existsSync, readFileSync } from 'node:fs';
import { readConfig } from '@deskwork/core/config';
import {
  resolveSite,
  resolveEntryFilePath,
  resolveShortformFilePath,
} from '@deskwork/core/paths';
import {
  appendAnnotation,
  appendVersion,
  mintAnnotation,
  readAnnotations,
  readVersions,
  readWorkflows,
  transitionState,
} from '@deskwork/core/review/pipeline';
import { isPlatform } from '@deskwork/core/types';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { iterateEntry } from '@deskwork/core/iterate';
import { resolveEntryUuid } from '@deskwork/core/sidecar';

const KNOWN_FLAGS = ['site', 'kind', 'platform', 'channel', 'dispositions'] as const;
const VALID_KINDS = ['longform', 'outline', 'shortform'] as const;
type Kind = (typeof VALID_KINDS)[number];

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
      'Usage: deskwork-iterate <project-root> [--site <slug>] ' +
        '[--kind longform|outline|shortform] [--platform <p>] [--channel <c>] ' +
        '[--dispositions <path>] <slug>',
      2,
    );
  }

  if (
    flags.kind !== undefined &&
    !(VALID_KINDS as readonly string[]).includes(flags.kind)
  ) {
    fail(
      `Invalid --kind "${flags.kind}". Must be 'longform', 'outline', or 'shortform'.`,
    );
  }
  const kind: Kind = ((): Kind => {
    if (flags.kind === 'shortform') return 'shortform';
    if (flags.kind === 'outline') return 'outline';
    return 'longform';
  })();

  if (kind === 'shortform') {
    await runShortformIterate(positional, flags, kind);
    return;
  }

  // longform / outline → entry-centric path
  if (flags.platform !== undefined || flags.channel !== undefined) {
    fail('--platform / --channel are only valid with --kind=shortform.');
  }
  if (flags.dispositions !== undefined) {
    fail('--dispositions is currently only supported with --kind=shortform.');
  }

  await runLongformIterate(positional, flags);
}

/**
 * Entry-centric iterate (longform / outline). Resolves the slug to a
 * sidecar UUID and delegates to `iterateEntry`, which:
 *   - reads the disk artifact at the stage's conventional path,
 *   - appends an iteration event to the per-entry journal,
 *   - bumps the iteration counter on the sidecar,
 *   - flips reviewState to 'in-review'.
 */
async function runLongformIterate(
  positional: string[],
  flags: Record<string, string>,
): Promise<void> {
  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  // Validate --site if passed; the helper itself doesn't currently take
  // a site param (entries are project-global), but failing on a bogus
  // site keeps the CLI's error shape consistent with the legacy command.
  const site = resolveSite(config, flags.site);

  let uuid: string;
  try {
    uuid = await resolveEntryUuid(projectRoot, slug);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  let result;
  try {
    result = await iterateEntry(projectRoot, { uuid });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  emit({
    entryId: result.entryId,
    site,
    slug,
    stage: result.stage,
    state: result.reviewState,
    version: result.version,
  });
}

/**
 * Legacy shortform iterate (workflow-object model). Preserved intact
 * across the Phase 29 pipeline redesign — shortform's workflow-object
 * model migration is deferred. Every line of the original `run(argv)`
 * shortform behavior is reproduced here verbatim.
 */
async function runShortformIterate(
  positional: string[],
  flags: Record<string, string>,
  kind: Kind,
): Promise<void> {
  const DISPOSITIONS = new Set(['addressed', 'deferred', 'wontfix'] as const);
  type Disposition = 'addressed' | 'deferred' | 'wontfix';

  interface DispositionEntry {
    disposition: Disposition;
    reason?: string;
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  if (flags.platform === undefined) {
    fail('--platform is required when --kind=shortform.');
  }
  if (!isPlatform(flags.platform)) {
    fail(`Invalid --platform "${flags.platform}".`);
  }

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);

  // Find the workflow BEFORE resolving the file path. The workflow
  // records the stable entry id, which the path resolver uses to
  // prefer the UUID-bound file over the slug-template (Issue #67).
  const workflow = readWorkflows(projectRoot, config).find(
    (w) =>
      w.site === site &&
      w.slug === slug &&
      w.contentKind === kind &&
      (kind !== 'shortform' || w.platform === flags.platform) &&
      (kind !== 'shortform' || (w.channel ?? null) === (flags.channel ?? null)) &&
      w.state !== 'applied' &&
      w.state !== 'cancelled',
  );
  if (!workflow) {
    fail(
      `No active ${kind} workflow for ${site}/${slug}. ` +
        `Run /deskwork:review-start <slug> to enqueue one first.`,
    );
  }

  let file: string;
  if (kind === 'shortform' && flags.platform !== undefined && isPlatform(flags.platform)) {
    const channel = flags.channel;
    const resolved = resolveShortformFilePath(
      projectRoot,
      config,
      site,
      workflow.entryId !== undefined && workflow.entryId !== ''
        ? { id: workflow.entryId, slug }
        : { slug },
      flags.platform,
      channel,
    );
    if (resolved === undefined) {
      fail(
        `Cannot resolve shortform file for site=${site} slug=${slug} platform=${flags.platform}. ` +
          `Run /deskwork:shortform-start to scaffold it first.`,
      );
    }
    file = resolved;
  } else {
    file = resolveEntryFilePath(
      projectRoot,
      config,
      site,
      slug,
      workflow.entryId,
    );
  }

  if (!existsSync(file)) {
    fail(
      kind === 'shortform'
        ? `No shortform file at ${file}. Run /deskwork:shortform-start first.`
        : `No blog file at ${file}.`,
    );
  }

  const diskMarkdown = readFileSync(file, 'utf8');

  if (workflow.state !== 'iterating') {
    fail(
      `Workflow state is '${workflow.state}', not 'iterating'.\n` +
        `The studio must click 'Request iteration' to move the workflow to ` +
        `'iterating' before this helper runs.`,
    );
  }

  const versions = readVersions(projectRoot, config, workflow.id);
  const current = versions.find((v) => v.version === workflow.currentVersion);
  if (current && current.markdown === diskMarkdown) {
    fail(
      `File on disk is identical to workflow v${workflow.currentVersion} — no revision to snapshot. ` +
        `Write the revision to disk first (the agent does this), then re-run.`,
    );
  }

  // Load dispositions file, if provided. Validate each entry.
  let dispositions: Record<string, DispositionEntry> | null = null;
  if (flags.dispositions !== undefined) {
    const path = absolutize(flags.dispositions);
    if (!existsSync(path)) {
      fail(`--dispositions file not found: ${path}`);
    }
    let parsedDisp: unknown;
    try {
      parsedDisp = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      fail(`--dispositions: invalid JSON at ${path}: ${reason}`);
    }
    if (parsedDisp === null || typeof parsedDisp !== 'object' || Array.isArray(parsedDisp)) {
      fail(`--dispositions: expected JSON object at ${path}`);
    }
    dispositions = {};
    for (const [commentId, raw] of Object.entries(parsedDisp as Record<string, unknown>)) {
      if (typeof raw !== 'object' || raw === null) {
        fail(`--dispositions[${commentId}]: must be an object`);
      }
      const d = raw as { disposition?: unknown; reason?: unknown };
      if (typeof d.disposition !== 'string' || !DISPOSITIONS.has(d.disposition as Disposition)) {
        fail(
          `--dispositions[${commentId}].disposition: must be 'addressed' | 'deferred' | 'wontfix'`,
        );
      }
      const entry: DispositionEntry = { disposition: d.disposition as Disposition };
      if (typeof d.reason === 'string' && d.reason.length > 0) {
        entry.reason = d.reason;
      }
      dispositions[commentId] = entry;
    }
  }

  // Append the new version from disk.
  const newVersion = appendVersion(
    projectRoot,
    config,
    workflow.id,
    diskMarkdown,
    'agent',
  );

  // Emit per-comment address annotations for the new version.
  const addressed: string[] = [];
  if (dispositions) {
    const workflowComments = new Set(
      readAnnotations(projectRoot, config, workflow.id)
        .filter((a) => a.type === 'comment')
        .map((a) => a.id),
    );
    for (const [commentId, entry] of Object.entries(dispositions)) {
      if (!workflowComments.has(commentId)) continue;
      const ann = mintAnnotation({
        type: 'address',
        workflowId: workflow.id,
        commentId,
        version: newVersion.version,
        disposition: entry.disposition,
        ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
      });
      appendAnnotation(projectRoot, config, ann);
      addressed.push(commentId);
    }
  }

  // Flip state back to in-review.
  const updated = transitionState(projectRoot, config, workflow.id, 'in-review');

  emit({
    workflowId: workflow.id,
    site: updated.site,
    slug: updated.slug,
    state: updated.state,
    version: newVersion.version,
    addressedComments: addressed,
  });
}
