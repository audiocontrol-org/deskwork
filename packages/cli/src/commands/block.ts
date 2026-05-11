/**
 * deskwork-block — pull an entry off the linear pipeline into Blocked.
 *
 * Thin wrapper around `blockEntry` from `@deskwork/core/entry/block`. Resolves
 * the slug-or-uuid argument to a sidecar UUID and delegates. Refuses Published
 * / Blocked / Cancelled (the core helper enforces this; the CLI surfaces the
 * error). Records `priorStage` on the sidecar so a later `induct` can return
 * the entry to its prior stage.
 *
 * Usage:
 *   deskwork block <project-root> [--site <slug>] <slug-or-uuid> [--reason "<text>"]
 */

import { readConfig } from '@deskwork/core/config';
import { resolveSite } from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { blockEntry } from '@deskwork/core/entry/block';
import { resolveEntryUuid } from '@deskwork/core/sidecar';
import type { DeskworkConfig } from '@deskwork/core/config';

const KNOWN_FLAGS = ['site', 'reason'] as const;

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
      'Usage: deskwork block <project-root> [--site <slug>] ' +
        '<slug-or-uuid> [--reason "<text>"]',
      2,
    );
  }

  const [rootArg, slug] = positional;
  const projectRoot = absolutize(rootArg);

  let config: DeskworkConfig;
  try {
    config = readConfig(projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  // Validate --site for consistent error shape with sibling commands.
  const site = resolveSite(config, flags.site);

  let uuid: string;
  try {
    uuid = await resolveEntryUuid(projectRoot, slug);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  let result;
  try {
    result = await blockEntry(projectRoot, {
      uuid,
      ...(flags.reason !== undefined && { reason: flags.reason }),
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  emit({
    entryId: result.entryId,
    site,
    slug,
    fromStage: result.fromStage,
    toStage: result.toStage,
    ...(flags.reason !== undefined && { reason: flags.reason }),
  });
}
