/**
 * deskwork-induct — teleport an entry to a chosen linear-pipeline stage.
 *
 * Thin wrapper around `inductEntry` from `@deskwork/core/entry/induct`.
 *
 * Primary use: return a Blocked or Cancelled entry to the pipeline. Also
 * works on linear-pipeline entries when the operator wants to non-linearly
 * skip ahead (e.g., Ideas → Drafting) or retreat backwards (e.g.,
 * Drafting → Outlining).
 *
 * Default target stage:
 *   - from Blocked or Cancelled → sidecar.priorStage (if set)
 *   - from Final                → Drafting (revoke Final-status)
 *   - from any other pipeline stage → required (no default; the operator
 *     must pass `--to <Stage>` because backward induction is intentional
 *     and shouldn't have a silent default)
 *
 * `--to <Stage>` overrides the default in all cases. Target must be a
 * linear-pipeline stage (Ideas | Planned | Outlining | Drafting | Final |
 * Published). Refuses targetStage = Blocked or Cancelled (use the
 * dedicated `block` / `cancel` commands for those).
 *
 * Usage:
 *   deskwork induct <project-root> [--site <slug>] <slug-or-uuid> [--to <Stage>] [--reason "<text>"]
 */

import { readConfig } from '@deskwork/core/config';
import { resolveSite } from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { inductEntry } from '@deskwork/core/entry/induct';
import { readSidecar, resolveEntryUuid } from '@deskwork/core/sidecar';
import type { DeskworkConfig } from '@deskwork/core/config';
import type { Stage } from '@deskwork/core/schema/entry';

const KNOWN_FLAGS = ['site', 'to', 'reason'] as const;

const LINEAR_PIPELINE_STAGES: ReadonlySet<Stage> = new Set([
  'Ideas',
  'Planned',
  'Outlining',
  'Drafting',
  'Final',
  'Published',
]);

function isLinearPipelineTarget(s: string): s is Stage {
  return LINEAR_PIPELINE_STAGES.has(s as Stage);
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
      'Usage: deskwork induct <project-root> [--site <slug>] ' +
        '<slug-or-uuid> [--to <Stage>] [--reason "<text>"]',
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

  // Resolve target stage — explicit flag overrides defaults.
  let targetStage: Stage;
  if (flags.to !== undefined) {
    if (!isLinearPipelineTarget(flags.to)) {
      fail(
        `Invalid --to "${flags.to}". Target must be a linear-pipeline stage ` +
          `(Ideas, Planned, Outlining, Drafting, Final, Published). For ` +
          `off-pipeline transitions use 'deskwork block' or 'deskwork cancel'.`,
      );
    }
    targetStage = flags.to;
  } else {
    // Default-stage logic per the skill's input shape.
    let sidecar;
    try {
      sidecar = await readSidecar(projectRoot, uuid);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
    if (sidecar.currentStage === 'Blocked' || sidecar.currentStage === 'Cancelled') {
      if (!sidecar.priorStage) {
        fail(
          `Cannot induct ${slug} without --to: entry is ${sidecar.currentStage} ` +
            `but no priorStage is recorded. Pass --to <Stage> explicitly.`,
        );
      }
      targetStage = sidecar.priorStage;
    } else if (sidecar.currentStage === 'Final') {
      targetStage = 'Drafting';
    } else {
      fail(
        `--to is required when inducting from a linear-pipeline stage ` +
          `(currentStage=${sidecar.currentStage}). Backward / sideways ` +
          `induction must be intentional; pass --to <Stage> explicitly.`,
      );
    }
  }

  let result;
  try {
    result = await inductEntry(projectRoot, {
      uuid,
      targetStage,
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
