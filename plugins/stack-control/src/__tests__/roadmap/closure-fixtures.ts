// T001 (031 transitive-item-closure) — shared fixture builders for the closure
// suite. NOT a *.test.ts, so vitest does not collect it. Fixtures live on disk;
// never mock the filesystem (.claude/rules/testing.md).
//
// Two builders:
//   • writeClosureRoadmap — a heading-keyed ROADMAP.md from typed node specs
//     (status, part-of parents, closes: id list, depends-on). Reuses the
//     writeTempRoadmap body-line shape from tests/roadmap/helpers.ts.
//   • provisionBacklog — a tmp backlog project (a copy of the committed
//     config.yml) populated via the REAL `backlog` binary through the typed
//     backend adapter, so the cascade closer exercises the real backend boundary.

import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBacklogBackend } from '../../backlog/backend.js';

const here = dirname(fileURLToPath(import.meta.url));
/** Plugin root (src/__tests__/roadmap → up three). */
const PLUGIN_ROOT = resolve(here, '..', '..', '..');
/** The committed backlog.md config the dogfood pile uses (mirrors tests/backlog/helpers.ts). */
const COMMITTED_BACKLOG_CONFIG = resolve(PLUGIN_ROOT, '.stack-control', 'backlog', 'config.yml');

/** A single roadmap node in a closure fixture tree. */
export interface ClosureNodeSpec {
  /** Heading-keyed identifier, e.g. `multi:feature/umbrella`. */
  readonly id: string;
  /** Roadmap status (e.g. `shipped`, `closed`, `in-flight`, `cancelled`). */
  readonly status: string;
  /** `part-of` parent identifiers (multi-parent allowed). */
  readonly partOf?: readonly string[];
  /** Backlog ids this node records as resolved (the `closes:` set). */
  readonly closes?: readonly string[];
  /** `depends-on` target identifiers. */
  readonly dependsOn?: readonly string[];
  /** 032 FR-014: the `validated:` marker — the validating → closed gate (operator-confirm). */
  readonly validated?: boolean;
}

/** Render one node's heading + field bullets (writeTempRoadmap body-line shape). */
function nodeLines(node: ClosureNodeSpec): string[] {
  const lines = [`## ${node.id}`, `- status: ${node.status}`];
  if (node.partOf !== undefined && node.partOf.length > 0) {
    lines.push(`- part-of: ${node.partOf.join(', ')}`);
  }
  if (node.closes !== undefined && node.closes.length > 0) {
    lines.push(`- closes: ${node.closes.join(', ')}`);
  }
  if (node.dependsOn !== undefined && node.dependsOn.length > 0) {
    lines.push(`- depends-on: ${node.dependsOn.join(', ')}`);
  }
  if (node.validated === true) {
    lines.push('- validated: 2026-06-23');
  }
  return lines;
}

/**
 * Write a heading-keyed ROADMAP.md from the given node specs to a fresh temp dir
 * and return its absolute path. Each node is `## <id>` followed by its field
 * bullets (status, part-of, closes, depends-on as present).
 */
export function writeClosureRoadmap(nodes: readonly ClosureNodeSpec[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'closure-roadmap-'));
  const docPath = join(dir, 'ROADMAP.md');
  const body: string[] = [];
  for (const node of nodes) {
    body.push(...nodeLines(node), '');
  }
  const src = ['---', 'doc-grammar: roadmap', '---', '', '# roadmap', '', ...body].join('\n');
  writeFileSync(docPath, src, 'utf8');
  return docPath;
}

/** One backlog task to provision in a closure fixture. */
export interface BacklogTaskSpec {
  readonly title: string;
  /** When true, the task is closed (`Done`) after creation. */
  readonly done?: boolean;
}

/** A provisioned backlog project: its cwd plus the created ids in creation order. */
export interface ProvisionedBacklog {
  readonly cwd: string;
  /** Created ids in creation order (e.g. `TASK-1`, `TASK-2`, …). */
  readonly ids: readonly string[];
}

/**
 * Provision a tmp backlog project (a copy of the committed config) and create
 * each task via the real backend, optionally closing it. Returns the project cwd
 * and the assigned ids in creation order.
 */
export function provisionBacklog(tasks: readonly BacklogTaskSpec[]): ProvisionedBacklog {
  const cwd = mkdtempSync(join(tmpdir(), 'closure-backlog-'));
  mkdirSync(join(cwd, 'backlog'), { recursive: true });
  copyFileSync(COMMITTED_BACKLOG_CONFIG, join(cwd, 'backlog', 'config.yml'));

  const backend = createBacklogBackend({ cwd });
  const ids: string[] = [];
  for (const task of tasks) {
    const id = backend.create({ title: task.title, labels: ['agent-found', 'type:gap'] });
    ids.push(id);
    if (task.done === true) backend.close(id, 'closed by closure fixture');
  }
  return { cwd, ids };
}
