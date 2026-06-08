// AUDIT-20260608-31 — the `stackctl curate` verb dry-run must not print
// "would change" when every finding is purely informational. A clean roadmap
// (well-ordered, no live terminal-status rows) still carries an
// `up-to-date-seam` finding because the built-in roadmap grammar declares a
// reconciliation hook; the verb must classify findings by kind so an
// informational-only report prints the "clean" message (and still surfaces the
// informational notices), never "would change".

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

function tmpDoc(body: string, name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'curate-reporting-'));
  const docPath = join(dir, name);
  writeFileSync(docPath, body, 'utf8');
  return { docPath };
}

// A clean roadmap: a single `planned` (non-terminal) row, in declared order
// (one row is trivially well-ordered). The built-in roadmap grammar declares a
// `glob` reconciliation hook, so curate always emits an `up-to-date-seam`
// finding — which is informational, not actionable.
const CLEAN_ROADMAP = [
  '---',
  'doc-grammar: roadmap',
  '---',
  '',
  '# Roadmap',
  '',
  '| Codename | Feature | Scope | Status |',
  '|---|---|---|---|',
  '| design/insight-capture | Capture | one move | planned |',
  '',
].join('\n');

describe('stackctl curate verb — informational-only dry-run (AUDIT-20260608-31)', () => {
  it('prints "clean" (not "would change") for a clean roadmap with only a seam finding', () => {
    const { docPath } = tmpDoc(CLEAN_ROADMAP, 'ROADMAP.md');
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/clean/);
    expect(r.stdout).not.toMatch(/would change/);
  });

  it('still surfaces the informational seam notice in a clean dry-run', () => {
    const { docPath } = tmpDoc(CLEAN_ROADMAP, 'ROADMAP.md');
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/up-to-date-seam/);
  });
});
