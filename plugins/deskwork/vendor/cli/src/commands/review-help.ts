/**
 * deskwork-review-help — list open review workflows.
 *
 * Reports every non-terminal workflow with its site, slug, state,
 * current version, and content kind. Useful at session start to see
 * what's in flight across the editorial pipeline.
 *
 * Usage:
 *   deskwork-review-help <project-root> [--site <slug>]
 */

import { readConfig } from '@deskwork/core/config';
import { listOpen } from '@deskwork/core/review/pipeline';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';

export async function run(argv: string[]): Promise<void> {
  const KNOWN_FLAGS = ['site'] as const;

  const { positional, flags } = parse();

  if (positional.length < 1) {
    fail('Usage: deskwork-review-help <project-root> [--site <slug>]', 2);
  }

  const projectRoot = absolutize(positional[0]);

  let config;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const open = listOpen(projectRoot, config, flags.site);

  emit({
    count: open.length,
    workflows: open.map((w) => ({
      id: w.id,
      site: w.site,
      slug: w.slug,
      contentKind: w.contentKind,
      state: w.state,
      version: w.currentVersion,
      updatedAt: w.updatedAt,
      platform: w.platform,
      channel: w.channel,
    })),
  });

  function parse() {
    try {
      return parseArgs(argv, KNOWN_FLAGS);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err), 2);
    }
  }
}
