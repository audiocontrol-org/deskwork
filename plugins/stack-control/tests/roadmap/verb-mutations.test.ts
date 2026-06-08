// T041 (RED-first, US3, 006) — verb advance/decompose/reclassify/defer; dry-run
// by default, --apply writes; validation failure → exit 2, zero write
// (contracts/roadmap-cli.md).

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { fixturePath, ROADMAP_OPTS } from './helpers.js';

function tmpCopy(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'verb-mut-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath(name), docPath);
  return docPath;
}

describe('stackctl roadmap mutation verbs (T041)', () => {
  it('advance --to changes status (--apply); dry-run writes nothing', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    expect(runCli(['roadmap', 'advance', 'impl:feature/b', '--to', 'in-flight', '--doc', docPath]).status).toBe(0);
    expect(readFileSync(docPath, 'utf8')).toBe(before); // dry-run

    expect(
      runCli(['roadmap', 'advance', 'impl:feature/b', '--to', 'in-flight', '--doc', docPath, '--apply']).status,
    ).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/b')!.status).toBe('in-flight');
  });

  it('advance to an out-of-vocabulary status → exit 2, zero write', () => {
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    expect(
      runCli(['roadmap', 'advance', 'impl:feature/b', '--to', 'bogus', '--doc', docPath, '--apply']).status,
    ).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('decompose --into splits and repoints dependents', () => {
    const docPath = tmpCopy('chain');
    const r = runCli([
      'roadmap', 'decompose', 'impl:feature/b',
      '--into', 'impl:feature/b1,impl:feature/b2',
      '--doc', docPath, '--apply',
    ]);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:feature/b')).toBe(false);
    expect(model.byId.get('impl:feature/c')!.dependsOn).toEqual(['impl:feature/b1', 'impl:feature/b2']);
  });

  it('reclassify --to renames the identifier', () => {
    const docPath = tmpCopy('chain');
    const r = runCli(['roadmap', 'reclassify', 'impl:feature/c', '--to', 'impl:gap/c', '--doc', docPath, '--apply']);
    expect(r.status).toBe(0);
    const model = loadRoadmap(docPath, ROADMAP_OPTS);
    expect(model.byId.has('impl:feature/c')).toBe(false);
    expect(model.byId.get('impl:gap/c')!.kind).toBe('gap');
  });

  it('a --prefixed token cannot be consumed as a value flag → exit 2, zero write', () => {
    // `defer <id> --until --apply` must fail usage: the next token is a flag,
    // not a value. Without the guard, `--until` swallows `--apply` (setting the
    // condition to the literal "--apply" and dropping the operator's intended
    // write — the command reports dry-run and exits 0). With the guard it must
    // exit 2 and write nothing (AUDIT-20260608-04).
    const docPath = tmpCopy('chain');
    const before = readFileSync(docPath, 'utf8');
    expect(runCli(['roadmap', 'defer', 'impl:feature/b', '--until', '--apply', '--doc', docPath]).status).toBe(2);
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('defer --until sets and --clear removes the condition', () => {
    const docPath = tmpCopy('chain');
    expect(runCli(['roadmap', 'defer', 'impl:feature/b', '--until', 'after the spike', '--doc', docPath, '--apply']).status).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/b')!.deferredUntil).toBe('after the spike');

    expect(runCli(['roadmap', 'defer', 'impl:feature/b', '--clear', '--doc', docPath, '--apply']).status).toBe(0);
    expect(loadRoadmap(docPath, ROADMAP_OPTS).byId.get('impl:feature/b')!.deferredUntil).toBeNull();
  });
});
