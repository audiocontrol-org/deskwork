// `stackctl resolve-tiers --spec <dir> [--json]` (033 T014; contracts/resolve-tiers-verb.md).
//
// The testable, fail-loud PRE-DISPATCH tier-resolution gate. Read-only computation:
// parse the spec's tasks.md `[tier:]` tags, resolve each against the installation's
// tier_map + the accepted-model set, and emit a per-task {id, tierLabel, model}
// resolution — OR fail loud with the COMPLETE tier-error set (FR-006), exiting 1 with
// NO partial resolution. The `/stack-control:execute` skill runs this before dispatching
// any subagent and uses the output to set each subagent's explicit model.
//
// Mirrors the execute-check verb: strict arg parse (no flag silently ignored), fail-loud,
// mutates no installation state.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACCEPTED_MODELS } from '../execute/accepted-models.js';
import { parseTieredTasks } from '../execute/tasks-tier-parser.js';
import { resolveTasks } from '../execute/tier-resolution.js';
import { findInstallation } from '../config/installation.js';
import { resolveSpecDir } from './spec-dir.js';

interface Args {
  readonly spec: string;
  readonly json: boolean;
}

// Strict arg parsing: accept ONLY `--spec <value>` and `--json`; reject a missing
// value, unknown flags, or stray positionals with exit 2 (the dispatcher contract —
// no flag silently ignored).
function parseArgs(args: string[]): Args {
  let spec: string | undefined;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === undefined) continue;
    if (token === '--spec') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('--')) {
        process.stderr.write('resolve-tiers: --spec <dir> required\n');
        process.exit(2);
      }
      spec = value;
      i++; // consume the value
      continue;
    }
    if (token === '--json') {
      json = true;
      continue;
    }
    process.stderr.write(
      `resolve-tiers: unexpected argument '${token}' (usage: resolve-tiers --spec <dir> [--json])\n`,
    );
    process.exit(2);
  }
  if (spec === undefined) {
    process.stderr.write('resolve-tiers: --spec <dir> required\n');
    process.exit(2);
  }
  return { spec, json };
}

export async function runResolveTiers(args: string[]): Promise<void> {
  const { spec } = parseArgs(args);

  const specDir = resolveSpecDir(spec);
  if (!existsSync(specDir)) {
    process.stderr.write(`resolve-tiers: FATAL — spec dir ${spec} not found\n`);
    process.exit(1);
  }
  if (!statSync(specDir).isDirectory()) {
    process.stderr.write(`resolve-tiers: FATAL — spec path ${spec} is not a directory\n`);
    process.exit(1);
  }
  const tasksPath = join(specDir, 'tasks.md');
  if (!existsSync(tasksPath)) {
    process.stderr.write(
      `resolve-tiers: FATAL — ${join(spec, 'tasks.md')} missing; nothing to resolve (run /speckit-tasks first)\n`,
    );
    process.exit(1);
  }

  // The tier_map comes from the installation ENCLOSING the spec dir. An absent
  // installation (or absent tier_map) is not itself an error here — it becomes a
  // per-task no-map error below if any task declares a tier (FR-008).
  const installation = findInstallation(specDir);
  const tierMap = installation?.config.tierMap;

  const content = readFileSync(tasksPath, 'utf8');
  const { tasks, errors: parseErrors } = parseTieredTasks(content);
  const { resolved, errors: tierErrors } = resolveTasks(tasks, tierMap, ACCEPTED_MODELS);

  if (parseErrors.length > 0 || tierErrors.length > 0) {
    for (const e of parseErrors) process.stderr.write(`resolve-tiers: ${e.category}: ${e.message}\n`);
    for (const e of tierErrors) process.stderr.write(`resolve-tiers: ${e.category}: ${e.message}\n`);
    process.exit(1);
  }

  // Always JSON (the `--json` flag is reserved for a future human summary mode).
  process.stdout.write(`${JSON.stringify({ specDir: spec, tasks: resolved })}\n`);
}
