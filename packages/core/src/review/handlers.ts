/**
 * HTTP-shape handlers for the review pipeline. Astro API routes in
 * plugins/deskwork/studio/ call these directly; the handlers return
 * { status, body } results that routes serialize as JSON.
 *
 * Ported from audiocontrol.org's scripts/lib/editorial-review/handlers.ts.
 * Site validation now checks against config.sites rather than a hardcoded
 * SITES array, and the longform blog file path uses resolveBlogFilePath
 * (which honors the site's blogFilenameTemplate config).
 */

import { existsSync, writeFileSync } from 'node:fs';
import type { DeskworkConfig } from '../config.ts';
import type { DraftAnnotation, DraftWorkflowState } from './types.ts';
import {
  appendAnnotation,
  appendVersion,
  mintAnnotation,
  readAnnotations,
  readVersions,
  readWorkflow,
  readWorkflows,
  transitionState,
} from './pipeline.ts';
import { workflowFilePath } from './start-handlers.ts';
import { err, ok, type HandlerResult } from './result.ts';

export type { HandlerResult } from './result.ts';
export { handleStartLongform, handleStartShortform } from './start-handlers.ts';

// Distribute Omit over the union so `Extract` on the `type` discriminant
// still works. Plain `Omit<Union, K>` collapses the union into a single
// non-discriminated type.
type DistributeOmit<T, K extends keyof any> = T extends unknown
  ? Omit<T, K>
  : never;
type AnnotationDraft = DistributeOmit<DraftAnnotation, 'id' | 'createdAt'>;

export function handleAnnotate(
  projectRoot: string,
  config: DeskworkConfig,
  body: unknown,
): HandlerResult {
  if (!body || typeof body !== 'object') return err(400, 'expected JSON object body');
  const draft = body as Partial<AnnotationDraft>;

  if (!draft.type) return err(400, 'type is required');
  if (!draft.workflowId) return err(400, 'workflowId is required');

  const workflow = readWorkflow(projectRoot, config, draft.workflowId);
  if (!workflow) return err(404, `unknown workflow: ${draft.workflowId}`);

  switch (draft.type) {
    case 'comment': {
      const d = draft as Partial<Extract<AnnotationDraft, { type: 'comment' }>>;
      if (typeof d.version !== 'number') return err(400, 'comment.version is required');
      if (!d.range || typeof d.range.start !== 'number' || typeof d.range.end !== 'number') {
        return err(400, 'comment.range with numeric start/end is required');
      }
      if (typeof d.text !== 'string') return err(400, 'comment.text is required');
      const annotation = mintAnnotation({
        type: 'comment',
        workflowId: draft.workflowId,
        version: d.version,
        range: d.range,
        text: d.text,
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(typeof d.anchor === 'string' ? { anchor: d.anchor } : {}),
      });
      appendAnnotation(projectRoot, config, annotation);
      return ok({ annotation });
    }
    case 'edit': {
      const d = draft as Partial<Extract<AnnotationDraft, { type: 'edit' }>>;
      if (typeof d.beforeVersion !== 'number') return err(400, 'edit.beforeVersion is required');
      if (typeof d.afterMarkdown !== 'string') return err(400, 'edit.afterMarkdown is required');
      if (typeof d.diff !== 'string') return err(400, 'edit.diff is required');
      const annotation = mintAnnotation({
        type: 'edit',
        workflowId: draft.workflowId,
        beforeVersion: d.beforeVersion,
        afterMarkdown: d.afterMarkdown,
        diff: d.diff,
      });
      appendAnnotation(projectRoot, config, annotation);
      return ok({ annotation });
    }
    case 'approve':
    case 'reject': {
      const d = draft as Partial<Extract<AnnotationDraft, { type: 'approve' | 'reject' }>>;
      if (typeof d.version !== 'number') return err(400, `${draft.type}.version is required`);
      const annotation = mintAnnotation({
        type: draft.type,
        workflowId: draft.workflowId,
        version: d.version,
        ...(draft.type === 'reject' && 'reason' in d ? { reason: d.reason } : {}),
      } as AnnotationDraft);
      appendAnnotation(projectRoot, config, annotation);
      return ok({ annotation });
    }
    case 'resolve': {
      const d = draft as Partial<Extract<AnnotationDraft, { type: 'resolve' }>>;
      if (typeof d.commentId !== 'string' || d.commentId.length === 0) {
        return err(400, 'resolve.commentId is required');
      }
      const resolved = typeof d.resolved === 'boolean' ? d.resolved : true;
      const annotation = mintAnnotation({
        type: 'resolve',
        workflowId: draft.workflowId,
        commentId: d.commentId,
        resolved,
      });
      appendAnnotation(projectRoot, config, annotation);
      return ok({ annotation });
    }
    case 'address': {
      const d = draft as Partial<Extract<AnnotationDraft, { type: 'address' }>>;
      if (typeof d.commentId !== 'string' || d.commentId.length === 0) {
        return err(400, 'address.commentId is required');
      }
      if (typeof d.version !== 'number') return err(400, 'address.version is required');
      if (d.disposition !== 'addressed' && d.disposition !== 'deferred' && d.disposition !== 'wontfix') {
        return err(400, "address.disposition must be 'addressed' | 'deferred' | 'wontfix'");
      }
      const annotation = mintAnnotation({
        type: 'address',
        workflowId: draft.workflowId,
        commentId: d.commentId,
        version: d.version,
        disposition: d.disposition,
        ...(typeof d.reason === 'string' ? { reason: d.reason } : {}),
      });
      appendAnnotation(projectRoot, config, annotation);
      return ok({ annotation });
    }
    default:
      return err(400, `unknown annotation type: ${String(draft.type)}`);
  }
}

