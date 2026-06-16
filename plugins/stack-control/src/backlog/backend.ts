// T006 (008) — the typed backlog adapter. The plugin's first external-backend
// adapter verb is backed here: WRITES shell out to the real `backlog` binary
// (backlog.md owns the task-file format + id assignment); READS parse the
// committed YAML-frontmatter task files (the durable artifact — `backlog task
// list --plain` and `search` expose neither refs nor labels, which idempotency
// and the type:<v> label both need). Fail-loud per Constitution Principle V: a
// missing binary or a non-zero backend exit throws a descriptive BacklogError;
// never a silent no-op, fallback, or empty success.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Fail-loud error type the verb maps to exit 2 with remediation. */
export class BacklogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BacklogError';
  }
}

/** One unit of found work, projected from a backlog.md task file. */
export interface BacklogItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  /** Derived from the `type:<value>` label (bug/gap/imported-issue/migrated-finding). */
  readonly type?: string;
  readonly labels: readonly string[];
  /** backlog.md `references` — used as the idempotency key for imports. */
  readonly refs: readonly string[];
}

/** What `create` stamps. The verb composes labels (project + type) upstream. */
export interface CaptureSpec {
  readonly title: string;
  readonly labels: readonly string[];
  readonly refs?: readonly string[];
  readonly body?: string;
  readonly priority?: 'high' | 'medium' | 'low';
}

/** Additive, field-preserving mutations for `edit` (012, D6). Both are append /
 * add operations — no read-modify-write, so concurrent edits are never clobbered
 * (FR-013). */
export interface EditSpec {
  /** Add a label additively (existing labels preserved). */
  readonly addLabel?: string;
  /** Append a line to the task's implementation notes (existing body preserved). */
  readonly appendNotes?: string;
}

export interface BacklogBackend {
  /** Create one item via the real binary; returns the assigned id (e.g. TASK-1). */
  create(spec: CaptureSpec): string;
  /** All active items, read from the task-file frontmatter. */
  list(): readonly BacklogItem[];
  /** Whether any item already carries `ref` (import idempotency). */
  exists(ref: string): boolean;
  /** Additively edit an existing item (add a label / append notes). Shells the
   * real binary; a non-zero exit (e.g. unknown id) throws BacklogError (D6). */
  edit(id: string, spec: EditSpec): void;
  /** Close an item by setting its status to the terminal `Done` (023 FR-007).
   * Shells the real binary; a non-zero exit (e.g. unknown id) throws BacklogError —
   * never a silent no-op, never a fabricated success. */
  close(id: string): void;
}

/** The terminal backlog status an item is moved to on closure. */
export const BACKLOG_DONE_STATUS = 'Done';

export interface BacklogBackendOptions {
  /** Working dir whose `backlog/` tree the binary operates on. */
  readonly cwd: string;
  /** Injectable binary path (tests point this at a missing path for fail-loud). */
  readonly binaryPath?: string;
  /**
   * Sink for per-file skip warnings on the read path (specs/014 US8).
   * Default: process.stderr.
   */
  readonly warn?: (line: string) => void;
}

const DEP = 'backlog.md';
const BACKEND_LABEL = 'configured backlog backend';
const INSTALL_HINT =
  'run `npm install` in the stack-control plugin root to restore the configured backlog backend dependency';

/** Resolve how to invoke backlog: an injected path, or node + the resolved cli.js. */
function resolveInvocation(binaryPath: string | undefined): { cmd: string; prefix: string[] } {
  if (binaryPath !== undefined) return { cmd: binaryPath, prefix: [] };
  const req = createRequire(import.meta.url);
  let pkgJsonPath: string;
  try {
    pkgJsonPath = req.resolve(`${DEP}/package.json`);
  } catch {
    throw new BacklogError(`${BACKEND_LABEL} is not installed — ${INSTALL_HINT}`);
  }
  const binRel = readBinRel(pkgJsonPath);
  return { cmd: process.execPath, prefix: [resolve(dirname(pkgJsonPath), binRel)] };
}

