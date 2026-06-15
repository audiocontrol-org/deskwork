/**
 * Workflow-creation handlers (longform, shortform). Pulled out of
 * `handlers.ts` to keep that file under the 500-line guideline.
 *
 * Both handlers follow the same shape:
 *   1. Validate input (site/slug/platform — same SLUG_RE the rest of
 *      deskwork uses).
 *   2. Resolve the calendar entry (idem-key for the workflow tuple).
 *   3. Resolve the on-disk markdown file path. Longform requires the file
 *      to already exist (scaffolded by /deskwork:outline). Shortform
 *      scaffolds the file in place when missing — frontmatter carries
 *      the deskwork-namespaced binding (`deskwork: { id, platform,
 *      channel? }`), body starts as `initialMarkdown ?? ''`.
 *   4. Call `createWorkflow` (idempotent on the tuple).
 *
 * Phase 21a: shortform IS the same shape as longform — file on disk is
 * SSOT, journal stores snapshots, the studio's review surface renders
 * both kinds identically.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DeskworkConfig } from '../config.ts';
import { isPlatform, type Platform } from '../types.ts';
import { writeFrontmatter } from '../frontmatter.ts';
import { createWorkflow, readWorkflows } from './pipeline.ts';
import {
  lookupEntry,
  resolveLongformFilePath,
  resolveShortformWorkflowFilePath,
} from './workflow-paths.ts';
import { err, ok, type HandlerResult } from './result.ts';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

interface StartLongformBody {
  site: string;
  slug: string;
  /** Optional stable id of the calendar entry — stamped onto the workflow. */
  entryId?: string;
}

/**
 * Enqueue a longform draft review from the studio dashboard. Reads the
 * blog post markdown from disk (honoring blogFilenameTemplate) and calls
 * createWorkflow. Idempotent on (entryId | (site, slug), 'longform').
 */
export function handleStartLongform(
  projectRoot: string,
  config: DeskworkConfig,
  body: unknown,
): HandlerResult {
  if (!body || typeof body !== 'object') return err(400, 'expected JSON object body');
  const b = body as Partial<StartLongformBody>;
  // Phase 39c c3 (spec Decision #22): `site` is an opaque recorded label,
  // no longer validated against `config.sites` (there are no sites to
  // validate against under entry-owns-location). An unknown/absent entry
  // is surfaced by the entry-lookup path below (the 404), not a
  // site-membership 400.
  if (!b.site) return err(400, 'site is required');
  if (!b.slug || typeof b.slug !== 'string') return err(400, 'slug is required');
  if (!SLUG_RE.test(b.slug)) {
    return err(400, `invalid slug: ${b.slug}. Must match ${SLUG_RE}`);
  }

  const callerEntryId =
    b.entryId !== undefined && b.entryId !== '' ? b.entryId : undefined;
  const entry = lookupEntry(projectRoot, config, b.site, {
    ...(callerEntryId !== undefined ? { entryId: callerEntryId } : {}),
    slug: b.slug,
  });
  const entryId = callerEntryId ?? entry?.id;

  let path: string;
  try {
    path = resolveLongformFilePath(projectRoot, config, b.site, b.slug, {
      ...(entryId !== undefined ? { entryId } : {}),
      ...(entry !== undefined ? { entry } : {}),
    });
  } catch (e) {
    return err(400, e instanceof Error ? e.message : String(e));
  }
  if (!existsSync(path)) {
    return err(404, `blog draft not found at ${path}`);
  }

  const markdown = readFileSync(path, 'utf-8');

  const before = readWorkflows(projectRoot, config).find((w) => {
    const identityMatch =
      entryId && w.entryId
        ? w.entryId === entryId
        : w.site === b.site && w.slug === b.slug;
    return (
      identityMatch &&
      w.contentKind === 'longform' &&
      w.state !== 'applied' &&
      w.state !== 'cancelled'
    );
  });
  const workflow = createWorkflow(projectRoot, config, {
    site: b.site,
    slug: b.slug,
    ...(entryId !== undefined && entryId !== '' ? { entryId } : {}),
    contentKind: 'longform',
    initialMarkdown: markdown,
    initialOriginatedBy: 'agent',
  });
  return ok({ workflow, existing: !!before && before.id === workflow.id });
}

// ---------------------------------------------------------------------------
// Phase 21a — shortform start
// ---------------------------------------------------------------------------

interface StartShortformBody {
  site: string;
  slug: string;
  platform: Platform;
  channel?: string;
  /** Optional initial markdown body for the file when scaffolding. */
  initialMarkdown?: string;
  /** Optional stable id of the calendar entry — stamped onto the workflow. */
  entryId?: string;
}

/**
 * Enqueue a shortform draft review. Mirrors `handleStartLongform`'s shape:
 * resolve the calendar entry by slug, compute the shortform file path,
 * scaffold the file (frontmatter `deskwork: { id, platform, channel? }` +
 * body) when missing, then `createWorkflow` with `contentKind: 'shortform'`
 * and v1 mirroring the file body.
 *
 * Idempotent: if a workflow already exists for the
 * (entryId|site+slug, contentKind, platform, channel) tuple,
 * `createWorkflow` returns it unchanged. If the file already exists on
 * disk (operator resuming), creation is skipped and the body is read.
 *
 * Lifecycle decoupling: shortform is independent of the longform
 * outline → drafting → published path. If the entry has no body file
 * yet (Ideas / Planned / Outlining without scaffold), this handler
 * still works — it creates the entry directory + scrapbook subdirs
 * before writing the shortform file.
 */
