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
import { join } from 'node:path';
import { createBacklogBackend, BacklogError, BACKLOG_DONE_STATUS } from '../backlog/backend.js';
import { resolveInstallationBacklog } from '../backlog/root.js';
import { InstallationError } from '../config/errors.js';
import { scaffoldKey } from '../setup/scaffold.js';
import { CAPTURE_TYPES, isCaptureType, typeLabelStamp } from '../backlog/mappings.js';
import { parseTarget, allowsBatch, TargetRefError } from '../backlog/promote-targets.js';
import {
  promote,
  unpromote,
  PromoteAlreadyPromotedError,
  PromoteDuplicateIdError,
  PromoteItemMissingError,
  PromotePartialWriteError,
  UnpromoteNotPromotedError,
  type PromoteResult,
} from '../backlog/promote.js';
import {
  importGithub,
  parseIssues,
  readGhIssues,
  type GithubIssue,
} from '../backlog/github-import.js';
import { backfillSlush } from '../backlog/slush-migrate.js';
import { resolveFeatureRoot } from '../scope-discovery/util/feature-root.js';
import { atomicWriteFile } from '../scope-discovery/util/atomic-write-file.js';
import {
  failUsage,
  requireMapValue,
  requirePositional,
  scanVerbFlags,
  validateSubactionFlags,
  type SubactionGrammar,
} from './document-verb-shared.js';

interface Flags {
  readonly apply: boolean;
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
}

