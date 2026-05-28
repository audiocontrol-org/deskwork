// Subcommand layer for the /dw-lifecycle:complete pre-merge TBD gate.
//
// Runs the bare-TBD scanner; refuses on any bare TBD with no `[debt: #NNN]`
// back-link AND no inline `(wontfix: <reason>)` clause. Accepts
// `--skip-tbd-gate --reason "<text>"` to override, validated through the
// substantive-reason validator.
//
// On a successful pass, prints `OK` to stdout and exits 0. The SKILL.md
// proceeds with the doc-move + ROADMAP + gh-close steps. On a refusal,
// prints the bare-TBD locations to stderr and exits 2. On an invalid
// override reason, prints the validator's rejection to stderr and exits 2.
//
// Argv:
//   --workplan <path>                    (required; absolute or repo-relative)
//   --slug <feature-slug>                (required; for journaling)
//   --skip-tbd-gate                      (optional; gate-override flag)
//   --reason "<text>"                    (required when --skip-tbd-gate is set)
//   --journal-override-file <path>       (optional; if set + override used,
//                                         the override entry markdown is
//                                         written to this path so the SKILL
//                                         can append it via journal-append)

import { isAbsolute, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { repoRoot } from '../repo.js';
import {
  CompleteGateInvalidOverrideError,
  CompleteGateRefusedError,
  formatOverrideJournalEntry,
  runCompleteGate,
} from '../lifecycle-integration/complete-tbd-gate.js';

export interface CompleteGateCliOptions {
  readonly workplan: string;
  readonly slug: string;
  readonly skipTbdGate: boolean;
  readonly overrideReason: string | null;
  readonly journalOverrideFile: string | null;
}

export function parseCompleteGateArgs(
  args: readonly string[],
): CompleteGateCliOptions {
  let workplan: string | undefined;
  let slug: string | undefined;
  let skipTbdGate = false;
  let overrideReason: string | null = null;
  let journalOverrideFile: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    switch (arg) {
      case '--workplan': {
        const next = args[++i];
        if (next === undefined) throw new Error('--workplan requires a value.');
        workplan = next;
        break;
      }
      case '--slug': {
        const next = args[++i];
        if (next === undefined) throw new Error('--slug requires a value.');
        slug = next;
        break;
      }
      case '--skip-tbd-gate':
        skipTbdGate = true;
        break;
      case '--reason': {
        const next = args[++i];
        if (next === undefined) throw new Error('--reason requires a value.');
        overrideReason = next;
        break;
      }
      case '--journal-override-file': {
        const next = args[++i];
        if (next === undefined) {
          throw new Error('--journal-override-file requires a value.');
        }
        journalOverrideFile = next;
        break;
      }
      default:
        throw new Error(`Unknown flag: ${arg}`);
    }
  }
  if (workplan === undefined) {
    throw new Error('--workplan is required.');
  }
  if (slug === undefined) {
    throw new Error('--slug is required.');
  }
  return {
    workplan,
    slug,
    skipTbdGate,
    overrideReason,
    journalOverrideFile,
  };
}

export async function completeGate(rawArgs: string[]): Promise<void> {
  const opts = parseCompleteGateArgs(rawArgs);
  const root = repoRoot();
  const workplanPath = isAbsolute(opts.workplan)
    ? opts.workplan
    : resolve(root, opts.workplan);
  try {
    const result = runCompleteGate({
      workplanPath,
      skipTbdGate: opts.skipTbdGate,
      overrideReason: opts.overrideReason,
    });
    if (result.overrideUsed && opts.journalOverrideFile !== null) {
      const entry = formatOverrideJournalEntry({
        slug: opts.slug,
        workplanPath,
        reason: result.overrideReason ?? '',
        bareTbds: result.bareTbds,
      });
      writeFileSync(opts.journalOverrideFile, entry, 'utf8');
    }
    process.stdout.write('OK\n');
  } catch (err) {
    if (err instanceof CompleteGateRefusedError) {
      process.stderr.write(err.message);
      process.stderr.write('\n');
      process.exit(2);
    }
    if (err instanceof CompleteGateInvalidOverrideError) {
      process.stderr.write(err.message);
      process.stderr.write('\n');
      process.exit(2);
    }
    throw err;
  }
}
