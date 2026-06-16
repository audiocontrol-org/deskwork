// Fixtures for the parseable lifecycle workflow engine (022 T001). Not a
// *.test.ts, so vitest does not collect it. Builds installations carrying a
// roadmap node at a chosen artifact state, optional spec dir + tasks.md, and
// optional mode-keyed govern-convergence records — the inputs phase-derivation
// and the gate evaluator read. The nested-adopter variant (US7) reuses the
// shared isolation harness.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  writeGovernConvergenceRecord,
} from '../../../govern/convergence-record.js';
import type { GovernConvergenceRecord } from '../../../workflow/workflow-types.js';
import { BUILTIN_GRAMMAR_DIR } from '../../../subcommands/document-verb-shared.js';
import type { LoadOptions } from '../../../document-model/document.js';

/** The fields a fixture roadmap node may carry (022 data-model § node fields). */
export interface FixtureNode {
  readonly identifier: string;
  readonly status: string;
  readonly design?: string;
  readonly spec?: string;
  readonly designApproved?: boolean;
  readonly analyzeClean?: boolean;
  readonly scope?: string;
}

export interface WorkflowFixture {
  readonly root: string;
  readonly roadmapPath: string;
  /** Grammar load options anchored at this fixture's installation root. */
  readonly opts: LoadOptions;
  /** Rewrite ROADMAP.md with the given node(s). */
  setRoadmap(nodes: readonly FixtureNode[]): void;
  /** Create `<root>/specs/<dir>/tasks.md` with `complete`/`incomplete` checkboxes. */
  writeSpecTasks(specDirRel: string, complete: boolean): string;
  /** Write a mode-keyed govern-convergence record for an item. */
  writeRecord(rec: Omit<GovernConvergenceRecord, 'anchorRoot'>): string;
  /** Write an arbitrary file under the installation; returns the abs path. */
  write(rel: string, content: string): string;
  cleanup(): void;
}

function nodeMarkdown(node: FixtureNode): string {
  const lines = [`## ${node.identifier}`, '', `- status: ${node.status}`];
  if (node.design !== undefined) lines.push(`- design: ${node.design}`);
  if (node.spec !== undefined) lines.push(`- spec: ${node.spec}`);
  if (node.designApproved === true) lines.push('- design-approved: 2026-06-16');
  if (node.analyzeClean === true) lines.push('- analyze-clean: 2026-06-16');
  lines.push('', node.scope ?? `${node.identifier} scope prose.`, '');
  return lines.join('\n');
}

export function roadmapMarkdown(nodes: readonly FixtureNode[]): string {
  return ['---', 'doc-grammar: roadmap', '---', '', '# Roadmap', '', ...nodes.map(nodeMarkdown)].join(
    '\n',
  );
}

/** A flat installation fixture (a tmp dir owning `.stack-control/config.yaml`). */
export function makeWorkflowFixture(nodes: readonly FixtureNode[] = []): WorkflowFixture {
  const root = mkdtempSync(join(tmpdir(), 'wf-fixture-'));
  mkdirSync(join(root, '.stack-control'), { recursive: true });
  writeFileSync(join(root, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');
  const roadmapPath = join(root, 'ROADMAP.md');
  const opts: LoadOptions = {
    projectGrammarDir: join(root, '.stack-control', 'grammars'),
    builtinGrammarDir: BUILTIN_GRAMMAR_DIR,
  };

  const write = (rel: string, content: string): string => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    return abs;
  };

  const fixture: WorkflowFixture = {
    root,
    roadmapPath,
    opts,
    setRoadmap: (next) => writeFileSync(roadmapPath, roadmapMarkdown(next), 'utf8'),
    writeSpecTasks: (specDirRel, complete) => {
      const box = complete ? 'X' : ' ';
      const body = [
        '# Tasks',
        '',
        `- [${box}] T001 first task`,
        `- [${box}] T002 second task`,
        '',
      ].join('\n');
      return write(join(specDirRel, 'tasks.md'), body);
    },
    writeRecord: (rec) => writeGovernConvergenceRecord(root, rec),
    write,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };

  if (nodes.length > 0) fixture.setRoadmap(nodes);
  return fixture;
}
