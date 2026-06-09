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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBacklogBackend, BacklogError } from '../backlog/backend.js';
import { CAPTURE_TYPES, isCaptureType, typeLabelStamp } from '../backlog/mappings.js';
import {
  importGithub,
  parseIssues,
  readGhIssues,
  type GithubIssue,
} from '../backlog/github-import.js';
import {
  failUsage,
  requireMapValue,
  requirePositional,
  scanVerbFlags,
} from './document-verb-shared.js';

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

/** One-move capture (US1): stamp project+type labels, create via the adapter.
 * Does NOT triage — no priority is applied (capture ≠ scope, FR-003). */
function emitCapture(flags: Flags): void {
  const title = requirePositional('backlog', flags.positionals, 'capture requires a <title> positional');
  if (title.trim() === '') failUsage('backlog', 'capture <title> must be non-empty');
  const type = requireMapValue('backlog', flags.values, 'type');
  if (!isCaptureType(type)) {
    failUsage('backlog', `--type must be one of: ${CAPTURE_TYPES.join(', ')}`);
  }
  const root = backlogRoot();
  requireProject(root);
  const ref = flags.values.get('ref');
  const id = createBacklogBackend({ cwd: root }).create({
    title,
    labels: typeLabelStamp(type),
    refs: ref !== undefined ? [ref] : [],
    body: flags.values.get('body'),
  });
  process.stdout.write(`backlog capture: ${id}\n`);
}

/** Resolve open issues for the import: a test seam reads a JSON file (no
 * network); otherwise the real `gh` CLI (read-only). */
function resolveIssues(): GithubIssue[] {
  const file = process.env.STACKCTL_GH_ISSUES_FILE;
  if (file !== undefined) return parseIssues(readFileSync(file, 'utf8'));
  return readGhIssues(process.env.STACKCTL_GH_BIN);
}

/** One-time, idempotent GitHub-issue import (US3). Dry-run unless `--apply`. */
function emitImportGithub(flags: Flags): void {
  const root = backlogRoot();
  requireProject(root);
  const backend = createBacklogBackend({ cwd: root });
  const res = importGithub({ backend, issues: resolveIssues(), apply: flags.apply });
  if (res.applied) {
    process.stdout.write(
      `backlog import-github: created ${res.created.length}, skipped ${res.skipped.length} (already present)\n`,
    );
  } else {
    process.stdout.write(
      `backlog import-github: dry-run — would import ${res.planned.length} issue(s), ${res.skipped.length} already present (use --apply to write)\n`,
    );
    for (const n of res.planned) process.stdout.write(`  - gh-${n}\n`);
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
      case 'capture':
        emitCapture(flags);
        return;
      case 'list':
        emitList();
        return;
      case 'import-github':
        emitImportGithub(flags);
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