export function handleListAnnotations(
  projectRoot: string,
  config: DeskworkConfig,
  query: { workflowId: string | null; version: string | null },
): HandlerResult {
  if (!query.workflowId) return err(400, 'workflowId query param is required');
  const version =
    query.version !== null && query.version !== undefined
      ? parseInt(query.version, 10)
      : undefined;
  if (version !== undefined && Number.isNaN(version)) {
    return err(400, 'version must be a number');
  }
  const annotations = readAnnotations(projectRoot, config, query.workflowId, version);
  return ok({ annotations });
}

interface DecisionBody {
  workflowId: string;
  to: DraftWorkflowState;
}

export function handleDecision(
  projectRoot: string,
  config: DeskworkConfig,
  body: unknown,
): HandlerResult {
  if (!body || typeof body !== 'object') return err(400, 'expected JSON object body');
  const d = body as Partial<DecisionBody>;
  if (!d.workflowId) return err(400, 'workflowId is required');
  if (!d.to) return err(400, 'to is required');
  try {
    const updated = transitionState(projectRoot, config, d.workflowId, d.to);
    return ok({ workflow: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.startsWith('Unknown workflow') ? 404 : 409;
    return err(status, message);
  }
}

/**
 * Return a workflow plus its full version history. The client looks up
 * by one of (in priority order):
 *   1. Workflow id — exact match on `DraftWorkflowItem.id`.
 *   2. `entryId` — stable calendar-entry UUID; join survives slug renames.
 *      Preferred over slug when available.
 *   3. (site, slug) — legacy lookup, still supported for workflows that
 *      have no entryId stamped.
 *
 * All lookups can additionally filter by (contentKind, platform, channel).
 */
export function handleGetWorkflow(
  projectRoot: string,
  config: DeskworkConfig,
  query: {
    id: string | null;
    entryId?: string | null;
    site: string | null;
    slug: string | null;
    contentKind: string | null;
    platform: string | null;
    channel: string | null;
  },
): HandlerResult {
  if (query.id) {
    const workflow = readWorkflow(projectRoot, config, query.id);
    if (!workflow) return err(404, `unknown workflow id: ${query.id}`);
    return ok({
      workflow,
      versions: readVersions(projectRoot, config, workflow.id),
    });
  }
  if (!query.entryId && (!query.site || !query.slug)) {
    return err(400, 'either id, entryId, or (site & slug) query params are required');
  }
  if (query.site && !(query.site in config.sites)) {
    const known = Object.keys(config.sites).join(', ');
    return err(400, `unknown site: ${query.site}. Configured: ${known}`);
  }
  const contentKind = (query.contentKind ?? 'longform') as
    | 'longform'
    | 'shortform'
    | 'outline';
  const candidates = readWorkflows(projectRoot, config).filter((w) => {
    // Stable-identity join when entryId is present on both sides;
    // fall back to (site, slug) for legacy workflows. Always still
    // filter by contentKind + platform + channel to keep scope.
    const identityMatch =
      query.entryId && w.entryId
        ? w.entryId === query.entryId
        : query.site && query.slug
          ? w.site === query.site && w.slug === query.slug
          : false;
    return (
      identityMatch &&
      w.contentKind === contentKind &&
      (w.platform ?? null) === (query.platform ?? null) &&
      (w.channel ?? null) === (query.channel ?? null)
    );
  });
  if (candidates.length === 0) {
    const key = query.entryId
      ? `entryId=${query.entryId}`
      : `${query.site ?? '?'}/${query.slug ?? '?'}`;
    return err(404, `no workflow for ${key} (${contentKind})`);
  }
  // Prefer active over terminal; within each tier, prefer most-recently created.
  const isTerminal = (s: DraftWorkflowState) => s === 'applied' || s === 'cancelled';
  const match = [...candidates].sort((a, b) => {
    const aTerm = isTerminal(a.state) ? 1 : 0;
    const bTerm = isTerminal(b.state) ? 1 : 0;
    if (aTerm !== bTerm) return aTerm - bTerm;
    return b.createdAt.localeCompare(a.createdAt);
  })[0];
  return ok({ workflow: match, versions: readVersions(projectRoot, config, match.id) });
}

interface VersionBody {
  workflowId: string;
  beforeVersion: number;
  afterMarkdown: string;
}

/**
 * Operator edit-mode submission. Writes disk first (SSOT invariant),
 * then appends a DraftVersion + edit annotation with the server-computed
 * diff.
 */
export function handleCreateVersion(
  projectRoot: string,
  config: DeskworkConfig,
  body: unknown,
): HandlerResult {
  if (!body || typeof body !== 'object') return err(400, 'expected JSON object body');
  const d = body as Partial<VersionBody>;
  if (!d.workflowId) return err(400, 'workflowId is required');
  if (typeof d.beforeVersion !== 'number') return err(400, 'beforeVersion is required');
  if (typeof d.afterMarkdown !== 'string') return err(400, 'afterMarkdown is required');

  const workflow = readWorkflow(projectRoot, config, d.workflowId);
  if (!workflow) return err(404, `unknown workflow: ${d.workflowId}`);

  const versions = readVersions(projectRoot, config, d.workflowId);
  const before = versions.find((v) => v.version === d.beforeVersion);
  if (!before) return err(404, `unknown beforeVersion: ${d.beforeVersion}`);

  if (before.markdown === d.afterMarkdown) {
    return err(400, 'afterMarkdown is identical to beforeVersion — no edit to record');
  }

  const diff = lineDiff(before.markdown, d.afterMarkdown);

  // SSOT: the markdown file on disk IS the article. Write disk first,
  // then snapshot to the journal. All content kinds (longform, outline,
  // shortform) are disk-backed — Phase 21a removed the shortform special
  // case so the studio's save/iterate/approve handlers see one shape.
  //
  // Resolve via the content index first (so writingcontrol-shaped layouts
  // where slug != fs path work), with template fallback for legacy
  // / pre-doctor cases. For shortform, the path goes through
  // resolveShortformFilePath (entry-dir + scrapbook/shortform/<…>.md).
  const targetFile = workflowFilePath(projectRoot, config, workflow);
  if (targetFile === undefined || !existsSync(targetFile)) {
    const shown = targetFile ?? '(unresolved)';
    if (workflow.contentKind === 'shortform') {
      return err(
        500,
        `cannot save: shortform file missing at ${shown}. ` +
          `Run /deskwork:shortform-start to scaffold the file before saving edits.`,
      );
    }
    return err(
      500,
      `cannot save: blog file missing at ${shown}. ` +
        `Scaffold the post with /deskwork:outline before saving edits.`,
    );
  }
  writeFileSync(targetFile, d.afterMarkdown, 'utf-8');

  const version = appendVersion(projectRoot, config, d.workflowId, d.afterMarkdown, 'operator');
  const annotation = mintAnnotation({
    type: 'edit',
    workflowId: d.workflowId,
    beforeVersion: d.beforeVersion,
    afterMarkdown: d.afterMarkdown,
    diff,
  });
  appendAnnotation(projectRoot, config, annotation);
  return ok({ version, annotation });
}

/**
 * Minimal line-level diff. `-` / `+` prefixed lines for removed/added
 * content, `=` for unchanged. Paired with `applyLineDiff` the operation
 * is reversible.
 */
export function lineDiff(a: string, b: string): string {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const out: string[] = [];
  const n = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < n; i++) {
    const aLine = aLines[i];
    const bLine = bLines[i];
    if (aLine === bLine) {
      if (aLine !== undefined) out.push(`= ${aLine}`);
    } else {
      if (aLine !== undefined) out.push(`- ${aLine}`);
      if (bLine !== undefined) out.push(`+ ${bLine}`);
    }
  }
  return out.join('\n');
}

/** Apply a line-diff (as produced by `lineDiff`) to reconstruct the after-text. */
export function applyLineDiff(diff: string): string {
  const out: string[] = [];
  for (const line of diff.split('\n')) {
    if (line.startsWith('= ')) out.push(line.slice(2));
    else if (line.startsWith('+ ')) out.push(line.slice(2));
    else if (line === '=' || line === '+') out.push('');
  }
  return out.join('\n');
}
