/**
 * deskwork-cancel — pull an entry off the linear pipeline into Cancelled.
 *
 * Thin wrapper around `cancelEntry` from `@deskwork/core/entry/cancel`.
 * Resolves slug-or-uuid → sidecar UUID and delegates. Refuses Published /
 * Blocked / Cancelled. Records `priorStage` on the sidecar so a later
 * `induct` can return the entry to the pipeline if the cancellation is
 * reversed.
 *
 * `cancel` and `block` are stage-equivalent (both move into off-pipeline
 * stages with priorStage preserved). The distinction is intent: `block`
 * signals "paused, expected to resume"; `cancel` signals "abandoned,
 * resumption is rare".
 *
 * Phase 7 Task 7.2 Step 7.2.6 (graphical-entries): `--cascade` opts
 * the operator into member-cascade behaviour for group entries (entries
 * whose `members[]` is non-empty per Task 7.1.2). Default behaviour
 * (no flag): the group's own stage flips to Cancelled; members are
 * untouched. With `--cascade`: every member is also cancelled
 * (members already off-pipeline are skipped, not refused). The flag
 * is a no-op on non-group entries.
 *
 * Usage:
 *   deskwork cancel <project-root> [--site <slug>] <slug-or-uuid>
 *                                   [--reason "<text>"] [--cascade]
 */

import { readConfig } from '@deskwork/core/config';
import { resolveSite } from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { cancelEntry } from '@deskwork/core/entry/cancel';
import { resolveEntryUuid } from '@deskwork/core/sidecar';
import type { DeskworkConfig } from '@deskwork/core/config';

const KNOWN_FLAGS = ['site', 'reason'] as const;
const BOOLEAN_FLAGS = ['cascade'] as const;

export async function run(argv: string[]): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(argv, KNOWN_FLAGS, BOOLEAN_FLAGS);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), 2);
  }

  const { positional, flags, booleans } = parsed;

  if (positional.length < 2) {
    fail(
      'Usage: deskwork cancel <project-root> [--site <slug>] ' +
        '<slug-or-uuid> [--reason "<text>"] [--cascade]',
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

  const site = resolveSite(config, flags.site);

  let uuid: string;
  try {
    uuid = await resolveEntryUuid(projectRoot, slug);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  const cascade = booleans.has('cascade');
  let result;
  try {
    result = await cancelEntry(projectRoot, {
      uuid,
      ...(flags.reason !== undefined && { reason: flags.reason }),
      ...(cascade && { cascade: true }),
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
    ...(cascade && {
      cascade: true,
      cascadedMembers: result.cascadedMembers ?? [],
      skippedMembers: result.skippedMembers ?? [],
    }),
  });
}
