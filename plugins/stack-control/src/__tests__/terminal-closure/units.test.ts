// 023 terminal-closure — unit coverage for the `closes:` node field (T001) and
// the backend `close(id)` operation (T002). The backend tests drive the REAL
// backlog binary against an isolated tmp project (never mocked — testing.md).

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRoadmap } from '../../roadmap/roadmap-model.js';
import { BUILTIN_GRAMMAR_DIR } from '../../subcommands/document-verb-shared.js';
import { BacklogError, BACKLOG_DONE_STATUS, createBacklogBackend } from '../../backlog/backend.js';
import { tmpBacklog } from '../../../tests/backlog/helpers.js';

let dirs: string[] = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe('023 T001 — the closes: node field', () => {
  it('projects a comma-list of backlog ids onto WorkItem.closes', () => {
    const root = mkdtempSync(join(tmpdir(), 'closes-'));
    dirs.push(root);
    const doc = [
      '---', 'doc-grammar: roadmap', '---', '', '# Roadmap', '',
      '## multi:feature/x', '', '- status: shipped', '- closes: TASK-A, TASK-B, TASK-C', '- ref: TASK-D', '',
      'scope.', '',
      '## multi:feature/y', '', '- status: planned', '', 'no closes here.', '',
    ].join('\n');
    const path = join(root, 'ROADMAP.md');
    writeFileSync(path, doc, 'utf8');
    const model = loadRoadmap(path, { builtinGrammarDir: BUILTIN_GRAMMAR_DIR });
    expect(model.byId.get('multi:feature/x')!.closes).toEqual(['TASK-A', 'TASK-B', 'TASK-C']);
    expect(model.byId.get('multi:feature/x')!.ref).toBe('TASK-D');
    expect(model.byId.get('multi:feature/y')!.closes).toEqual([]); // absent → empty
  });
});

describe('023 T002 — backend close(id) (real binary)', () => {
  it('sets an item status to Done and fails loud on an unknown id', () => {
    const root = tmpBacklog();
    dirs.push(root);
    const backend = createBacklogBackend({ cwd: root });
    const id = backend.create({ title: 'closable', labels: ['type:gap'] });
    expect(backend.list().find((i) => i.id === id)!.status).not.toBe(BACKLOG_DONE_STATUS);

    backend.close(id, 'unit-test closure');
    expect(backend.list().find((i) => i.id === id)!.status).toBe(BACKLOG_DONE_STATUS);
    // The rationale is persisted to the durable task notes (028 TASK-297).
    expect(backend.readNotes(id)).toContain('unit-test closure');

    // Idempotent: closing an already-Done item is not an error.
    expect(() => backend.close(id, 'second close')).not.toThrow();

    // Unknown id fails loud — never a silent no-op.
    expect(() => backend.close('TASK-999999', 'x')).toThrow(BacklogError);
  });
});
