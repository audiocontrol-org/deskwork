// AUDIT-20260608-45 (RED-first) — an UNTERMINATED embedded grammar comment must
// fail loud, not be silently reclassified as "not governable".
//
// findGrammarComments scans for an HTML comment opener `<!--` and a closing
// `-->`. If a comment OPENS a grammar declaration (`<!-- doc-grammar: ...`) but
// never closes, the old code did `continue` (skipped it), so resolveGrammar fell
// through to the frontmatter ref → none → "document declares no grammar; not
// governable". That misdiagnoses a malformed grammar declaration as a missing
// one (same class as the AUDIT-35 frontmatter fix), pointing the operator at the
// wrong repair. A non-grammar unterminated `<!--` stays a non-issue.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGrammar } from '../../src/document-model/grammar-resolver.js';
import { DocumentModelError } from '../../src/document-model/types.js';

function tmpDirs() {
  const root = mkdtempSync(join(tmpdir(), 'unterminated-grammar-'));
  const project = join(root, 'project-grammars');
  const builtin = join(root, 'builtin-grammars');
  mkdirSync(project, { recursive: true });
  mkdirSync(builtin, { recursive: true });
  return { root, project, builtin };
}

describe('unterminated embedded grammar comment (AUDIT-20260608-45)', () => {
  it('an UNTERMINATED grammar declaration fails loud (NOT "not governable")', () => {
    const { root, project, builtin } = tmpDirs();
    try {
      // Opens `<!-- doc-grammar: peg` then grammar text, with NO closing `-->`.
      const src = [
        '# A document',
        '',
        '<!-- doc-grammar: peg',
        'id: emb',
        'unit:',
        '  kind: heading',
        '  level: 3',
        '',
        '### A unit',
      ].join('\n');
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        DocumentModelError,
      );
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        /unterminated|not closed|missing.*-->/i,
      );
      // It must NOT be reported as "not governable" (the wrong-repair misdiagnosis).
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).not.toThrow(
        /not governable/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('an UNTERMINATED grammar declaration with the sentinel on the SECOND line fails loud (AUDIT-20260608-50)', () => {
    // AUDIT-45's fix only inspected the text on the SAME line as `<!--`
    // (`afterOpen`). When the comment is written with `<!--` alone on its line
    // and `doc-grammar:` on the NEXT line, `afterOpen` is empty so the sentinel
    // check missed it → the comment was silently skipped → misdiagnosed as
    // "not governable". The multi-line inner content (across lines, trimmed)
    // must be examined for the sentinel too.
    const { root, project, builtin } = tmpDirs();
    try {
      const src = [
        '# A document',
        '',
        '<!--',
        'doc-grammar: peg',
        'id: emb',
        'unit:',
        '  kind: heading',
        '  level: 3',
        '',
        '### A unit',
      ].join('\n');
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        DocumentModelError,
      );
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).toThrow(
        /unterminated|not closed|missing.*-->/i,
      );
      expect(() => resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin })).not.toThrow(
        /not governable/i,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a normal unterminated NON-grammar comment does NOT trigger the fail-loud', () => {
    // Control: an otherwise-governable document (frontmatter ref) that also has a
    // plain unterminated `<!-- just a note` comment must resolve normally — only
    // an unterminated comment that CLEARLY opens a grammar declaration fails loud.
    const { root, project, builtin } = tmpDirs();
    try {
      const artifact = [
        '---',
        'id: roadmap',
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
      writeFileSync(join(builtin, 'roadmap.peg'), artifact, 'utf8');
      const src = [
        '---',
        'doc-grammar: roadmap',
        '---',
        '',
        '<!-- just a note with no close',
        '',
        '### A unit',
      ].join('\n');
      const g = resolveGrammar(src, { projectGrammarDir: project, builtinGrammarDir: builtin });
      expect(g.id).toBe('roadmap');
      expect(g.source).toBe('builtin');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
