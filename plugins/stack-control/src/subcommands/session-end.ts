// 011 T021 — `stackctl session-end` (capture-only close). Assembles the journal
// entry (auto-mechanical + empty narrative slots), captures surfaced tooling
// friction, runs the advisory clone-snapshot, surfaces progressed backlog items
// (evidence; 0 status transitions), and commits + pushes the doc changes. No
// refuse-to-end gates (capture-only posture, Clarification OQ-2); never queries
// GitHub (SC-006). See contracts/session-end-cli.md.
//
// Exit codes: 0 captured + committed (+pushed unless --no-push); 1 fail-loud
// (outside an installation / unwritable working file); 2 usage; 3 committed
// locally but the push failed (record is safe).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { resolveInstallation } from '../config/installation.js';
import { InstallationError } from '../config/errors.js';
import type { Installation } from '../config/types.js';
import { createBacklogBackend } from '../backlog/backend.js';
import { sessionBoundary } from '../session/git.js';
import { buildJournalEntry } from '../session/journal.js';
import { progressedBacklog, type BacklogItemRef } from '../session/progressed-backlog.js';
import { runClose, readJournalTemplate, type CloseResult } from '../session/close.js';

interface EndFlags {
  readonly at: string | null;
  readonly since: string | null;
  readonly noPush: boolean;
  readonly json: boolean;
  readonly friction: readonly string[];
}

function usage(message: string): never {
  process.stderr.write(`session-end: ${message}\n`);
  process.stderr.write(
    'usage: stackctl session-end [--at <dir>] [--since <sha>] [--no-push] [--friction <text>]... [--json]\n',
  );
  process.exit(2);
}

function parseFlags(args: readonly string[]): EndFlags {
  let at: string | null = null;
  let since: string | null = null;
  let noPush = false;
  let json = false;
  const friction: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const takeValue = (flag: string): string => {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('-')) usage(`${flag} requires a value`);
      i++;
      return v;
    };
    if (arg === '--no-push') noPush = true;
    else if (arg === '--json') json = true;
    else if (arg === '--at') at = takeValue('--at');
    else if (arg.startsWith('--at=')) at = arg.slice('--at='.length);
    else if (arg === '--since') since = takeValue('--since');
    else if (arg.startsWith('--since=')) since = arg.slice('--since='.length);
    else if (arg === '--friction') friction.push(takeValue('--friction'));
    else if (arg.startsWith('--friction=')) friction.push(arg.slice('--friction='.length));
    else usage(`unexpected argument '${arg}'`);
  }
  return { at, since, noPush, json, friction };
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8' }).trim();
}

/** Insert the new entry newest-first: right after the journal's `---` preamble
 * separator when present, else prepended. Append-only — never rewrites history. */
function appendJournalEntry(path: string, entry: string): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '# Development Notes\n\n---\n';
  const marker = '\n---\n';
  const idx = existing.indexOf(marker);
  const body = entry.trimEnd() + '\n';
  let next: string;
  if (idx >= 0) {
    const head = existing.slice(0, idx + marker.length);
    const tail = existing.slice(idx + marker.length).replace(/^\n+/, '');
    next = `${head}\n${body}${tail.length > 0 ? `\n${tail}` : ''}`;
  } else {
    next = `${body}\n${existing}`;
  }
  writeFileSync(path, next);
}

function openBacklog(installation: Installation): readonly BacklogItemRef[] {
  return createBacklogBackend({ cwd: dirname(installation.resolved.backlog) })
    .list()
    .map((i) => ({ id: i.id, title: i.title, status: i.status }));
}

/** The git repository toplevel (the base both `status --porcelain` paths and
 * pathspecs must share). Falls back to `cwd` when not in a git repo — the commit
 * step then fails loud as before. H1: installation root need not be the git root. */
function gitToplevel(cwd: string): string {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']);
  } catch {
    return cwd;
  }
}

/** Parse one `git status --porcelain` line to its path, handling the rename
 * form (`R  old -> new`). Returns the (possibly renamed-to) path. */
function porcelainPath(line: string): string {
  const rest = line.slice(3).trim();
  const arrow = rest.indexOf(' -> ');
  return (arrow >= 0 ? rest.slice(arrow + 4) : rest).trim();
}

/** Warn (not block) when uncommitted changes exist outside the doc paths. Paths
 * are compared against the git toplevel (porcelain's base), so a nested
 * installation does not falsely flag its own doc files (H1). */
function uncommittedNonDocWarning(gitRoot: string, docRel: readonly string[]): string | undefined {
  // Read porcelain UNTRIMMED — trimming would strip the leading status-column
  // space of the first line (` M path` → `M path`), shifting slice(3).
  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: gitRoot,
    encoding: 'utf8',
  });
  if (status.length === 0) return undefined;
  const docSet = new Set(docRel);
  const nonDoc = status
    .split('\n')
    .filter((l) => l.length > 0)
    .map(porcelainPath)
    .filter((p) => p.length > 0 && !docSet.has(p));
  if (nonDoc.length === 0) return undefined;
  return `uncommitted non-doc changes NOT included in the session-end commit: ${nonDoc.join(', ')}`;
}