/** The `backlog` bin entry from the package manifest (defensively typed). */
function readBinRel(pkgJsonPath: string): string {
  const parsed: unknown = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  if (isRecord(parsed)) {
    const bin = parsed.bin;
    if (typeof bin === 'string') return bin;
    if (isRecord(bin) && typeof bin.backlog === 'string') return bin.backlog;
  }
  throw new BacklogError(`could not locate the 'backlog' bin entry in ${pkgJsonPath}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** First line of a (possibly multi-line) parse error — warning brevity. */
function firstLine(message: string): string {
  const idx = message.indexOf('\n');
  return idx < 0 ? message : message.slice(0, idx);
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Frontmatter between the leading `---` and its closing fence ('' if absent). */
function frontmatterBlock(text: string): string {
  if (!text.startsWith('---')) return '';
  const end = text.indexOf('\n---', 3);
  return end < 0 ? '' : text.slice(3, end);
}

function projectTask(text: string): BacklogItem | null {
  const block = frontmatterBlock(text);
  if (block.length === 0) return null;
  const data: unknown = parseYaml(block);
  if (!isRecord(data) || typeof data.id !== 'string') return null;
  const labels = toStringArray(data.labels);
  const typeLabel = labels.find((l) => l.startsWith('type:'));
  return {
    id: data.id,
    title: typeof data.title === 'string' ? data.title : '',
    status: typeof data.status === 'string' ? data.status : '',
    type: typeLabel === undefined ? undefined : typeLabel.slice('type:'.length),
    labels,
    refs: toStringArray(data.references),
  };
}

export function createBacklogBackend(opts: BacklogBackendOptions): BacklogBackend {
  const { cmd, prefix } = resolveInvocation(opts.binaryPath);
  const tasksDir = join(opts.cwd, 'backlog', 'tasks');
  const warn =
    opts.warn ??
    ((line: string) => {
      process.stderr.write(line);
    });

  function run(args: readonly string[]): string {
    const res = spawnSync(cmd, [...prefix, ...args], { cwd: opts.cwd, encoding: 'utf8' });
    if (res.error !== undefined) {
      const code = (isRecord(res.error) && res.error.code) || '';
      if (code === 'ENOENT') {
        throw new BacklogError(`${BACKEND_LABEL} executable not found — ${INSTALL_HINT}`);
      }
      throw new BacklogError(`failed to spawn the ${BACKEND_LABEL}: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const detail = (res.stderr || res.stdout || '').trim();
      throw new BacklogError(`${BACKEND_LABEL} exited ${res.status}: ${detail}`);
    }
    return res.stdout ?? '';
  }

  /**
   * Walk the task files with per-file fault isolation (specs/014 US8).
   * A file whose frontmatter fails to parse is collected as `malformed`
   * instead of throwing out of the whole walk — the CALLER decides the
   * policy: read paths skip-with-warning (availability); integrity
   * paths fail loud (safety).
   */
  function readTaskFiles(): {
    items: readonly BacklogItem[];
    malformed: readonly { path: string; error: string }[];
  } {
    if (!existsSync(tasksDir)) return { items: [], malformed: [] };
    const items: BacklogItem[] = [];
    const malformed: { path: string; error: string }[] = [];
    for (const file of readdirSync(tasksDir)) {
      if (!file.endsWith('.md')) continue;
      const path = join(tasksDir, file);
      try {
        const item = projectTask(readFileSync(path, 'utf8'));
        if (item !== null) items.push(item);
      } catch (err) {
        malformed.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { items, malformed };
  }

  /**
   * Read path: malformed files are skipped with a stderr warning naming
   * each file (exit stays 0 at the verb layer); healthy items still
   * list. An all-malformed store yields zero items WITH warnings —
   * distinguishable from a clean-empty store.
   */
  function listItems(): readonly BacklogItem[] {
    const { items, malformed } = readTaskFiles();
    for (const bad of malformed) {
      warn(
        `backlog: WARNING — skipping malformed task file: ${bad.path} (${firstLine(bad.error)})\n`,
      );
    }
    return items;
  }

  return {
    create(spec: CaptureSpec): string {
      const args = ['task', 'create', spec.title];
      if (spec.labels.length > 0) args.push('-l', spec.labels.join(','));
      if (spec.priority !== undefined) args.push('--priority', spec.priority);
      for (const ref of spec.refs ?? []) args.push('--ref', ref);
      if (spec.body !== undefined && spec.body.length > 0) args.push('-d', spec.body);
      args.push('--plain');
      const stdout = run(args);
      const m = /^Task\s+(\S+)\s+-/m.exec(stdout);
      if (m === null) {
        throw new BacklogError(
          `could not parse the created item id from the ${BACKEND_LABEL} output:\n${stdout}`,
        );
      }
      return m[1]!;
    },

    list: listItems,

    exists(ref: string): boolean {
      // Integrity path (specs/014 US8, AUDIT-20260611-06): the POSITIVE
      // answer is decidable regardless of malformed files — when `ref`
      // is found among healthy items, the idempotency check succeeds,
      // nothing is created, and no duplicate is possible. Only the
      // NEGATIVE answer is undecidable: a malformed file could be the
      // very one holding `ref` — reporting "absent" would let an import
      // create a duplicate. So: return true on a healthy hit; fail loud
      // naming the file only when the answer would otherwise be
      // "absent" with malformed files present.
      const { items, malformed } = readTaskFiles();
      if (items.some((i) => i.refs.includes(ref))) return true;
      if (malformed.length > 0) {
        const first = malformed[0]!;
        throw new BacklogError(
          `malformed task file blocks the integrity check: ${first.path} ` +
            `(${firstLine(first.error)})` +
            (malformed.length > 1 ? ` — and ${malformed.length - 1} more` : '') +
            ` — fix or remove the file, then re-run`,
        );
      }
      return false;
    },

    edit(id: string, spec: EditSpec): void {
      const args = ['task', 'edit', id];
      if (spec.addLabel !== undefined) args.push('--add-label', spec.addLabel);
      if (spec.appendNotes !== undefined) args.push('--append-notes', spec.appendNotes);
      args.push('--plain');
      run(args); // non-zero (e.g. unknown id) → BacklogError, never a silent no-op
    },

    close(id: string): void {
      // Set status to the terminal `Done` via the real binary. A non-zero exit
      // (unknown id, backend error) throws BacklogError — the caller never reports
      // a close it did not perform (023 FR-006/FR-007).
      run(['task', 'edit', id, '-s', BACKLOG_DONE_STATUS, '--plain']);
    },
  };
}
