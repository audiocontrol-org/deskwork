// `stackctl backlog <subaction> [flags]` (008) — the capture + intake surface
// for the backlog slush pile, per contracts/backlog-cli.md. Unlike inbox/roadmap
// (in-tree document-model), backlog is an EXTERNAL-backend adapter verb: it
// shells to the `backlog.md` CLI via src/backlog/backend.ts. The shell mirrors
// the thin roadmap/inbox verbs: a shared flag scan + per-subaction grammar +
// dispatch. Exit 0 success; 2 usage/parse/validation or a fail-loud BacklogError
// (missing binary / non-zero backend exit) — never a silent no-op (Principle V).
//
// Foundational layer (T008): the shell + read-only `list`. capture (T012),
// import-github (T019), import-slush (T024) wire their handlers in their phases.

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBacklogBackend, BacklogError } from '../backlog/backend.js';
import { failUsage, scanVerbFlags } from './document-verb-shared.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The dir whose `backlog/` tree the binary operates on. Defaults to the
 * plugin-bundled root (the in-repo dogfood, mirroring inbox/roadmap defaulting
 * to the bundled doc); `STACKCTL_BACKLOG_DIR` overrides it — the test seam, and
 * the adopter override until `design:gap/project-relative-doc-discovery` lands.
 */
function backlogRoot(): string {
  return process.env.STACKCTL_BACKLOG_DIR ?? resolve(here, '..', '..');
}

interface Flags {
  readonly apply: boolean;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
}

interface SubactionSpec {
  readonly valueFlags: readonly string[];
  /** Whether `--apply` is meaningful (imports are dry-run by default). */
  readonly apply: boolean;
  readonly positionals: number;
}

const SUBACTION_SPECS: Readonly<Record<string, SubactionSpec>> = {
  capture: { valueFlags: ['type', 'ref', 'body'], apply: false, positionals: 1 },
  list: { valueFlags: [], apply: false, positionals: 0 },
  'import-github': { valueFlags: [], apply: true, positionals: 0 },
  'import-slush': { valueFlags: ['feature'], apply: true, positionals: 0 },
};

const ALL_VALUE_FLAGS: readonly string[] = [
  ...new Set(Object.values(SUBACTION_SPECS).flatMap((s) => s.valueFlags)),
];

/** Scan flags via the shared subaction-verb scanner. backlog has no `--doc`
 * (it is not a document-model verb); the scanner's doc slot is unused. */
function scanFlags(args: readonly string[]): Flags {
  const s = scanVerbFlags('backlog', args, '', ['apply'], ALL_VALUE_FLAGS);
  return { apply: s.booleans.has('apply'), positionals: s.positionals, values: s.values };
}

/** Reject unknown flags, unsupported `--apply`, and extra positionals (exit 2). */
function validateFlags(subaction: string, flags: Flags): void {
  const spec = SUBACTION_SPECS[subaction];
  if (spec === undefined) return; // unknown subaction handled by the dispatch switch.
  const allowed = new Set(spec.valueFlags);
  for (const name of flags.values.keys()) {
    if (!allowed.has(name)) failUsage('backlog', `unknown flag --${name} for '${subaction}'`);
  }
  if (flags.apply && !spec.apply) failUsage('backlog', `--apply is not valid for '${subaction}'`);
  if (flags.positionals.length > spec.positionals) {
    failUsage('backlog', `unexpected positional '${flags.positionals[spec.positionals]!}' for '${subaction}'`);
  }
}

/** Fail-loud if the backlog project marker is absent (Principle V). */
function requireProject(root: string): void {
  if (!existsSync(join(root, 'backlog', 'config.yml'))) {
    failUsage(
      'backlog',
      `no backlog project at ${root} (missing backlog/config.yml) — initialize one or set STACKCTL_BACKLOG_DIR`,
    );
  }
}

/** Read-only: print each item's id + status + type. Never writes. */
function emitList(): void {
  const root = backlogRoot();
  requireProject(root);
  const items = createBacklogBackend({ cwd: root }).list();
  process.stdout.write(`backlog list: ${items.length} item${items.length === 1 ? '' : 's'}\n`);
  for (const it of items) {
    const type = it.type !== undefined ? ` (${it.type})` : '';
    process.stdout.write(`  - ${it.id} [${it.status}]${type} ${it.title}\n`);
  }
}

export async function runBacklogCli(args: string[]): Promise<void> {
  const subaction = args[0];
  if (subaction === undefined || subaction.startsWith('--')) {
    failUsage(
      'backlog',
      'a subaction is required (usage: backlog <capture|list|import-github|import-slush> [flags])',
    );
  }
  const flags = scanFlags(args.slice(1));
  validateFlags(subaction, flags);
  try {
    switch (subaction) {
      case 'list':
        emitList();
        return;
      default:
        failUsage(
          'backlog',
          `unknown subaction '${subaction}' (known: capture, list, import-github, import-slush)`,
        );
    }
  } catch (err) {
    if (err instanceof BacklogError) {
      process.stderr.write(`backlog: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}
