// AUDIT-20260608-49 (RED-first) — the heading-keyed ARCHIVE scan must be
// markdown-aware (reuse the block parser), NOT a raw line-regex.
//
// A `###`-shaped line INSIDE a fenced code block within a Unit body is a CODE
// block, never a Unit marker. The raw-regex archive scan mis-detects it as the
// next-Unit marker and truncates the Unit on unarchive. This pins the round-trip:
// a Unit whose body carries a fenced `### ...` line must round-trip INTACT.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runArchive } from '../../src/document-model/archive-engine.js';
import { runUnarchive } from '../../src/document-model/unarchive-engine.js';
import { loadDocument } from '../../src/document-model/document.js';

const here = dirname(fileURLToPath(import.meta.url));
const BUILTIN = resolve(here, '..', '..', 'grammars');
const OPTS = { now: '2026-06-08T00:00:00.000Z', builtinGrammarDir: BUILTIN };

function tmpDoc(body: string, name = 'INBOX.md') {
  const dir = mkdtempSync(join(tmpdir(), 'archive-fence-aware-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { dir, docPath, archivePath: join(dir, name.replace(/\.md$/, '-archive.md')) };
}

function liveIds(docPath: string): string[] {
  return loadDocument(docPath, OPTS).doc.units.map((u) => u.identifier);
}

// A heading-keyed design-inbox doc with a Unit whose BODY contains a fenced
// code block holding a `### ...` line. The fence line LOOKS like a reserved-
// level Unit marker but is code, not a heading.
const FENCE_BODY = [
  '```markdown',
  '### Not A Real Heading',
  'inside a fenced code block',
  '```',
].join('\n');

const INBOX = [
  '---',
  'doc-grammar: design-inbox',
  '---',
  '',
  '# Inbox',
  '',
  '### Active idea',
  '- **Status:** **captured**',
  '',
  '### Shipped idea',
  '- **Status:** **promoted** → roadmap',
  '',
  FENCE_BODY,
  '',
  '### Another active',
  '- **Status:** **captured**',
  '',
].join('\n');

describe('AUDIT-20260608-49 — heading-keyed archive scan is markdown-aware (fence-safe)', () => {
  it('round-trips a Unit whose body holds a fenced `### ...` line WITHOUT truncating at the in-fence ###', () => {
    const { docPath, archivePath } = tmpDoc(INBOX);

    // Archive the promoted Unit. Its body contains a fenced `### Not A Real
    // Heading` line. The raw-regex scan would treat that as the NEXT Unit marker
    // and lift only the lines up to it — truncating the fence.
    runArchive(docPath, { apply: true, ...OPTS });
    expect(liveIds(docPath)).toEqual(['Active idea', 'Another active']);

    const archive = readFileSync(archivePath, 'utf8');
    // The fenced `### ...` line lives in the archived Unit's body.
    expect(archive).toContain('### Not A Real Heading');

    // Unarchive it back. The FULL body — including the complete fenced block —
    // must round-trip intact, NOT be truncated at the in-fence `###`.
    runUnarchive(docPath, { id: 'Shipped idea', apply: true, ...OPTS });
    expect(liveIds(docPath)).toEqual(['Active idea', 'Another active', 'Shipped idea']);

    const live = readFileSync(docPath, 'utf8');
    // The restored Unit carries the complete code fence (open + in-fence ### +
    // body line + close), proving it was not truncated at the in-fence heading.
    expect(live).toContain('```markdown');
    expect(live).toContain('### Not A Real Heading');
    expect(live).toContain('inside a fenced code block');
    // The fence closes — the full block round-tripped.
    const restoredUnit = live.slice(live.indexOf('### Shipped idea'));
    expect(restoredUnit).toContain('```markdown');
    expect(restoredUnit.match(/```/g)?.length).toBe(2); // open + close fence both present
  });
});
