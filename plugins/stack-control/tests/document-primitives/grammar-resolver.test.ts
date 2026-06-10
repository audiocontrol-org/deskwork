// T008 (RED-first) — grammar resolution (FR-001/FR-012).
// Embedded wins over a frontmatter ref; a ref resolves project-override →
// built-in; neither present → fail loud; >1 embedded declaration → fail loud.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGrammar } from '../../src/document-model/grammar-resolver.js';
import { DocumentModelError } from '../../src/document-model/types.js';

// A minimal valid grammar artifact (metadata + a trivial PEG body). The
// resolver extracts metadata + pegText; it does not compile the PEG.
function artifact(id: string): string {
  return [
    '---',
    `id: ${id}`,
    'unit:',
    '  kind: heading',
    '  level: 3',
    'statusVocabulary: [captured, promoted, dropped]',
    'terminalStatuses: [promoted, dropped]',
    'orderKey:',
    '  field: status',
    '  relation: [captured, promoted, dropped]',
    'identifier:',
    '  kind: title',
    'reconciliationHook: null',
    '---',
    'start = .*',
  ].join('\n');
}

function tmpDirs() {
  const root = mkdtempSync(join(tmpdir(), 'grammar-resolver-'));
  const project = join(root, 'project-grammars');
  const builtin = join(root, 'builtin-grammars');
  mkdirSync(project, { recursive: true });
  mkdirSync(builtin, { recursive: true });
  return { root, project, builtin };
}

describe('grammar resolution (T008)', () => {
  it('embedded declaration wins over a frontmatter ref', () => {
    const { root, project, builtin } = tmpDirs();
    try {
      writeFileSync(join(builtin, 'ref.peg'), artifact('ref'), 'utf8');
      const src = [
        '---',
        'doc-grammar: ref',
        '---',
        '<!-- doc-grammar: peg',
        artifact('emb'),
        '-->',
        '',
        '### A unit',
      ].join('\n');
      const g = resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin });
      expect(g.source).toBe('embedded');
      expect(g.id).toBe('emb');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('frontmatter ref resolves project-override BEFORE built-in', () => {
    const { root, project, builtin } = tmpDirs();
    try {
      writeFileSync(join(project, 'roadmap.peg'), artifact('roadmap'), 'utf8');
      writeFileSync(join(builtin, 'roadmap.peg'), artifact('roadmap'), 'utf8');
      const src = ['---', 'doc-grammar: roadmap', '---', '', '### x'].join('\n');
      const g = resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin });
      expect(g.source).toBe('project-override');
      expect(g.id).toBe('roadmap');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('frontmatter ref falls through to built-in when no project override', () => {
    const { root, project, builtin } = tmpDirs();
    try {
      writeFileSync(join(builtin, 'roadmap.peg'), artifact('roadmap'), 'utf8');
      const src = ['---', 'doc-grammar: roadmap', '---', '', '### x'].join('\n');
      const g = resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin });
      expect(g.source).toBe('builtin');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('neither embedded nor a resolvable ref → fail loud (not governable)', () => {
    const { root, project, builtin } = tmpDirs();
    try {
      const src = '# Just a document\n\nNo grammar here.\n';
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        DocumentModelError,
      );
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        /not governable/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('more than one embedded doc-grammar comment → fail loud (ambiguous)', () => {
    const { root, project, builtin } = tmpDirs();
    try {
      const src = [
        '<!-- doc-grammar: peg',
        artifact('one'),
        '-->',
        '<!-- doc-grammar: peg',
        artifact('two'),
        '-->',
        '### x',
      ].join('\n');
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        /ambiguous/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('present-but-malformed frontmatter YAML → fail loud (NOT "not governable")', () => {
    // AUDIT-20260608-35: a document WITH a leading frontmatter block whose YAML
    // is malformed must fail loud naming the broken frontmatter — never silently
    // fall back to "not governable" (which points the operator at the wrong fix:
    // "add a grammar" instead of "fix the broken YAML").
    const { root, project, builtin } = tmpDirs();
    try {
      const src = ['---', 'doc-grammar: [unterminated', '---', '', '### x'].join('\n');
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        DocumentModelError,
      );
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        /frontmatter|malformed|invalid.*yaml/i,
      );
      // And it must NOT be reported as "not governable".
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).not.toThrow(
        /not governable/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('well-formed frontmatter WITHOUT a doc-grammar key → not governable (no throw on parse)', () => {
    // Guard the inverse: a frontmatter that PARSES cleanly but lacks the
    // `doc-grammar` key is still "not governable" — only a PARSE error fails loud.
    const { root, project, builtin } = tmpDirs();
    try {
      const src = ['---', 'title: A document', 'tags: [a, b]', '---', '', '### x'].join('\n');
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        /not governable/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a ref to a nonexistent grammar id → fail loud', () => {
    const { root, project, builtin } = tmpDirs();
    try {
      const src = ['---', 'doc-grammar: missing', '---', '### x'].join('\n');
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        DocumentModelError,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
