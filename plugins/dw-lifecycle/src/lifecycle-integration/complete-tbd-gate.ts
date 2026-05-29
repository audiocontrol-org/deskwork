// Pre-merge TBD gate for /dw-lifecycle:complete.
//
// Scans the closing feature's workplan for TBD-style markers. Each marker is
// classified as either CLEAN (carries a `[debt: #NNN]` back-link OR an inline
// `(wontfix: <reason>)` clause) or BARE (neither). On any bare TBD, the gate
// refuses and surfaces the locations so the operator can promote them via
// /dw-lifecycle:promote-deferrals.
//
// The operator can override with `--skip-tbd-gate --reason "<text>"`. The
// reason is validated through the substantive-reason validator from
// promote-deferrals (≥40 chars, no gaming phrases). The override reason is
// surfaced for journaling under `### Hygiene override` so the operator's
// rationale lives in the project's permanent record alongside the bare TBDs
// it cleared.

import { existsSync, readFileSync } from 'node:fs';
import { scanSingleWorkplanFile } from '../debt-report/workplan-tbd.js';
import {
  validateSubstantiveReason,
  type SubstantiveReasonValidationResult,
} from '../promote-deferrals/substantive-reason.js';
import type { BareTbdLocation, CompleteGateResult } from './types.js';

// Marker patterns reused from workplan-tbd.ts. We can't import them directly
// (they're file-private constants in that module), but the classification
// here uses the existing scanner's RESULTS, so a single marker rule already
// fires there before we inspect the line. We only need the two
// `is-clean` patterns here.
const DEBT_BACKLINK_PATTERN = /\[debt:\s*#\d+\]/i;
const INLINE_WONTFIX_PATTERN = /\(wontfix:[^)]+\)/i;

export interface ScanForBareTbdsArgs {
  readonly workplanPath: string;
}

export function scanForBareTbds(args: ScanForBareTbdsArgs): readonly BareTbdLocation[] {
  const { workplanPath } = args;
  if (!existsSync(workplanPath)) {
    return [];
  }
  // workplan-tbd's `PROMOTED_RE` already strips `[debt: #NNN]` lines from the
  // sample list — so any sample we see here lacks that back-link. We still
  // re-check the line for the inline-wontfix shape, which workplan-tbd does
  // NOT filter (it's a Phase 6 concept).
  const { samples } = scanSingleWorkplanFile(workplanPath);
  const content = readFileSync(workplanPath, 'utf8');
  const lines = content.split('\n');
  const bare: BareTbdLocation[] = [];
  for (const sample of samples) {
    const idx = sample.lineNumber - 1;
    const line = lines[idx] ?? sample.text;
    if (DEBT_BACKLINK_PATTERN.test(line)) continue;
    if (INLINE_WONTFIX_PATTERN.test(line)) continue;
    bare.push({
      path: workplanPath,
      lineNumber: sample.lineNumber,
      text: sample.text,
    });
  }
  return bare;
}

export class CompleteGateRefusedError extends Error {
  readonly bareTbds: readonly BareTbdLocation[];
  constructor(message: string, bareTbds: readonly BareTbdLocation[]) {
    super(message);
    this.name = 'CompleteGateRefusedError';
    this.bareTbds = bareTbds;
  }
}

export class CompleteGateInvalidOverrideError extends Error {
  readonly validation: SubstantiveReasonValidationResult;
  constructor(validation: SubstantiveReasonValidationResult) {
    super(
      validation.reason ??
        '--skip-tbd-gate --reason "<text>" failed substantive-reason validation.',
    );
    this.name = 'CompleteGateInvalidOverrideError';
    this.validation = validation;
  }
}

export interface RunCompleteGateArgs {
  readonly workplanPath: string;
  readonly skipTbdGate: boolean;
  readonly overrideReason: string | null;
}

export function runCompleteGate(args: RunCompleteGateArgs): CompleteGateResult {
  const { workplanPath, skipTbdGate, overrideReason } = args;
  const bareTbds = scanForBareTbds({ workplanPath });

  if (skipTbdGate) {
    if (overrideReason === null) {
      throw new CompleteGateInvalidOverrideError({
        valid: false,
        reason: '--skip-tbd-gate requires --reason "<substantive text>".',
      });
    }
    const validation = validateSubstantiveReason(overrideReason);
    if (!validation.valid) {
      throw new CompleteGateInvalidOverrideError(validation);
    }
    return {
      bareTbds,
      overrideUsed: true,
      overrideReason,
    };
  }

  if (bareTbds.length > 0) {
    throw new CompleteGateRefusedError(
      formatRefusalMessage(workplanPath, bareTbds),
      bareTbds,
    );
  }

  return {
    bareTbds: [],
    overrideUsed: false,
    overrideReason: null,
  };
}

function formatRefusalMessage(
  workplanPath: string,
  bareTbds: readonly BareTbdLocation[],
): string {
  const lines: string[] = [];
  lines.push(
    `Refusing to complete: ${bareTbds.length} bare TBD marker(s) in ${workplanPath}.`,
  );
  lines.push(
    'Each bare marker lacks both a `[debt: #NNN]` back-link AND an inline `(wontfix: <reason>)` clause.',
  );
  lines.push('');
  for (const loc of bareTbds) {
    lines.push(`  ${loc.path}:${loc.lineNumber}  ${loc.text}`);
  }
  lines.push('');
  lines.push(
    'Run `dw-lifecycle promote-deferrals propose --workplan ' +
      workplanPath +
      '` to promote each marker to a tracked issue, or annotate inline with `(wontfix: <substantive reason ≥40 chars>)`.',
  );
  lines.push(
    'To override (only with operator sign-off), pass `--skip-tbd-gate --reason "<substantive text ≥40 chars>"`.',
  );
  return lines.join('\n');
}

export function formatOverrideJournalEntry(args: {
  readonly slug: string;
  readonly workplanPath: string;
  readonly reason: string;
  readonly bareTbds: readonly BareTbdLocation[];
}): string {
  const { slug, workplanPath, reason, bareTbds } = args;
  const lines: string[] = [];
  lines.push('### Hygiene override');
  lines.push('');
  lines.push(`- Skill: \`/dw-lifecycle:complete\``);
  lines.push(`- Feature slug: ${slug}`);
  lines.push(`- Workplan: ${workplanPath}`);
  lines.push(`- Bare TBDs at override: ${bareTbds.length}`);
  for (const loc of bareTbds) {
    lines.push(`  - ${loc.path}:${loc.lineNumber}  ${loc.text}`);
  }
  lines.push('');
  lines.push(`Override reason:`);
  lines.push('');
  lines.push(reason);
  lines.push('');
  return lines.join('\n');
}
