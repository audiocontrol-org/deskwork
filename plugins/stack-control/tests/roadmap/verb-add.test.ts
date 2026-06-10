// T025 (RED-first, US2, 006) — `roadmap add <id> [flags] [--apply]`; dry-run by
// default; one-move emergent capture with --part-of + --depends-on; dangling
// target ⇒ exit 2, zero write (contracts/roadmap-cli.md).

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'verb-add-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

describe('stackctl roadmap add verb (T025)', () => {
  it('missing <id> → exit 2', () => {
    const docPath = tmpCopy('chain');
    expect(runCli(['roadmap', 'add', '--doc', docPath]).status).toBe(2);
  });

  it('dry-run (no --apply) previews and writes nothing', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'add', 'impl:gap/z', '--doc', docPath]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('impl:gap/z');
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('--apply captures kind + grouping + dependency in one move', () => {
    const docPath = tmpCopy('chain');
    const r = runCli([
      'roadmap', 'add', 'impl:fix/escaped-pipe',
      '--part-of', 'impl:feature/b',
      '--depends-on', 'design:feature/a',
      '--scope', 'found mid-build',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    const item = model.byId.get('impl:fix/escaped-pipe')!;
    expect(item.kind).toBe('fix');
    expect(item.partOf).toBe('impl:feature/b');
    expect(item.dependsOn).toEqual(['design:feature/a']);
  });

  it('a dangling depends-on → exit 2, zero write', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'add', 'impl:fix/y',
      '--depends-on', 'design:feature/ghost',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('an unknown value flag (--depend-on typo) → exit 2, zero write', () => {
    // AUDIT-20260608-13: a misspelled flag must NOT be silently ignored. The
    // un-guarded scanner accepted `--depend-on` into `values`, addInputFrom read
    // only `depends-on`, and the command SUCCEEDED creating a dependency-less
    // item — a valid-but-wrong roadmap mutation. The guard rejects the unknown
    // flag with exit 2 BEFORE any mutation, writing nothing.
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'add', 'impl:fix/typo',
      '--depend-on', 'design:feature/a',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('a flag-shaped --scope value is accepted → exit 0, item written', () => {
    // AUDIT-BARRAGE codex-02/claude-02: a free-text value beginning with `--` is
    // legitimate single-line content. The generic value-flag branch must accept
    // it rather than fail usage before reaching the mutation layer.
    const docPath = tmpCopy('chain');
    const r = runCli([
      'roadmap', 'add', 'impl:fix/flag-shaped-scope',
      '--scope', '--something descriptive',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.get('impl:fix/flag-shaped-scope')).toBeDefined();
  });

  it('--scope swallowing the following --apply boolean → exit 2, zero write (AUDIT-BARRAGE claude-01)', () => {
    // Symmetry lock for the inbox claude-01 fix on the roadmap verb. `--scope
    // --apply` with no id is an operator who forgot the scope value; swallowing
    // --apply (a recognized boolean) drops their intent. Must exit 2, write
    // nothing. (Already rejected pre-fix; locks the boolean case stays rejected.)
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['roadmap', 'add', '--scope', '--apply', '--doc', docPath]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('--scope swallowing the following --depends-on value flag → exit 2, zero write (claude-01)', () => {
    // The pre-fix scanner only rejected a following recognized BOOLEAN; a
    // following recognized VALUE-flag name (`--depends-on`) was swallowed as the
    // scope value. On the roadmap verb the downstream positional-overflow /
    // strict-id guards happen to catch the resulting shape, so the EXIT is 2 both
    // before and after — this test locks the zero-write symmetry; the genuinely
    // RED silent-wrong-write manifestation is on the inbox verb (verb-inbox.test).
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'add', 'impl:fix/swallow',
      '--scope', '--depends-on', 'design:feature/a',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('a flag-shaped --scope value (NOT a recognized flag) is still accepted → exit 0 (claude-02 preserved)', () => {
    // The claude-01 fix must NOT regress the claude-02 free-text relaxation: a
    // value that begins with `--` but is NOT a recognized flag name of the verb
    // stays legitimate single-line content.
    const docPath = tmpCopy('chain');
    const r = runCli([
      'roadmap', 'add', 'impl:fix/free-text-scope',
      '--scope', '--something free text',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
  });

  it('an unknown boolean flag (--clear on add) → exit 2, zero write', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    const r = runCli([
      'roadmap', 'add', 'impl:fix/w',
      '--clear',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });
});
