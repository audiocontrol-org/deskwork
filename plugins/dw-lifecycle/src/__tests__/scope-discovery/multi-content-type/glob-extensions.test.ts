/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/multi-content-type/glob-extensions.test.ts
 *
 * Phase 11 Task 13 — file-walker extension support.
 *
 * Asserts that the scan engine's two walkers (`listFilesMatching` in
 * `util/glob.ts` and `walkSourceFiles` in `discovery-agents/shared.ts`)
 * traverse every content-type extension Phase 11 promises:
 *
 *   - .ts / .tsx           (existing)
 *   - .md / .markdown      (NEW)
 *   - .css / .scss         (NEW)
 *   - .html / .htm         (NEW)
 *   - .yaml / .yml         (NEW)
 *   - .json                (NEW)
 *
 * The walker itself was already content-agnostic in shape — the gap was
 * that callers defaulted to `.ts/.tsx`. These tests pin the new
 * behavior by exercising the walker with an explicit `extensions` set.
 *
 * Per testing.md: "Use fixture project trees on disk, never mock the
 * filesystem." Each test builds a tmpdir tree, walks it, asserts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  globToRegex,
  listFilesMatching,
  toPosix,
} from '../../../scope-discovery/util/glob.js';
import { walkSourceFiles } from '../../../scope-discovery/discovery-agents/shared.js';

const SCANNED_ALL: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.md',
  '.markdown',
  '.css',
  '.scss',
  '.html',
  '.htm',
  '.yaml',
  '.yml',
  '.json',
]);

const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  '.turbo',
  'coverage',
  '.next',
  '__snapshots__',
]);

interface FixtureFile {
  readonly path: string; // POSIX-style, relative to root
  readonly content: string;
}

async function buildFixture(root: string, files: ReadonlyArray<FixtureFile>): Promise<void> {
  for (const file of files) {
    const abs = resolve(root, file.path);
    const lastSlash = abs.lastIndexOf('/');
    if (lastSlash >= 0) {
      await mkdir(abs.slice(0, lastSlash), { recursive: true });
    }
    await writeFile(abs, file.content, 'utf8');
  }
}

describe('Phase 11 Task 13 — file walker extension support', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'multi-content-type-walker-'));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('listFilesMatching walks every supported extension with a matching glob', async () => {
    const fixture: FixtureFile[] = [
      { path: 'src/a.ts', content: 'export const a = 1;' },
      { path: 'src/a.tsx', content: 'export const A = () => null;' },
      { path: 'src/a.md', content: '# heading' },
      { path: 'src/a.markdown', content: '# heading' },
      { path: 'src/a.css', content: '.foo { color: red; }' },
      { path: 'src/a.scss', content: '$x: red;' },
      { path: 'src/a.html', content: '<p>hi</p>' },
      { path: 'src/a.htm', content: '<p>hi</p>' },
      { path: 'src/a.yaml', content: 'a: 1' },
      { path: 'src/a.yml', content: 'a: 1' },
      { path: 'src/a.json', content: '{"a":1}' },
      // Files that MUST NOT match (excluded extensions / skip dirs).
      { path: 'src/a.txt', content: 'plain text' },
      { path: 'node_modules/foo.md', content: '# nested in skipdir' },
      { path: 'dist/bundle.js', content: 'bundled' },
    ];
    await buildFixture(tmp, fixture);
    const matches = await listFilesMatching(
      tmp,
      [globToRegex('src/**/*')],
      SKIP_DIRS,
      SCANNED_ALL,
    );
    const rels = matches
      .map((abs) => toPosix(abs.slice(tmp.length + 1)))
      .sort();
    expect(rels).toEqual([
      'src/a.css',
      'src/a.htm',
      'src/a.html',
      'src/a.json',
      'src/a.markdown',
      'src/a.md',
      'src/a.scss',
      'src/a.ts',
      'src/a.tsx',
      'src/a.yaml',
      'src/a.yml',
    ]);
  });

  it('listFilesMatching honors the extension filter (e.g., markdown-only)', async () => {
    const fixture: FixtureFile[] = [
      { path: 'src/a.ts', content: 'x' },
      { path: 'src/a.md', content: 'x' },
      { path: 'src/sub/b.markdown', content: 'x' },
      { path: 'src/c.css', content: 'x' },
    ];
    await buildFixture(tmp, fixture);
    const matches = await listFilesMatching(
      tmp,
      [globToRegex('src/**/*')],
      SKIP_DIRS,
      new Set(['.md', '.markdown']),
    );
    const rels = matches.map((abs) => toPosix(abs.slice(tmp.length + 1))).sort();
    expect(rels).toEqual(['src/a.md', 'src/sub/b.markdown']);
  });

  it('walkSourceFiles defaults to .ts/.tsx (back-compat)', async () => {
    const fixture: FixtureFile[] = [
      { path: 'a.ts', content: 'x' },
      { path: 'a.tsx', content: 'x' },
      { path: 'a.md', content: 'x' },
      { path: 'a.css', content: 'x' },
    ];
    await buildFixture(tmp, fixture);
    const files = await walkSourceFiles({ rootAbs: tmp, repoRoot: tmp });
    expect([...files].sort()).toEqual(['a.ts', 'a.tsx']);
  });

  it('walkSourceFiles honors an explicit extensions set (markdown + yaml + json)', async () => {
    const fixture: FixtureFile[] = [
      { path: 'docs/a.md', content: 'x' },
      { path: 'config/b.yaml', content: 'x' },
      { path: 'config/c.yml', content: 'x' },
      { path: 'config/d.json', content: '{}' },
      { path: 'src/e.ts', content: 'x' },
    ];
    await buildFixture(tmp, fixture);
    const files = await walkSourceFiles({
      rootAbs: tmp,
      repoRoot: tmp,
      extensions: ['.md', '.yaml', '.yml', '.json'],
    });
    expect([...files].sort()).toEqual([
      'config/b.yaml',
      'config/c.yml',
      'config/d.json',
      'docs/a.md',
    ]);
  });

  it('walkSourceFiles skips node_modules / dist / coverage even when extensions match', async () => {
    const fixture: FixtureFile[] = [
      { path: 'src/a.css', content: 'x' },
      { path: 'node_modules/lib.css', content: 'x' },
      { path: 'dist/bundle.css', content: 'x' },
      { path: 'coverage/index.html', content: 'x' },
    ];
    await buildFixture(tmp, fixture);
    const files = await walkSourceFiles({
      rootAbs: tmp,
      repoRoot: tmp,
      extensions: ['.css', '.html'],
    });
    expect([...files].sort()).toEqual(['src/a.css']);
  });

  it('matches a content-type-specific glob across nested directories', async () => {
    const fixture: FixtureFile[] = [
      { path: 'docs/intro.md', content: '# intro' },
      { path: 'docs/sub/howto.md', content: '# howto' },
      { path: 'src/a.ts', content: 'x' },
    ];
    await buildFixture(tmp, fixture);
    const matches = await listFilesMatching(
      tmp,
      [globToRegex('docs/**/*.md')],
      SKIP_DIRS,
      SCANNED_ALL,
    );
    const rels = matches.map((abs) => toPosix(abs.slice(tmp.length + 1))).sort();
    expect(rels).toEqual(['docs/intro.md', 'docs/sub/howto.md']);
  });
});