export const SUBACTION_SPECS: Readonly<Record<string, SubactionGrammar>> = {
  capture: { valueFlags: ['type', 'ref', 'body'], apply: false, positionals: 1 },
  list: { valueFlags: [], apply: false, positionals: 0 },
  'import-github': { valueFlags: [], apply: true, positionals: 0 },
  'import-slush': { valueFlags: ['feature'], apply: true, positionals: 0 },
  promote: { valueFlags: ['to'], apply: true, positionals: 1, unboundedPositionals: true },
  // 028 US2 — terminal lifecycle verbs (all mutating; BACKLOG_MEDIATION).
  done: { valueFlags: ['reason'], apply: true, positionals: 1 },
  archive: { valueFlags: [], apply: true, positionals: 1 },
  unpromote: { valueFlags: [], apply: true, positionals: 1 },
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

/** Fail-loud if the backlog project marker is absent (Principle V). */
function requireProject(root: string): void {
  if (!existsSync(join(root, 'backlog', 'config.yml'))) {
    failUsage(
      'backlog',
      `no backlog project at ${root} (missing backlog/config.yml) — initialize one or set STACKCTL_BACKLOG_DIR`,
    );
  }
}

/**
 * Resolve the backlog root for a verb, honoring the STACKCTL_BACKLOG_DIR seam,
 * else the enclosing installation (009 T017/T019). On the installation path, a
 * missing store is auto-on-first-use scaffolded + announced (FR-015/016). On the
 * seam path a missing store still fails loud (exit 2) — the seam points at a
 * specific dir the operator manages, not an installation to bootstrap. Outside any
 * installation with no seam, resolveInstallation fails loud directing to setup.
 */
function ensureBacklogProject(): string {
  const seam = process.env.STACKCTL_BACKLOG_DIR;
  if (seam !== undefined && seam !== '') {
    requireProject(seam);
    return seam;
  }
  const { storeDir, root, resolved } = resolveInstallationBacklog();
  if (!existsSync(join(storeDir, 'config.yml'))) {
    scaffoldKey('backlog', resolved);
    process.stdout.write(
      `backlog: scaffolded missing backlog store at ${storeDir} ` +
        `(auto-on-first-use; run \`stackctl setup\` for the full installation)\n`,
    );
  }
  return root;
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
  const root = ensureBacklogProject();
  const ref = flags.values.get('ref');
  const backend = createBacklogBackend({ cwd: root });
  // Dedupe by --ref (028 FR-013, TASK-38): when --ref matches an existing item,
  // report the existing id rather than silently creating a duplicate. The
  // backend's exists() fails loud on an undecidable-negative (malformed store),
  // mapped to exit 2 by the dispatcher — never a duplicate-on-doubt.
  if (ref !== undefined && backend.exists(ref)) {
    const existing = backend.list().find((i) => i.refs.includes(ref))!;
    process.stdout.write(`backlog capture: ${existing.id} (already captured for ref ${ref})\n`);
    return;
  }
  // Filename safety (028 FR-013, TASK-299): a long title is slugify+truncated to
  // a safe filename inside the backend while the FULL title is preserved.
  const id = backend.create({
    title,
    labels: typeLabelStamp(type),
    refs: ref !== undefined ? [ref] : [],
    body: flags.values.get('body'),
  });
  process.stdout.write(`backlog capture: ${id}\n`);
}

/**
 * Terminal closure (028 B1, FR-010): the ONE closure mechanism. Dry-run by
 * default; `--apply` routes through `backend.close` (status → `Done`). Missing /
 * empty `--reason` → exit 2 (usage). An unknown id surfaces as a BacklogError
 * from backend.close → exit 1 (handled HERE so the generic BacklogError→2
 * dispatcher mapping does not mask the runtime exit-1).
 */
function emitDone(flags: Flags): void {
  const id = requirePositional('backlog', flags.positionals, 'done requires an <id> positional');
  const reason = requireMapValue('backlog', flags.values, 'reason');
  if (reason.trim() === '') failUsage('backlog', '--reason <reason> must be non-empty');
  const backend = createBacklogBackend({ cwd: ensureBacklogProject() });
  // Verify the item exists BEFORE the dry-run message — otherwise the default
  // path reports a false "would close" for an unknown id (AUDIT-BARRAGE-codex-01,
  // Phase 4). Unknown id → exit 1, matching the --apply backend.close behavior +
  // the contract (and consistent with archive/unpromote, which resolve first).
  if (backend.list().find((i) => i.id === id) === undefined) {
    process.stderr.write(`backlog: no item '${id}'\n`);
    process.exit(1);
  }
  if (!flags.apply) {
    process.stdout.write(
      `backlog done: dry-run — would close ${id} (reason: ${reason}) (use --apply to write)\n`,
    );
    return;
  }
  try {
    backend.close(id, reason);
  } catch (err) {
    if (err instanceof BacklogError) {
      process.stderr.write(`backlog: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  process.stdout.write(`backlog done: closed ${id} (reason: ${reason})\n`);
}

/**
 * Preserve-not-delete archive (028 B2, FR-011): relocate a terminal (`Done`)
 * item OUT of the live store while keeping it readable. Dry-run by default.
 * Archiving a non-terminal item → exit 2 (usage). An unknown id surfaces as a
 * BacklogError from backend.archive → exit 1.
 */
function emitArchive(flags: Flags): void {
  const id = requirePositional('backlog', flags.positionals, 'archive requires an <id> positional');
  const backend = createBacklogBackend({ cwd: ensureBacklogProject() });
  const item = backend.list().find((i) => i.id === id);
  // Unknown id → exit 1 (fail-loud runtime), not exit 2.
  if (item === undefined) {
    process.stderr.write(`backlog: backlog item '${id}' not found — cannot archive\n`);
    process.exit(1);
  }
  // Non-terminal archive → exit 2 (usage: archive a done item, not an open one).
  if (item.status !== BACKLOG_DONE_STATUS) {
    failUsage(
      'backlog',
      `cannot archive '${id}' — status is '${item.status}', not '${BACKLOG_DONE_STATUS}' (close it first with \`backlog done\`)`,
    );
  }
  if (!flags.apply) {
    process.stdout.write(`backlog archive: dry-run — would archive ${id} (use --apply to write)\n`);
    return;
  }
  try {
    backend.archive(id);
  } catch (err) {
    if (err instanceof BacklogError) {
      process.stderr.write(`backlog: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  process.stdout.write(`backlog archive: archived ${id} (preserved)\n`);
}

/**
 * Remove the promotion linkage (028 B3, FR-012) — the inverse of `promote`.
 * Dry-run by default. An item with no promotion linkage → exit 2 (usage). An
 * unknown id → exit 1 (runtime fail-loud). The promote-specific exit mapping is
 * handled HERE so the generic BacklogError→2 dispatcher mapping does not mask a
 * runtime exit-1.
 */
function emitUnpromote(flags: Flags): void {
  const id = requirePositional('backlog', flags.positionals, 'unpromote requires an <id> positional');
  const backend = createBacklogBackend({ cwd: ensureBacklogProject() });
  try {
    const res = unpromote({ id, apply: flags.apply, backend });
    if (res.applied) {
      process.stdout.write(`backlog unpromote: removed promotion linkage on ${id}\n`);
    } else {
      process.stdout.write(
        `backlog unpromote: dry-run — would remove promotion linkage on ${id} (use --apply to write)\n`,
      );
    }
  } catch (err) {
    // Nothing-to-unpromote → exit 2 (usage).
    if (err instanceof UnpromoteNotPromotedError) {
      process.stderr.write(`backlog: ${err.message}\n`);
      process.exit(2);
    }
    // Unknown item / backend fail-loud → exit 1.
    if (err instanceof PromoteItemMissingError || err instanceof BacklogError) {
      process.stderr.write(`backlog: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
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
  const root = ensureBacklogProject();
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

/** Resolve the feature's audit-log: a test seam reads/writes a file directly;
 * otherwise resolve the feature root via the shared layout-aware helper
 * (specs/<NNN>-<slug> or docs/<v>/001-IN-PROGRESS/<slug>) and read its
 * audit-log.md. */
async function resolveAuditLog(featureSlug: string): Promise<{ path: string; text: string }> {
  const seam = process.env.STACKCTL_AUDIT_LOG_FILE;
  if (seam !== undefined) {
    if (!existsSync(seam)) failUsage('backlog', `audit-log file not found: ${seam}`);
    return { path: seam, text: readFileSync(seam, 'utf8') };
  }
  const cwd = process.cwd();
  const { root } = await resolveFeatureRoot({ repoRoot: cwd, slug: featureSlug });
  if (root === undefined) failUsage('backlog', `feature '${featureSlug}' not found under ${join(cwd, 'specs')}/<NNN>-${featureSlug} (speckit) or ${join(cwd, 'docs')}/*/001-IN-PROGRESS/${featureSlug} (legacy-docs)`);
  const path = join(root, 'audit-log.md');
  if (!existsSync(path)) failUsage('backlog', `audit-log not found at ${path}`);
  return { path, text: readFileSync(path, 'utf8') };
}

/** One-time backfill of acknowledged-slush-pile entries into the pile (US4). */
async function emitImportSlush(flags: Flags): Promise<void> {
  const root = ensureBacklogProject();
  const featureSlug = requireMapValue('backlog', flags.values, 'feature');
  const { path, text } = await resolveAuditLog(featureSlug);
  const backend = createBacklogBackend({ cwd: root });
  const res = backfillSlush({ auditLogText: text, backend, featureSlug, apply: flags.apply });
  if (flags.apply && res.result !== undefined) {
    await atomicWriteFile(path, res.newAuditLogText);
    process.stdout.write(
      `backlog import-slush: migrated ${res.result.migrated.length}, skipped ${res.result.skipped.length} (already migrated)\n`,
    );
  } else {
    process.stdout.write(
      `backlog import-slush: dry-run — would migrate ${res.planned.length} parked finding(s) (use --apply to write)\n`,
    );
    for (const id of res.planned) process.stdout.write(`  - ${id}\n`);
  }
}

/** Render the promote outcome (dry-run vs apply) + the pending-create advisory. */
function reportPromote(res: PromoteResult): void {
  const ids = res.recorded.join(', ');
  if (res.applied) {
    process.stdout.write(`backlog promote: recorded ${ids} → ${res.targetRef}\n`);
  } else {
    process.stdout.write(
      `backlog promote: dry-run — would record ${ids} → ${res.targetRef} (use --apply to write)\n`,
    );
  }
  if (res.pendingCreate !== undefined) {
    process.stdout.write(
      `  - note: target ${res.pendingCreate} does not yet exist — create it as a separate step (record-only)\n`,
    );
  }
}

/**
 * Promote (US1/US2): record the graduation linkage on one or N backlog items
 * (record-only, FR-004). Usage faults (missing --to, malformed ref, multi-id on
 * a non-tasks target, no id) → exit 2 via failUsage BEFORE any store access.
 * Runtime fail-loud (missing item, malformed store) → exit 1; the re-promotion
 * guard → exit 2. The promote-specific exit mapping is handled HERE so the
 * generic BacklogError→2 dispatcher mapping does not mask a runtime exit-1.
 */
function emitPromote(flags: Flags): void {
  const ids = flags.positionals;
  if (ids.length === 0) failUsage('backlog', 'promote requires at least one <item-id> positional');
  const to = requireMapValue('backlog', flags.values, 'to');
  let target;
  try {
    target = parseTarget(to);
  } catch (err) {
    if (err instanceof TargetRefError) failUsage('backlog', err.message);
    throw err;
  }
  if (ids.length > 1 && !allowsBatch(target.kind)) {
    failUsage(
      'backlog',
      `multiple item-ids are only valid for a tasks: target (got ${target.kind}:) — batch one feature's tasks.md`,
    );
  }
  const root = ensureBacklogProject();
  const backend = createBacklogBackend({ cwd: root });
  try {
    reportPromote(promote({ ids, target, apply: flags.apply, backend, cwd: process.cwd() }));
  } catch (err) {
    // Usage-class refusals (preflight, zero write) → exit 2.
    if (err instanceof PromoteAlreadyPromotedError || err instanceof PromoteDuplicateIdError) {
      process.stderr.write(`backlog: ${err.message}\n`);
      process.exit(2);
    }
    // Runtime fail-loud → exit 1. PromotePartialWriteError already names the
    // ids that landed so the operator can retry the remainder.
    if (
      err instanceof PromoteItemMissingError ||
      err instanceof PromotePartialWriteError ||
      err instanceof BacklogError
    ) {
      process.stderr.write(`backlog: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

/** Read-only: print each item's id + status + type. Never writes. */
function emitList(): void {
  const root = ensureBacklogProject();
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
      'a subaction is required (usage: backlog <capture|list|import-github|import-slush|promote|done|archive|unpromote> [flags])',
    );
  }
  const flags = scanFlags(args.slice(1));
  validateSubactionFlags('backlog', subaction, SUBACTION_SPECS[subaction], flags);
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
      case 'import-slush':
        await emitImportSlush(flags);
        return;
      case 'promote':
        emitPromote(flags);
        return;
      case 'done':
        emitDone(flags);
        return;
      case 'archive':
        emitArchive(flags);
        return;
      case 'unpromote':
        emitUnpromote(flags);
        return;
      default:
        failUsage(
          'backlog',
          `unknown subaction '${subaction}' (known: capture, list, import-github, import-slush, promote, done, archive, unpromote)`,
        );
    }
  } catch (err) {
    if (err instanceof InstallationError) {
      // specs/installation-isolation US2: the no-installation refusal uses
      // the uniform wording class (`<verb>: FATAL — …`); other installation
      // errors keep their existing wording + codes (frozen contracts).
      const prefix = err.code === 'not-found' ? 'FATAL — ' : '';
      process.stderr.write(`backlog: ${prefix}${err.message}\n`);
      process.exit(err.code === 'escape' || err.code === 'collision' ? 2 : 1);
    }
    if (err instanceof BacklogError) {
      process.stderr.write(`backlog: ${err.message}\n`);
      process.exit(2);
    }
    throw err; // unexpected → dispatcher exits 1
  }
}