export function handleStartShortform(
  projectRoot: string,
  config: DeskworkConfig,
  body: unknown,
): HandlerResult {
  if (!body || typeof body !== 'object') return err(400, 'expected JSON object body');
  const b = body as Partial<StartShortformBody>;
  // Phase 39c c3 (spec Decision #22): `site` is an opaque recorded label,
  // no longer validated against `config.sites`. A missing entry surfaces
  // via the entry-lookup 404 below, not a site-membership 400.
  if (!b.site) return err(400, 'site is required');
  if (!b.slug || typeof b.slug !== 'string') return err(400, 'slug is required');
  if (!SLUG_RE.test(b.slug)) {
    return err(400, `invalid slug: ${b.slug}. Must match ${SLUG_RE}`);
  }
  if (!b.platform) return err(400, 'platform is required');
  if (!isPlatform(b.platform)) {
    return err(400, `invalid platform: ${String(b.platform)}`);
  }
  const channel =
    b.channel !== undefined && b.channel !== '' ? b.channel : undefined;

  const callerEntryId =
    b.entryId !== undefined && b.entryId !== '' ? b.entryId : undefined;
  const entry = lookupEntry(projectRoot, config, b.site, {
    ...(callerEntryId !== undefined ? { entryId: callerEntryId } : {}),
    slug: b.slug,
  });
  if (!entry) {
    return err(404, `no calendar entry for site=${b.site} slug=${b.slug}`);
  }
  const entryId = callerEntryId ?? entry.id;

  // Phase 39c-2b(a): the shortform path is COMPOSED from the parent
  // entry's stored artifactPath dir (spec AUDIT-35) — always a path when
  // the parent has artifactPath, else a doctor --fix throw. The old
  // "undefined → materialize from slug-template" fallback is retired.
  let filePath: string;
  try {
    filePath = resolveShortformWorkflowFilePath(
      projectRoot,
      config,
      b.site,
      b.slug,
      b.platform,
      channel,
      {
        ...(entryId !== undefined ? { entryId } : {}),
        entry,
      },
    );
  } catch (e) {
    return err(400, e instanceof Error ? e.message : String(e));
  }

  // Scaffold the file when missing. Frontmatter carries the
  // deskwork-namespaced binding so the studio can render the workflow
  // off the file content directly.
  let markdown: string;
  if (existsSync(filePath)) {
    markdown = readFileSync(filePath, 'utf-8');
  } else {
    mkdirSync(dirname(filePath), { recursive: true });
    const initialBody = b.initialMarkdown ?? '';
    const deskworkMeta: Record<string, unknown> = {
      platform: b.platform,
    };
    if (channel !== undefined) deskworkMeta.channel = channel;
    if (entryId !== undefined && entryId !== '') deskworkMeta.id = entryId;
    const fmData: Record<string, unknown> = {
      title: entry.title,
      deskwork: deskworkMeta,
    };
    writeFrontmatter(filePath, fmData, initialBody);
    markdown = initialBody;
  }

  // Idempotent on (entryId|site+slug, contentKind, platform, channel).
  const before = readWorkflows(projectRoot, config).find((w) => {
    const identityMatch =
      entryId && w.entryId
        ? w.entryId === entryId
        : w.site === b.site && w.slug === b.slug;
    return (
      identityMatch &&
      w.contentKind === 'shortform' &&
      (w.platform ?? null) === (b.platform ?? null) &&
      (w.channel ?? null) === (channel ?? null) &&
      w.state !== 'applied' &&
      w.state !== 'cancelled'
    );
  });
  const workflow = createWorkflow(projectRoot, config, {
    site: b.site,
    slug: b.slug,
    ...(entryId !== undefined && entryId !== '' ? { entryId } : {}),
    contentKind: 'shortform',
    platform: b.platform,
    ...(channel !== undefined ? { channel } : {}),
    initialMarkdown: markdown,
    initialOriginatedBy: 'agent',
  });
  return ok({
    workflow,
    existing: !!before && before.id === workflow.id,
    filePath,
  });
}

// ---------------------------------------------------------------------------
// Workflow → file dispatch (used by handleCreateVersion)
// ---------------------------------------------------------------------------

/**
 * Resolve the on-disk markdown file path for any kind of workflow.
 * Dispatches on `contentKind`. Resolves via the entry's stored
 * `artifactPath` (Phase 39c-2b(a)); throws `doctor --fix` for an
 * unmigrated entry rather than returning `undefined`.
 */
export function workflowFilePath(
  projectRoot: string,
  config: DeskworkConfig,
  workflow: {
    site: string;
    slug: string;
    contentKind: 'longform' | 'shortform' | 'outline';
    entryId?: string;
    platform?: Platform;
    channel?: string;
  },
): string {
  if (workflow.contentKind === 'shortform') {
    if (workflow.platform === undefined) {
      throw new Error(
        `shortform workflow ${JSON.stringify(workflow)} has no platform`,
      );
    }
    return resolveShortformWorkflowFilePath(
      projectRoot,
      config,
      workflow.site,
      workflow.slug,
      workflow.platform,
      workflow.channel,
      {
        ...(workflow.entryId !== undefined ? { entryId: workflow.entryId } : {}),
      },
    );
  }
  return resolveLongformFilePath(projectRoot, config, workflow.site, workflow.slug, {
    ...(workflow.entryId !== undefined ? { entryId: workflow.entryId } : {}),
  });
}
