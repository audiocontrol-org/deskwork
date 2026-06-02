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
 * The dispositions file (optional, all kinds) is a JSON object mapping
 * commentId to { disposition: 'addressed'|'deferred'|'wontfix', reason?: string }.
 * Both paths emit `address` annotations into their respective annotation
 * stores (workflow-keyed for shortform, entry-keyed for longform/outline).
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
import {
  addEntryAnnotation,
  listEntryAnnotations,
  mintEntryAnnotation,
} from '@deskwork/core/entry/annotations';
import type { DraftAnnotation } from '@deskwork/core/review/types';
import {
  loadDispositionsFile,
  type DispositionEntry,
} from './iterate-dispositions.ts';

const KNOWN_FLAGS = [
  'site',
  'kind',
  'platform',
  'channel',
  'dispositions',
  'auto-dispositions',
] as const;
const VALID_KINDS = ['longform', 'outline', 'shortform'] as const;
type Kind = (typeof VALID_KINDS)[number];

const VALID_DISPOSITIONS = ['addressed', 'deferred', 'wontfix'] as const;
type Disposition = (typeof VALID_DISPOSITIONS)[number];

function isDisposition(v: string): v is Disposition {
  return (VALID_DISPOSITIONS as readonly string[]).includes(v);
}

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
        '[--dispositions <path>] [--auto-dispositions=addressed|deferred|wontfix] <slug>',
      2,
    );
  }

  // #226: --auto-dispositions=<value> applies the named disposition to every
  // unresolved comment without requiring the agent to write a temp JSON. The
  // common case (every margin note in this iteration was addressed by the
  // rewrite) gets a one-flag invocation. Mutual exclusion with --dispositions:
  // operator picks one shape per call.
  if (
    flags['auto-dispositions'] !== undefined &&
    flags.dispositions !== undefined
  ) {
    fail(
      '--auto-dispositions and --dispositions are mutually exclusive; pick one.',
      2,
    );
  }
  if (
    flags['auto-dispositions'] !== undefined &&
    !isDisposition(flags['auto-dispositions'])
  ) {
    fail(
      `--auto-dispositions must be one of 'addressed', 'deferred', 'wontfix' (got "${flags['auto-dispositions']}").`,
      2,
    );
  }
  // Phase 8 Step 8.5.2 — `--auto-dispositions=addressed` has no
  // per-comment `reason` input, so it cannot satisfy the Step 8.1.2
  // contract (`addressed` requires non-empty `reason`). Refuse it at
  // parse time with the same friendly error shape used by the file
  // parser. Operators who want to bulk-address every comment must use
  // an explicit dispositions file with a per-comment reason; the flag
  // remains useful for `deferred` and `wontfix` bulk operations.
  if (flags['auto-dispositions'] === 'addressed') {
    fail(
      `--auto-dispositions=addressed is refused: per Phase 8 Step 8.1.2, `
      + `every addressed disposition must carry a non-empty 'reason'. The `
      + `--auto-dispositions flag has no per-comment reason input. Write a `
      + `dispositions file instead, with shape:\n`
      + `  { "<commentId>": { "disposition": "addressed", "reason": "<text>" } }\n`
      + `then pass --dispositions <path>. The --auto-dispositions flag still `
      + `works for 'deferred' and 'wontfix' where 'reason' is optional.`,
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

  await runLongformIterate(positional, flags);
}

/**
 * Entry-centric iterate (longform / outline). Resolves the slug to a
 * sidecar UUID and delegates to `iterateEntry`, which:
 *   - reads the disk artifact at the stage's conventional path,
 *   - appends an iteration event to the per-entry journal,
 *   - bumps the iteration counter on the sidecar,
 *   - (review-state flip removed: reviewState is RETIRED per DESKWORK-STATE-MACHINE.md)
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

  // Parse dispositions file (if any) BEFORE iterating, so a malformed
  // file fails fast — same fail-shape as the shortform path.
  let dispositions: Record<string, DispositionEntry> | null = null;
  if (flags.dispositions !== undefined) {
    dispositions = loadDispositionsFile(flags.dispositions);
  }

  // #226: --auto-dispositions=<value> resolves AFTER we have the uuid,
  // because we need to enumerate existing comments to build the map.
  // Captured here for use post-uuid-resolution; mutual exclusion with
  // --dispositions was already validated up top.
  const autoDisposition: Disposition | null = isDisposition(
    flags['auto-dispositions'] ?? '',
  )
    ? (flags['auto-dispositions'] as Disposition)
    : null;

  let uuid: string;
  try {
    uuid = await resolveEntryUuid(projectRoot, slug);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  // #226: build the dispositions map from existing unresolved comments
  // when --auto-dispositions is set. Done BEFORE iterateEntry so the
  // failure shape matches the explicit-file path (fail-fast on bad
  // input). For the auto case there's no input to validate beyond the
  // value enum (already checked) — so this just enumerates.
  if (autoDisposition !== null) {
    const existing = await listEntryAnnotations(projectRoot, uuid);
    dispositions = {};
    for (const a of existing) {
      if (a.type !== 'comment') continue;
      dispositions[a.id] = { disposition: autoDisposition };
    }
  }

  let result;
  try {
    result = await iterateEntry(projectRoot, { uuid });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  // Emit per-comment address annotations against the entry-keyed store.
  // Silently skip disposition entries whose commentId doesn't match an
  // existing comment annotation (matches the shortform path's behavior).
  const addressed: string[] = [];
  if (dispositions) {
    const existing = await listEntryAnnotations(projectRoot, uuid);
    const knownCommentIds = new Set(
      existing.filter((a) => a.type === 'comment').map((a) => a.id),
    );
    for (const [commentId, entry] of Object.entries(dispositions)) {
      if (!knownCommentIds.has(commentId)) continue;
      // Phase 8 Step 8.1.2 (Part 2) — `AddressAnnotation` is a
      // discriminated union over `disposition`. Each branch emits the
      // matching variant explicitly so the compiler can narrow.
      // Per the Step 8.1.2 contract, `addressed` requires non-empty
      // `reason`; the runtime write-side schema enforces this at
      // `JournalEventSchema.safeParse`. The CLI-side gating (clear
      // error before write) is Step 8.5.2's scope.
      const ann: DraftAnnotation = ((): DraftAnnotation => {
        if (entry.disposition === 'addressed') {
          if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
            // Compile-defensive: the schema will reject this at write
            // time. Step 8.5.2 will gate this at CLI-parse time with a
            // friendlier error shape.
            throw new Error(
              `--dispositions[${commentId}].reason is required (non-empty) ` +
                `when disposition === 'addressed' (Phase 8 Step 8.1.2 contract)`,
            );
          }
          return mintEntryAnnotation({
            type: 'address',
            workflowId: uuid,
            commentId,
            version: result.version,
            disposition: 'addressed',
            reason: entry.reason,
          });
        }
        if (entry.disposition === 'deferred') {
          return mintEntryAnnotation({
            type: 'address',
            workflowId: uuid,
            commentId,
            version: result.version,
            disposition: 'deferred',
            ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
          });
        }
        return mintEntryAnnotation({
          type: 'address',
          workflowId: uuid,
          commentId,
          version: result.version,
          disposition: 'wontfix',
          ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
        });
      })();
      await addEntryAnnotation(projectRoot, uuid, ann);
      addressed.push(commentId);
    }
  }

  emit({
    entryId: result.entryId,
    site,
    slug,
    stage: result.stage,
    version: result.version,
    addressedComments: addressed,
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
    dispositions = loadDispositionsFile(flags.dispositions);
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
      // Phase 8 Step 8.1.2 (Part 2) — narrow per disposition variant.
      // Same shape as the longform-path narrow above. See the comment
      // there for the contract rationale. The typed local binding is
      // needed because the `'addressed'` / `'deferred'` / `'wontfix'`
      // string literals widen to `string` in `mintAnnotation`'s
      // generic context unless given an explicit contextual type.
      if (entry.disposition === 'addressed') {
        if (typeof entry.reason !== 'string' || entry.reason.length === 0) {
          throw new Error(
            `--dispositions[${commentId}].reason is required (non-empty) ` +
              `when disposition === 'addressed' (Phase 8 Step 8.1.2 contract)`,
          );
        }
        const draftAddressed: Omit<
          Extract<DraftAnnotation, { type: 'address'; disposition: 'addressed' }>,
          'id' | 'createdAt'
        > = {
          type: 'address',
          workflowId: workflow.id,
          commentId,
          version: newVersion.version,
          disposition: 'addressed',
          reason: entry.reason,
        };
        const ann = mintAnnotation(draftAddressed);
        appendAnnotation(projectRoot, config, ann);
        addressed.push(commentId);
        continue;
      }
      if (entry.disposition === 'deferred') {
        const draftDeferred: Omit<
          Extract<DraftAnnotation, { type: 'address'; disposition: 'deferred' }>,
          'id' | 'createdAt'
        > = {
          type: 'address',
          workflowId: workflow.id,
          commentId,
          version: newVersion.version,
          disposition: 'deferred',
          ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
        };
        const ann = mintAnnotation(draftDeferred);
        appendAnnotation(projectRoot, config, ann);
        addressed.push(commentId);
        continue;
      }
      const draftWontfix: Omit<
        Extract<DraftAnnotation, { type: 'address'; disposition: 'wontfix' }>,
        'id' | 'createdAt'
      > = {
        type: 'address',
        workflowId: workflow.id,
        commentId,
        version: newVersion.version,
        disposition: 'wontfix',
        ...(entry.reason !== undefined ? { reason: entry.reason } : {}),
      };
      const ann = mintAnnotation(draftWontfix);
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
