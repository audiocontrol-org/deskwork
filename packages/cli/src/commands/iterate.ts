/**
 * deskwork-iterate — snapshot the agent's revised content file as a new
 * workflow version and transition back to in-review.
 *
 * Call this AFTER the agent has rewritten the markdown on disk based on
 * operator comments. The helper does the mechanical persist-and-transition
 * step:
 *
 *   1. Read the workflow (must be in state `iterating`).
 *   2. If disk differs from the workflow's current version, append a
 *      new version (originatedBy='agent') — this is the SSOT flow:
 *      disk is canonical, the journal captures snapshots.
 *   3. Optionally read a dispositions JSON and emit address annotations
 *      (one per commentId) that the studio sidebar renders as badges.
 *   4. Transition the workflow back to in-review.
 *
 * Phase 21a: `--kind shortform` is accepted alongside longform/outline.
 * The mutation is kind-agnostic — it reads the workflow's on-disk file
 * (longform: `<contentDir>/<slug>.md`; shortform:
 * `<contentDir>/<slug>/scrapbook/shortform/<platform>[-<channel>].md`)
 * and snapshots its body as the new version.
 *
 * Usage:
 *   deskwork-iterate <project-root> [--site <slug>]
 *                    [--kind longform|outline|shortform]
 *                    [--platform <p>] [--channel <c>]
 *                    [--dispositions <path>] <slug>
 *
 * The dispositions file (optional) is a JSON object mapping commentId to
 * { disposition: 'addressed'|'deferred'|'wontfix', reason?: string }.
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

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site', 'kind', 'platform', 'channel', 'dispositions'] as const;
  const DISPOSITIONS = new Set(['addressed', 'deferred', 'wontfix'] as const);
  const VALID_KINDS = ['longform', 'outline', 'shortform'] as const;
  type Kind = (typeof VALID_KINDS)[number];
  type Disposition = 'addressed' | 'deferred' | 'wontfix';

  interface DispositionEntry {
    disposition: Disposition;
    reason?: string;
  }

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail(
      'Usage: deskwork-iterate <project-root> [--site <slug>] ' +
        '[--kind longform|outline|shortform] [--platform <p>] [--channel <c>] ' +
        '[--dispositions <path>] <slug>',
      2,
    );
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

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
    if (flags.platform === undefined) {
      fail('--platform is required when --kind=shortform.');
    }
    if (!isPlatform(flags.platform)) {
      fail(`Invalid --platform "${flags.platform}".`);
    }
  } else if (flags.platform !== undefined || flags.channel !== undefined) {
    fail('--platform / --channel are only valid with --kind=shortform.');
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      fail(`--dispositions: invalid JSON at ${path}: ${reason}`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail(`--dispositions: expected JSON object at ${path}`);
    }
    dispositions = {};
    for (const [commentId, raw] of Object.entries(parsed as Record<string, unknown>)) {
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

  function parse() {
    try {
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }
}
