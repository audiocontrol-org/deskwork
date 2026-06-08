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
  'doc-grammar: roadmap-legacy',
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
  it('does NOT print "would change" for a clean roadmap with only a seam finding', () => {
    const { docPath } = tmpDoc(CLEAN_ROADMAP, 'ROADMAP.md');
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/would change/);
  });

  it('still surfaces the informational seam notice in a clean dry-run', () => {
    const { docPath } = tmpDoc(CLEAN_ROADMAP, 'ROADMAP.md');
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/up-to-date-seam/);
  });
});

// AUDIT-20260608-43 — a `coherence-notice` is a REAL ledger↔archive drift, NOT a
// benign/expected signal like the up-to-date-seam. curate's dry-run must not
// describe a coherence-notice-only document as "clean" (curate does not auto-fix
// coherence drift — FR-006 makes it the operator's responsibility). The three-way
// headline: ZERO findings → "clean"; informational-only → "no automatic changes;
// N notice(s)" (NOT "clean", NOT "would change"); ≥1 actionable → "would change".

// A heading-keyed design-inbox doc with a SINGLE `captured` (non-terminal) Unit:
// trivially well-ordered (< 2 Units), no terminal-status live Unit, and the
// design-inbox grammar declares NO reconciliation hook — so the ONLY finding can
// come from the ledger↔archive coherence check, never a seam.
const INBOX_ONE_CAPTURED = [
  '---',
  'doc-grammar: design-inbox',
  '---',
  '',
  '# Design Inbox',
  '',
  '### Live Idea',
  '',
  '**Status:** captured',
  '',
  'Body of the live idea.',
  '',
].join('\n');

// A sibling archive whose ledger references an identifier (`Archived Idea`) with
// NO matching `### Archived Idea` heading marker present in the archive content.
// curate's coherenceFindings reports this as a `coherence-notice` ("ledger
// references '<id>' but no matching marker"), with NO disorder/terminal finding.
const ARCHIVE_LEDGER_WITHOUT_MARKER = [
  '<!-- doc-archive-ledger',
  'Archived Idea\t2026-06-01T00:00:00Z\tpromoted',
  '-->',
  '',
  '# Design Inbox — Archive',
  '',
].join('\n');

describe('stackctl curate verb — three-way dry-run headline (AUDIT-20260608-43)', () => {
  it('does NOT say "clean" when the only finding is a coherence-notice (real drift)', () => {
    const { docPath } = tmpDoc(INBOX_ONE_CAPTURED, 'INBOX.md');
    writeFileSync(
      docPath.replace(/\.md$/, '-archive.md'),
      ARCHIVE_LEDGER_WITHOUT_MARKER,
      'utf8',
    );
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toMatch(/clean/);
    expect(r.stdout).not.toMatch(/would change/);
  });

  it('surfaces the coherence NOTICE in the coherence-notice-only dry-run', () => {
    const { docPath } = tmpDoc(INBOX_ONE_CAPTURED, 'INBOX.md');
    writeFileSync(
      docPath.replace(/\.md$/, '-archive.md'),
      ARCHIVE_LEDGER_WITHOUT_MARKER,
      'utf8',
    );
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/coherence-notice/);
    expect(r.stdout).toMatch(/NOTICE/);
  });

  it('prints "clean" for a truly clean doc with ZERO findings (no archive, no seam)', () => {
    const { docPath } = tmpDoc(INBOX_ONE_CAPTURED, 'INBOX.md');
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/clean/);
    expect(r.stdout).not.toMatch(/would change/);
    expect(r.stdout).not.toMatch(/coherence-notice/);
  });
});
