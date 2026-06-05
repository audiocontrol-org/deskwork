// `stackctl execute-check --spec <dir>` (T017).
//
// Validates that a Spec Kit spec directory is RUNNABLE for native
// /speckit-implement. Read-only; never authors or repairs. Fail-loud
// (FR-008 / Principle V / VR-1): a non-runnable spec NEVER exits 0 and the
// error names the missing artifact — no fabricated "runnable" verdict.
//
// "Runnable" is pinned (A1) to: tasks.md present in the spec dir. spec.md +
// plan.md are assumed already present from the upstream Spec Kit chain; the
// gating artifact is tasks.md (what /speckit-tasks produces).

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

function parseSpecFlag(args: string[]): string | undefined {
  const i = args.indexOf('--spec');
  if (i === -1) return undefined;
  const value = args[i + 1];
  if (value === undefined || value.startsWith('--')) return undefined;
  return value;
}

export async function runExecuteCheck(args: string[]): Promise<void> {
  const spec = parseSpecFlag(args);
  if (spec === undefined) {
    process.stderr.write('execute-check: --spec <dir> required\n');
    process.exit(2);
  }

  const specDir = resolve(spec);
  if (!existsSync(specDir)) {
    process.stderr.write(`execute-check: FATAL — spec dir ${spec} not found\n`);
    process.exit(1);
  }

  const tasks = join(specDir, 'tasks.md');
  if (!existsSync(tasks)) {
    process.stderr.write(
      `execute-check: FATAL — ${join(spec, 'tasks.md')} missing; ` +
        `spec not runnable (run /speckit-tasks first)\n`,
    );
    process.exit(1);
  }

  process.stdout.write('runnable\n');
}
