/**
 * deskwork shortform-start — enqueue a shortform draft for editorial
 * review.
 *
 * Mirrors the longform `review-start` flow, but for the per-platform /
 * per-channel shortform copy that lives in the entry's scrapbook. The
 * shortform file is the source of truth — the workflow holds version
 * snapshots that mirror the file's body. The studio's review surface
 * renders shortform workflows with a small platform/channel header above
 * the same markdown editor used for longform.
 *
 * Usage:
 *   deskwork shortform-start <project-root> [--site <slug>]
 *                            --platform <p> [--channel <c>]
 *                            [--initial-markdown <text>] <slug>
 *
 * The `<slug>` positional resolves the calendar entry; `--platform` is
 * required and must be one of the known Platforms (reddit, youtube,
 * linkedin, instagram). `--channel` is optional and must be kebab-case
 * (the same shape as a slug segment). `--initial-markdown` seeds the
 * file body when scaffolding — leave it off for an empty draft.
 *
 * The helper is idempotent: if a non-terminal shortform workflow already
 * matches `(entryId | site+slug, platform, channel?)`, that workflow is
 * returned unchanged and the file body is left as-is.
 *
 * Emits a JSON result with the workflow id, the studio review URL path
 * (the operator's running studio is on whatever port they chose — only
 * the path is emitted), the resolved file path, and the platform /
 * channel echo so callers can surface them.
 */

import { readConfig } from '@deskwork/core/config';
import { resolveSite } from '@deskwork/core/paths';
import { handleStartShortform } from '@deskwork/core/review/handlers';
import type { DraftWorkflowItem } from '@deskwork/core/review/types';
import { isPlatform, PLATFORMS } from '@deskwork/core/types';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

interface StartShortformResultBody {
  workflow: DraftWorkflowItem;
  existing: boolean;
  filePath: string;
}

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site', 'platform', 'channel', 'initial-markdown'] as const;
  const SLUG_RE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail(
      'Usage: deskwork shortform-start <project-root> [--site <slug>] ' +
        '--platform <p> [--channel <c>] [--initial-markdown <text>] <slug>',
      2,
    );
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  if (!SLUG_RE.test(slug)) {
    fail(`invalid slug: ${slug} (must match ${SLUG_RE})`);
  }

  const platform = flags.platform;
  if (platform === undefined) {
    fail(
      `--platform is required. Must be one of: ${PLATFORMS.join(', ')}.`,
      2,
    );
  }
  if (!isPlatform(platform)) {
    fail(
      `Invalid --platform "${platform}". Must be one of: ${PLATFORMS.join(', ')}.`,
    );
  }

  const channel = flags.channel;
  const initialMarkdown = flags['initial-markdown'];

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  let site: string;
  try {
    site = resolveSite(config, flags.site);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const result = handleStartShortform(projectRoot, config, {
    site,
    slug,
    platform,
    ...(channel !== undefined ? { channel } : {}),
    ...(initialMarkdown !== undefined ? { initialMarkdown } : {}),
  });

  if (result.status !== 200) {
    fail(errorMessage(result.body));
  }

  if (!isSuccessBody(result.body)) {
    fail('shortform-start: handler returned a malformed response');
  }

  const { workflow, existing, filePath } = result.body;

  emit({
    workflowId: workflow.id,
    site: workflow.site,
    slug: workflow.slug,
    state: workflow.state,
    version: workflow.currentVersion,
    fresh: !existing,
    platform: workflow.platform,
    ...(workflow.channel !== undefined ? { channel: workflow.channel } : {}),
    filePath,
    reviewUrl: `/dev/editorial-review/${workflow.id}`,
  });

  function parse() {
    try {
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }

  function isSuccessBody(body: unknown): body is StartShortformResultBody {
    if (typeof body !== 'object' || body === null) return false;
    if (!('workflow' in body) || !('filePath' in body)) return false;
    const workflowVal = Reflect.get(body, 'workflow');
    const filePathVal = Reflect.get(body, 'filePath');
    return (
      typeof workflowVal === 'object' &&
      workflowVal !== null &&
      typeof filePathVal === 'string'
    );
  }

  function errorMessage(body: unknown): string {
    if (typeof body === 'object' && body !== null) {
      const value = Reflect.get(body, 'error');
      if (typeof value === 'string') return value;
    }
    return 'shortform-start: unknown error';
  }
}
