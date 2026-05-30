/**
 * deskwork-induct — teleport an entry to a chosen linear-pipeline stage.
 *
 * Thin wrapper around `inductEntry` from `@deskwork/core/entry/induct`.
 *
 * Primary use: return an off-pipeline entry (Blocked / Cancelled, plus
 * any template-declared cul-de-sac stage like the visual template's
 * `Archived`) to the linear pipeline. Also works on linear-pipeline
 * entries when the operator wants to non-linearly skip ahead (e.g.,
 * editorial Ideas → Drafting) or retreat backwards (e.g., editorial
 * Drafting → Outlining).
 *
 * Default target stage:
 *   - from any template-declared off-pipeline stage → sidecar.priorStage
 *     (if set)
 *   - from the template's pre-terminal linear stage (editorial `Final`,
 *     visual `Approved`) → the stage immediately before it in the
 *     template's `linearStages` (revoke pre-terminal status). NOTE the
 *     CLI delegates that decision to the core verb on operator-explicit
 *     `--to` paths; the CLI only fires the editorial-specific
 *     `Final → Drafting` shortcut for back-compat with pre-Phase-4
 *     callers and the documented skill UX.
 *   - from any other pipeline stage → required (no default; the operator
 *     must pass `--to <Stage>` because backward induction is intentional
 *     and shouldn't have a silent default)
 *
 * `--to <Stage>` overrides the default in all cases. Per Phase 4
 * (graphical-entries) and DESKWORK-STATE-MACHINE.md Commandment II,
 * `--to` is validated against the entry's lane → pipeline template's
 * `linearStages` list — not against an editorial-only constant. The
 * error message names the template's actual allowed stages so visual /
 * feature-doc / qa-plan operators see the right vocabulary in failures.
 *
 * Off-pipeline destinations (Blocked / Cancelled / Archived / etc. —
 * whatever the template lists) are refused at the core verb: callers
 * MUST use `deskwork block` / `deskwork cancel` for those transitions.
 *
 * Usage:
 *   deskwork induct <project-root> [--site <slug>] <slug-or-uuid> [--to <Stage>] [--reason "<text>"]
 */

import { readConfig } from '@deskwork/core/config';
import { resolveSite } from '@deskwork/core/paths';
import { absolutize, emit, fail, parseArgs } from '@deskwork/core/cli-args';
import { inductEntry } from '@deskwork/core/entry/induct';
import { readSidecar, resolveEntryUuid } from '@deskwork/core/sidecar';
import { resolveEntryStrictTemplate } from '@deskwork/core/lanes';
import {
  isLinearPipelineStageInTemplate,
  isOffPipelineStageInTemplate,
} from '@deskwork/core/pipelines';
import type { DeskworkConfig } from '@deskwork/core/config';

const KNOWN_FLAGS = ['site', 'to', 'reason'] as const;

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

  // Read sidecar + resolve the entry's lane → pipeline template up
  // front. The template's `linearStages` / `offPipelineStages` drive
  // both the `--to` validation and the default-stage branches below,
  // replacing the pre-AUDIT-20260530-20 editorial-narrow constants
  // that ignored the entry's actual template.
  let sidecar;
  try {
    sidecar = await readSidecar(projectRoot, uuid);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  let template;
  try {
    template = resolveEntryStrictTemplate(sidecar, projectRoot);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  // Resolve target stage — explicit flag overrides defaults.
  let targetStage: string;
  if (flags.to !== undefined) {
    if (!isLinearPipelineStageInTemplate(template, flags.to)) {
      const allowed = template.linearStages.join(', ');
      if (isOffPipelineStageInTemplate(template, flags.to)) {
        fail(
          `Invalid --to "${flags.to}": that is an off-pipeline stage of ` +
            `pipeline "${template.id}". For off-pipeline transitions use ` +
            `'deskwork block' or 'deskwork cancel'. ` +
            `Allowed --to values (linear stages of "${template.id}"): ${allowed}.`,
        );
      }
      fail(
        `Invalid --to "${flags.to}" for pipeline "${template.id}". ` +
          `Target must be a linear-pipeline stage of the entry's template. ` +
          `Allowed values: ${allowed}.`,
      );
    }
    targetStage = flags.to;
  } else {
    // Default-stage logic per the skill's input shape. Template-aware:
    // any off-pipeline stage (Blocked / Cancelled / template-extra like
    // visual's Archived) routes through priorStage. The editorial
    // back-compat shortcut for `Final → Drafting` is kept as a special
    // case because the original skill UX documented it explicitly.
    if (isOffPipelineStageInTemplate(template, sidecar.currentStage)) {
      if (!sidecar.priorStage) {
        fail(
          `Cannot induct ${slug} without --to: entry is ${sidecar.currentStage} ` +
            `but no priorStage is recorded. Pass --to <Stage> explicitly.`,
        );
      }
      targetStage = sidecar.priorStage;
    } else if (sidecar.currentStage === 'Final') {
      // Editorial back-compat: the documented skill UX defines
      // `Final → Drafting` as the no-`--to` default to revoke
      // Final-status. The shortcut fires only when the entry's
      // currentStage is literally `Final` (the editorial pipeline's
      // pre-terminal stage). Non-editorial templates do not have a
      // `Final` stage, so they never enter this branch and fall
      // through to the "explicit --to required" failure below — same
      // behavior as any other linear stage outside the off-pipeline
      // shortcut, consistent with "backward induction must be
      // intentional".
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
