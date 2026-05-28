// Subcommand layer for /dw-lifecycle:session-start's prior-recommendation
// display. Reads DEVELOPMENT-NOTES.md once, locates the most-recent
// `### Hygiene observations` + `### Next session recommendation (hygiene)`
// block for the active feature slug, and prints it verbatim.
//
// NO fresh scan — display only. Argv:
//   --slug <feature-slug>     (required)

import { join } from 'node:path';
import { loadConfig } from '../config.js';
import { repoRoot } from '../repo.js';
import { readPriorRecommendation } from '../lifecycle-integration/session-start-recommendation.js';

export interface SessionStartRecommendationCliOptions {
  readonly slug: string;
}

export function parseSessionStartRecommendationArgs(
  args: readonly string[],
): SessionStartRecommendationCliOptions {
  let slug: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--slug': {
        const next = args[++i];
        if (next === undefined) throw new Error('--slug requires a value.');
        slug = next;
        break;
      }
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (slug === undefined) {
    throw new Error('--slug is required.');
  }
  return { slug };
}

export async function sessionStartRecommendation(rawArgs: string[]): Promise<void> {
  const opts = parseSessionStartRecommendationArgs(rawArgs);
  const root = repoRoot();
  const cfg = loadConfig(root);
  const journalPath = join(root, cfg.journal.path);
  const prior = readPriorRecommendation({
    journalPath,
    slug: opts.slug,
  });
  process.stdout.write(prior.block);
  process.stdout.write('\n');
}
