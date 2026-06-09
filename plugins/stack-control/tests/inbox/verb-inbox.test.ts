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
