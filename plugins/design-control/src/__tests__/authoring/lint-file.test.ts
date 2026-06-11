import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintWireframeFile, runCheckWireframe } from '@/authoring/lint-file';
import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_SAMPLE_PATH } from '@/wireframe-kit/sketch-kit';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Temp wireframe dir seeded with a genuine copy of the shipped kit CSS. */
function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dc-lint-file-'));
  dirs.push(dir);
  copyFileSync(SKETCH_KIT_CSS_PATH, join(dir, 'sketch-kit.css'));
  return dir;
}

const cleanPage =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>WF</title>' +
  '<link rel="stylesheet" href="sketch-kit.css"></head>' +
  '<body class="sk sk-theme-grayscale"><div class="sk-banner">WIREFRAME</div>' +
  '<h1>Entry list</h1></body></html>';

describe('lintWireframeFile', () => {
  it('passes the shipped example wireframe (pin built against its own dir)', () => {
    const result = lintWireframeFile(SKETCH_KIT_SAMPLE_PATH);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes a clean wireframe sitting next to a genuine kit copy', () => {
    const dir = freshDir();
    const file = join(dir, 'change.html');
    writeFileSync(file, cleanPage);
    expect(lintWireframeFile(file).ok).toBe(true);
  });

  it('rejects a wireframe with an inline style (same axis-1 lint, not a parallel path)', () => {
    const dir = freshDir();
    const file = join(dir, 'change.html');
    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
    const result = lintWireframeFile(file);
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('inline-style');
  });

  it('rejects a wireframe whose kit copy is not the shipped bytes (identity pin enforced)', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'sketch-kit.css'), readFileSync(SKETCH_KIT_CSS_PATH, 'utf8') + '\nh1{color:hotpink}');
    const file = join(dir, 'change.html');
    writeFileSync(file, cleanPage);
    const result = lintWireframeFile(file);
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.rule)).toContain('stylesheet-hash-mismatch');
  });

  it('fails loud on a missing file', () => {
    expect(() => lintWireframeFile(join(tmpdir(), 'dc-lint-file-does-not-exist.html'))).toThrow(
      /no such file|does not exist|ENOENT/i,
    );
  });
});

describe('runCheckWireframe (CLI core — exit codes are the bin contract)', () => {
  function capture(): { out: string[]; err: string[]; io: { out(line: string): void; err(line: string): void } } {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l) => out.push(l), err: (l) => err.push(l) } };
  }

  it('exits 0 and reports clean on a passing wireframe', () => {
    const dir = freshDir();
    const file = join(dir, 'change.html');
    writeFileSync(file, cleanPage);
    const { io, out } = capture();
    expect(runCheckWireframe([file], io)).toBe(0);
    expect(out.join('\n')).toMatch(/0 findings/);
  });

  it('exits 1 and prints one line per finding on a failing wireframe', () => {
    const dir = freshDir();
    const file = join(dir, 'change.html');
    writeFileSync(file, cleanPage.replace('<h1>', '<h1 style="color:red">'));
    const { io, err } = capture();
    expect(runCheckWireframe([file], io)).toBe(1);
    expect(err.some((l) => l.includes('inline-style'))).toBe(true);
  });

  it('exits 1 with a descriptive error on a missing file (no fabricated verdict)', () => {
    const { io, err } = capture();
    expect(runCheckWireframe([join(tmpdir(), 'dc-nope.html')], io)).toBe(1);
    expect(err.join('\n')).toMatch(/no such file|does not exist|ENOENT/i);
  });

  it('exits 2 on usage error (no argument / extra arguments)', () => {
    const a = capture();
    expect(runCheckWireframe([], a.io)).toBe(2);
    expect(a.err.join('\n')).toMatch(/usage/i);
    const b = capture();
    expect(runCheckWireframe(['x.html', 'y.html'], b.io)).toBe(2);
  });
});
