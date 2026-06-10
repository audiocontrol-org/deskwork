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
  /** Fail loud if ANY task file in the store is malformed (unparseable
   * frontmatter / missing id). Unlike `list`/`exists` — which tolerate by
   * skipping — this is the preflight a mutation runs so it never masks a
   * corrupt store (FR-009, no-silent-skip). Throws BacklogError naming the file. */
  assertWellFormed(): void;
}

export interface BacklogBackendOptions {
  /** Working dir whose `backlog/` tree the binary operates on. */
  readonly cwd: string;
  /** Injectable binary path (tests point this at a missing path for fail-loud). */
  readonly binaryPath?: string;
}

const DEP = 'backlog.md';
const INSTALL_HINT =
  `install it with \`npm install\` (the stack-control plugin pins ${DEP}@1.46.0)`;

/** Resolve how to invoke backlog: an injected path, or node + the resolved cli.js. */
function resolveInvocation(binaryPath: string | undefined): { cmd: string; prefix: string[] } {
  if (binaryPath !== undefined) return { cmd: binaryPath, prefix: [] };
  const req = createRequire(import.meta.url);
  let pkgJsonPath: string;
  try {
    pkgJsonPath = req.resolve(`${DEP}/package.json`);
  } catch {
    throw new BacklogError(`required dependency '${DEP}' is not installed — ${INSTALL_HINT}`);
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

  function run(args: readonly string[]): string {
    const res = spawnSync(cmd, [...prefix, ...args], { cwd: opts.cwd, encoding: 'utf8' });
    if (res.error !== undefined) {
      const code = (isRecord(res.error) && res.error.code) || '';
      if (code === 'ENOENT') {
        throw new BacklogError(`required dependency '${DEP}' binary not found — ${INSTALL_HINT}`);
      }
      throw new BacklogError(`failed to spawn ${DEP}: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const detail = (res.stderr || res.stdout || '').trim();
      throw new BacklogError(`${DEP} exited ${res.status}: ${detail}`);
    }
    return res.stdout ?? '';
  }

  function listItems(): readonly BacklogItem[] {
    if (!existsSync(tasksDir)) return [];
    const items: BacklogItem[] = [];
    for (const file of readdirSync(tasksDir)) {
      if (!file.endsWith('.md')) continue;
      const item = projectTask(readFileSync(join(tasksDir, file), 'utf8'));
      if (item !== null) items.push(item);
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
        throw new BacklogError(`could not parse the created item id from ${DEP} output:\n${stdout}`);
      }
      return m[1]!;
    },

    list: listItems,

    exists(ref: string): boolean {
      return listItems().some((i) => i.refs.includes(ref));
    },

    edit(id: string, spec: EditSpec): void {
      const args = ['task', 'edit', id];
      if (spec.addLabel !== undefined) args.push('--add-label', spec.addLabel);
      if (spec.appendNotes !== undefined) args.push('--append-notes', spec.appendNotes);
      args.push('--plain');
      run(args); // non-zero (e.g. unknown id) → BacklogError, never a silent no-op
    },

    assertWellFormed(): void {
      if (!existsSync(tasksDir)) return;
      for (const file of readdirSync(tasksDir)) {
        if (!file.endsWith('.md')) continue;
        if (projectTask(readFileSync(join(tasksDir, file), 'utf8')) === null) {
          throw new BacklogError(
            `malformed backlog task file: '${file}' (unparseable frontmatter or missing id) — ` +
              `fix or remove it before mutating the store`,
          );
        }
      }
    },
  };
}