/** Commit only the doc paths (pathspec commit → doc-only, FR-011), toplevel-relative. */
function commitDocs(gitRoot: string, docRel: readonly string[]): string {
  git(gitRoot, ['add', '--', ...docRel]);
  git(gitRoot, ['commit', '-m', 'docs(session): session-end record', '--', ...docRel]);
  return git(gitRoot, ['rev-parse', 'HEAD']);
}

/** Push with a bounded retry. Returns the push error message on failure. Retries
 * immediately (no spawned `sleep` — that is non-portable and could escape the
 * try, crashing the documented exit-3 contract). */
function pushDocs(gitRoot: string): string | null {
  const attempts = 3;
  let lastErr = 'push failed';
  for (let i = 0; i < attempts; i++) {
    try {
      execFileSync('git', ['push'], { cwd: gitRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return null;
    } catch (err) {
      lastErr = err instanceof Error ? err.message.split('\n')[0]! : String(err);
    }
  }
  return lastErr;
}

interface SessionEndReport {
  readonly journalEntryPath: string;
  readonly toolingFrictionCaptured: boolean;
  readonly cloneSnapshot: CloseResult['cloneSnapshot'];
  readonly backlogProgressed: readonly BacklogItemRef[];
  readonly commit: { readonly sha: string; readonly pushed: boolean; readonly pushError?: string };
  readonly uncommittedNonDocWarning?: string;
}

function render(report: SessionEndReport): string {
  const lines: string[] = ['stack-control session-end'];
  lines.push(`  journal entry: ${report.journalEntryPath}`);
  lines.push(`  tooling friction captured: ${report.toolingFrictionCaptured ? 'yes' : 'none'}`);
  lines.push(
    report.cloneSnapshot.ran
      ? `  clone snapshot: ${report.cloneSnapshot.newDuplication} group(s)`
      : `  clone snapshot: skipped (${report.cloneSnapshot.skipped})`,
  );
  lines.push(`  backlog progressed (${report.backlogProgressed.length}):`);
  for (const b of report.backlogProgressed) lines.push(`    - ${b.id} [${b.status}] ${b.title}`);
  lines.push(`  commit: ${report.commit.sha}`);
  lines.push(
    report.commit.pushed
      ? '  pushed: yes'
      : `  pushed: NO — ${report.commit.pushError ?? 'skipped'} (record committed locally)`,
  );
  if (report.uncommittedNonDocWarning !== undefined) {
    lines.push(`  WARNING: ${report.uncommittedNonDocWarning}`);
  }
  return lines.join('\n') + '\n';
}

export async function runSessionEndCli(args: string[]): Promise<void> {
  const flags = parseFlags(args);

  let installation: Installation;
  try {
    installation = resolveInstallation(flags.at ?? process.cwd());
  } catch (err) {
    if (err instanceof InstallationError) {
      process.stderr.write(`session-end: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const cwd = installation.root;
  const date = new Date().toISOString().slice(0, 10);
  const boundary = sessionBoundary(cwd, flags.since !== null ? { since: flags.since } : {});

  const progressed = progressedBacklog({ cwd, boundary, items: openBacklog(installation) });
  const template = readJournalTemplate(cwd) ?? undefined;
  const entry = buildJournalEntry({ cwd, boundary, backlogTouched: progressed, date, template });
  appendJournalEntry(installation.resolved.journal, entry);

  const close = runClose({ resolved: installation.resolved, repoRoot: cwd, friction: flags.friction, date });

  const docPaths = [installation.resolved.journal];
  if (close.toolingFrictionCaptured) docPaths.push(installation.resolved.toolingFeedback);
  // Commit/status/push share the git toplevel as their path base (H1: the
  // installation root may be a subdir of the git repo).
  const gitRoot = gitToplevel(cwd);
  const docRel = docPaths.map((p) => relative(gitRoot, p));

  const warning = uncommittedNonDocWarning(gitRoot, docRel);
  const sha = commitDocs(gitRoot, docRel);

  let pushed = false;
  let pushError: string | undefined;
  if (!flags.noPush) {
    const err = pushDocs(gitRoot);
    pushed = err === null;
    if (err !== null) pushError = err;
  }

  const report: SessionEndReport = {
    journalEntryPath: installation.resolved.journal,
    toolingFrictionCaptured: close.toolingFrictionCaptured,
    cloneSnapshot: close.cloneSnapshot,
    backlogProgressed: progressed,
    commit: { sha, pushed, ...(pushError !== undefined ? { pushError } : {}) },
    ...(warning !== undefined ? { uncommittedNonDocWarning: warning } : {}),
  };

  process.stdout.write(flags.json ? `${JSON.stringify(report, null, 2)}\n` : render(report));

  // Push failure → exit 3 (record committed locally; surfaced for retry).
  if (!flags.noPush && !pushed) process.exit(3);
}
