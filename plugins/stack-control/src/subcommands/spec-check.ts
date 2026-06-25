// `stackctl spec-check --spec <dir>` (T025).
//
// Reports a Spec Kit spec's AUTHORING state so the define/extend skills know
// what to advance. Read-only; reports, never authors or repairs. Unlike
// execute-check this verb does NOT gate — a partially-authored spec is a valid,
// reportable state (exit 0). The output is a machine-readable presence line so
// a skill can parse it deterministically:
//
//   spec=yes|no plan=yes|no tasks=yes|no
//
// Fail-loud only on the inputs that make a report impossible (Principle V):
// missing flag / absent dir / a file masquerading as a spec dir.

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveSpecDir } from './spec-dir.js';

// Strict arg parsing — mirrors execute-check (AUDIT-20260605-09): the dispatcher
// contract is "no flag silently ignored." Accept ONLY `--spec <value>`; reject a
// missing value, unknown flags, or stray positionals with exit 2.
function parseArgs(args: string[]): { spec: string } {
  let spec: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--spec') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write('spec-check: --spec <dir> required\n');
        process.exit(2);
      }
      spec = value;
      i++; // consume the value
      continue;
    }
    process.stderr.write(
      `spec-check: unexpected argument '${token}' (usage: spec-check --spec <dir>)\n`,
    );
    process.exit(2);
  }
  if (spec === undefined) {
    process.stderr.write('spec-check: --spec <dir> required\n');
    process.exit(2);
  }
  return { spec };
}

export async function runSpecCheck(args: string[]): Promise<void> {
  const { spec } = parseArgs(args);

  const specDir = resolveSpecDir(spec);
  if (!existsSync(specDir)) {
    process.stderr.write(`spec-check: FATAL — spec dir ${spec} not found\n`);
    process.exit(1);
  }
  // A file masquerading as a spec dir must be diagnosed distinctly — not
  // mis-reported as "everything absent."
  if (!statSync(specDir).isDirectory()) {
    process.stderr.write(`spec-check: FATAL — spec path ${spec} is not a directory\n`);
    process.exit(1);
  }

  const present = (name: string): string => (existsSync(join(specDir, name)) ? 'yes' : 'no');
  process.stdout.write(
    `spec=${present('spec.md')} plan=${present('plan.md')} tasks=${present('tasks.md')}\n`,
  );
}
