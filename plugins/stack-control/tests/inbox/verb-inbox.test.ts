// T005 (RED-first, Foundational, 007) — the `inbox` verb dispatcher shell +
// read-only `list` (the shell's natural doc-load path; T016/T017 pulled forward
// so "ungovernable --doc → exit 2" is asserted honestly, no stub handler).
// capture cases (T009) and promote/drop cases (T014) append to this file.
// Mirrors tests/roadmap/verb-add.test.ts (runCli via spawnSync).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { tmpCopy } from './helpers.js';

describe('stackctl inbox verb shell (T005)', () => {
  it('no subaction → exit 2', () => {
    expect(runCli(['inbox']).status).toBe(2);
  });

  it('unknown subaction → exit 2 with a descriptive message', () => {
    const r = runCli(['inbox', 'frobnicate', '--doc', tmpCopy('sample-inbox')]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('frobnicate');
  });

  it('--doc flag missing its value → exit 2', () => {
    expect(runCli(['inbox', 'list', '--doc']).status).toBe(2);
  });

  it('unknown flag on a known subaction → exit 2', () => {
    const r = runCli(['inbox', 'list', '--bogus', 'x', '--doc', tmpCopy('sample-inbox')]);
    expect(r.status).toBe(2);
  });

  it('--apply is rejected on read-only list (proves --apply is parsed, not ignored)', () => {
    const r = runCli(['inbox', 'list', '--doc', tmpCopy('sample-inbox'), '--apply']);
    expect(r.status).toBe(2);
  });
});

describe('stackctl inbox list (T016/T017, pulled into Foundational)', () => {
  it('lists each entry id + status, writes nothing', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['inbox', 'list', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Try a TUI inbox view');
    expect(r.stdout).toContain('captured');
    expect(r.stdout).toContain('Inbox entry pinning');
    expect(r.stdout).toContain('promoted');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('missing / ungovernable inbox → exit 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'inbox-missing-'));
    const r = runCli(['inbox', 'list', '--doc', join(dir, 'nope.md')]);
    expect(r.status).toBe(2);
  });
});

describe('stackctl inbox capture verb (T009)', () => {
  it('--apply captures an entry in one move → exit 0 + entry present', () => {
    const docPath = tmpCopy('sample-inbox');
    const r = runCli([
      'inbox', 'capture', 'Remote capture from phone',
      '--idea', 'Capture inbox entries from the control-plane frontend',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    expect(readFileSync(docPath, 'utf8')).toContain('### Remote capture from phone');
    const list = runCli(['inbox', 'list', '--doc', docPath]);
    expect(list.stdout).toContain('Remote capture from phone');
  });

  it('missing <title> positional → exit 2', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['inbox', 'capture', '--idea', 'x', '--doc', docPath, '--apply']);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('missing --idea → exit 2', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['inbox', 'capture', 'No idea given', '--doc', docPath, '--apply']);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('duplicate title → exit 2, zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'inbox', 'capture', 'Try a TUI inbox view',
      '--idea', 'dup', '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('dry-run (no --apply) → exit 0, inbox unchanged', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'inbox', 'capture', 'Dry idea', '--idea', 'x', '--doc', docPath,
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Dry idea');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});

describe('stackctl inbox flag-shaped value flags (AUDIT-BARRAGE codex-02/claude-02)', () => {
  // A free-text value that begins with `--` is legitimate single-line content
  // for a tool about CLI/process ideas (`--idea "--apply should be rejected on
  // list"`). The generic value-flag branch must accept it, not fail usage.
  it('--idea with a flag-shaped value is accepted → exit 0 + value present', () => {
    const docPath = tmpCopy('sample-inbox');
    const r = runCli([
      'inbox', 'capture', 'Flag-shaped idea',
      '--idea', '--apply is not a flag here',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    expect(readFileSync(docPath, 'utf8')).toContain('--apply is not a flag here');
  });

  // The dedicated --doc guard must stay strict: --doc with no following token
  // remains a usage error (exit 2), proving the relaxation is scoped to the
  // generic value-flag branch only.
  it('--doc with NO value still → exit 2 (--doc guard intact)', () => {
    expect(runCli(['inbox', 'list', '--doc']).status).toBe(2);
  });

  // AUDIT-BARRAGE claude-01: a value flag must NOT silently swallow a FOLLOWING
  // RECOGNIZED flag of the verb as its value. `--idea --doc <copy> --apply` is an
  // operator who forgot the idea value; the un-fixed scanner parsed
  // values['idea']='--doc', positional[0]='<copy>' (the TITLE slot), --apply
  // boolean, and the doc stayed the DEFAULT — a silent wrong-document write to
  // the DEFAULT doc (not the tmpCopy). AUDIT-20260609-12: the real at-risk file
  // is DEFAULT_DOC, so we override it to an ISOLATED copy via the env seam and
  // assert THAT file is unchanged — a regression can never pollute the committed
  // bundled DESIGN-INBOX.md, and the assertion targets the actually-at-risk file.
  it('--idea swallowing the following --doc flag → exit 2, the DEFAULT doc untouched (claude-01)', () => {
    const isolatedDefault = tmpCopy('sample-inbox');
    const defaultBefore = readFileSync(isolatedDefault, 'utf8');
    const titleSlot = tmpCopy('sample-inbox');
    const prevEnv = process.env.STACKCTL_INBOX_DEFAULT_DOC;
    process.env.STACKCTL_INBOX_DEFAULT_DOC = isolatedDefault;
    try {
      const r = runCli(['inbox', 'capture', '--idea', '--doc', titleSlot, '--apply']);
      expect(r.status).toBe(2);
      // The actually-at-risk file (the resolved default) is byte-for-byte unchanged.
      expect(readFileSync(isolatedDefault, 'utf8')).toBe(defaultBefore);
    } finally {
      if (prevEnv === undefined) delete process.env.STACKCTL_INBOX_DEFAULT_DOC;
      else process.env.STACKCTL_INBOX_DEFAULT_DOC = prevEnv;
    }
  });

  it('--idea swallowing the following --surfaced value flag → exit 2 (claude-01)', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'inbox', 'capture', 'A title', '--idea', '--surfaced', 'today', '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});

describe('stackctl inbox promote / drop verbs (T014)', () => {
  it('promote "<title>" --to <ref> --apply → exit 0, status promoted', () => {
    const docPath = tmpCopy('sample-inbox');
    const r = runCli([
      'inbox', 'promote', 'Try a TUI inbox view',
      '--to', 'multi:gap/inbox-tui', '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const list = runCli(['inbox', 'list', '--doc', docPath]);
    expect(list.stdout).toContain('Try a TUI inbox view [promoted]');
    expect(readFileSync(docPath, 'utf8')).toContain('multi:gap/inbox-tui');
  });

  it('drop "<title>" --reason … --apply → exit 0, status dropped', () => {
    const docPath = tmpCopy('sample-inbox');
    const r = runCli([
      'inbox', 'drop', 'Audit-barrage cost telemetry',
      '--reason', 'folded into the diminishing-returns log', '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const list = runCli(['inbox', 'list', '--doc', docPath]);
    expect(list.stdout).toContain('Audit-barrage cost telemetry [dropped]');
  });

  it('promote missing --to → exit 2, zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['inbox', 'promote', 'Try a TUI inbox view', '--doc', docPath, '--apply']);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('drop missing --reason → exit 2, zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['inbox', 'drop', 'Try a TUI inbox view', '--doc', docPath, '--apply']);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('promote an absent entry → exit 2, zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'inbox', 'promote', 'No such entry', '--to', 'x', '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('promote an already-terminal entry → exit 2, zero write', () => {
    const docPath = tmpCopy('sample-inbox');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'inbox', 'promote', 'Inbox entry pinning', '--to', 'x', '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
