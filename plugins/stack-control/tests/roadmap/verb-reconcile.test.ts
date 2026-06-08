// T046 (RED-first, US5, 006) — `roadmap reconcile` is report-only: it proposes
// status drift + orphans + unresolved correspondences and writes NOTHING
// (contracts/roadmap-cli.md; FR-017). Spec paths resolve relative to the
// invocation cwd.

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function buildTree(): { docPath: string; baseDir: string } {
  const baseDir = mkdtempSync(join(tmpdir(), 'verb-reconcile-'));
  const docPath = join(baseDir, 'ROADMAP.md');
  writeFileSync(
    docPath,
    [
      '---',
      'doc-grammar: roadmap',
      '---',
      '',
      '# roadmap',
      '',
      '## impl:feature/x',
      '- status: in-flight',
      '- spec: specs/x',
      '',
      '## impl:feature/gone',
      '- status: planned',
      '- spec: specs/missing',
      '',
    ].join('\n'),
    'utf8',
  );
  const mk = (dir: string, files: Record<string, string>) => {
    const d = join(baseDir, 'specs', dir);
    mkdirSync(d, { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body, 'utf8');
  };
  mk('x', { 'spec.md': '# x', 'tasks.md': '- [x] T001 a\n' });
  mk('orphan', { 'spec.md': '# orphan' });
  return { docPath, baseDir };
}

describe('stackctl roadmap reconcile verb (T046)', () => {
  it('reports drift + orphans + unresolved; exit 0; writes nothing', () => {
    const { docPath, baseDir } = buildTree();
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'reconcile', '--doc', docPath], { cwd: baseDir });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:feature/x'); // shipped proposal
    expect(r.stdout).toMatch(/shipped/);
    expect(r.stdout).toContain('orphan'); // orphan spec dir
    expect(r.stdout).toContain('impl:feature/gone'); // unresolved correspondence
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
