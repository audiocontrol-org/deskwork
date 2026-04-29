/**
 * deskwork-review-cancel — mark a review workflow as cancelled.
 *
 * Cancellation is a terminal state: the journal retains the workflow for
 * audit but it no longer appears in listOpen. Use when a draft is
 * abandoned, a workflow was enqueued by mistake, or a review has
 * been superseded.
 *
 * Usage:
 *   deskwork-review-cancel <project-root> [--site <slug>] <slug>
 *   deskwork-review-cancel <project-root> [--site <slug>] <slug> --platform <p> [--channel <c>]
 *   deskwork-review-cancel <project-root> [--kind outline] <slug>
 */

import { readConfig } from '@deskwork/core/config';
import { resolveSite } from '@deskwork/core/paths';
import { handleGetWorkflow } from '@deskwork/core/review/handlers';
import { transitionState } from '@deskwork/core/review/pipeline';
import type { DraftWorkflowItem } from '@deskwork/core/review/types';
import { isPlatform } from '@deskwork/core/types';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site', 'platform', 'channel', 'kind'] as const;

  const { positional, flags } = parse();

  if (positional.length < 2) {
    fail(
      'Usage: deskwork-review-cancel <project-root> [--site <slug>] ' +
        '[--platform <p>] [--channel <c>] [--kind longform|outline|shortform] <slug>',
      2,
    );
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  if (flags.platform !== undefined && !isPlatform(flags.platform)) {
    fail(`Invalid --platform "${flags.platform}".`);
  }

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const site = resolveSite(config, flags.site);
  const contentKind = flags.kind ?? (flags.platform ? 'shortform' : 'longform');
  if (!['longform', 'shortform', 'outline'].includes(contentKind)) {
    fail(`Invalid --kind "${contentKind}".`);
  }

  const fetched = handleGetWorkflow(projectRoot, config, {
    id: null,
    site,
    slug,
    contentKind,
    platform: flags.platform ?? null,
    channel: flags.channel ?? null,
  });

  if (fetched.status !== 200 || !isWorkflowBody(fetched.body)) {
    fail(
      `no ${contentKind} workflow for ${site}/${slug}: ${errorMessage(fetched.body)}`,
    );
  }

  const workflow = fetched.body.workflow;

  if (workflow.state === 'applied' || workflow.state === 'cancelled') {
    fail(
      `Workflow ${workflow.id} is in terminal state '${workflow.state}' — already resolved, nothing to cancel.`,
    );
  }

  const updated = transitionState(projectRoot, config, workflow.id, 'cancelled');

  emit({
    workflowId: updated.id,
    site: updated.site,
    slug: updated.slug,
    contentKind: updated.contentKind,
    state: updated.state,
    previousState: workflow.state,
  });

  function isWorkflowBody(body: unknown): body is { workflow: DraftWorkflowItem } {
    return typeof body === 'object' && body !== null && 'workflow' in body;
  }

  function errorMessage(body: unknown): string {
    if (typeof body === 'object' && body !== null) {
      const value = Reflect.get(body, 'error');
      if (typeof value === 'string') return value;
    }
    return 'unknown error';
  }

  function parse() {
    try {
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }
}
