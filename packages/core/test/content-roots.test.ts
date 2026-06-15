/**
 * collectContentRoots tests — fixture-based lane configs.
 *
 * `collectContentRoots(projectRoot)` is the c5 (sites→lanes retirement)
 * content-browser discovery helper: the de-duplicated, sorted union of
 * every configured lane's `scaffoldDefaults` directories, resolved to
 * absolute paths. It reuses the doctor's `collectLaneScaffoldDirs`
 * pattern (Decision #21) so the studio content browser walks the same
 * roots the doctor's sidecar index already discovers.
 *
 * Mirrors the project's testing convention: real on-disk fixtures via
 * `mkdtempSync`, no fs mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lanesDir } from '../src/lanes/loader.ts';
import { collectContentRoots } from '../src/content-index.ts';

function writeLane(projectRoot: string, id: string, payload: unknown): void {
  const dir = lanesDir(projectRoot);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(payload, null, 2), 'utf8');
}

describe('collectContentRoots', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-content-roots-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns the absolute, sorted, de-duplicated union of lane scaffoldDefaults', () => {
    writeLane(projectRoot, 'blog', {
      id: 'blog',
      name: 'Blog',
      pipelineTemplate: 'editorial',
      scaffoldDefaults: { markdown: 'src/content/blog' },
    });
    writeLane(projectRoot, 'docs', {
      id: 'docs',
      name: 'Docs',
      pipelineTemplate: 'editorial',
      scaffoldDefaults: { markdown: 'docs' },
    });

    expect(collectContentRoots(projectRoot)).toEqual([
      join(projectRoot, 'docs'),
      join(projectRoot, 'src/content/blog'),
    ]);
  });

  it('de-duplicates when two lanes share the same scaffold directory', () => {
    writeLane(projectRoot, 'one', {
      id: 'one',
      name: 'One',
      pipelineTemplate: 'editorial',
      scaffoldDefaults: { markdown: 'src/content' },
    });
    writeLane(projectRoot, 'two', {
      id: 'two',
      name: 'Two',
      pipelineTemplate: 'editorial',
      scaffoldDefaults: { markdown: 'src/content' },
    });

    expect(collectContentRoots(projectRoot)).toEqual([
      join(projectRoot, 'src/content'),
    ]);
  });

  it('includes every kind directory a lane declares', () => {
    writeLane(projectRoot, 'multi', {
      id: 'multi',
      name: 'Multi',
      pipelineTemplate: 'editorial',
      scaffoldDefaults: { markdown: 'content', image: 'assets/images' },
    });

    expect(collectContentRoots(projectRoot)).toEqual([
      join(projectRoot, 'assets/images'),
      join(projectRoot, 'content'),
    ]);
  });

  it('contributes nothing for a lane with no scaffoldDefaults', () => {
    writeLane(projectRoot, 'bare', {
      id: 'bare',
      name: 'Bare',
      pipelineTemplate: 'editorial',
    });

    expect(collectContentRoots(projectRoot)).toEqual([]);
  });

  it('skips a malformed lane file rather than throwing', () => {
    writeLane(projectRoot, 'good', {
      id: 'good',
      name: 'Good',
      pipelineTemplate: 'editorial',
      scaffoldDefaults: { markdown: 'content' },
    });
    mkdirSync(lanesDir(projectRoot), { recursive: true });
    writeFileSync(join(lanesDir(projectRoot), 'broken.json'), '{ not valid json', 'utf8');

    expect(collectContentRoots(projectRoot)).toEqual([
      join(projectRoot, 'content'),
    ]);
  });

  it('returns an empty list when the project has no lanes', () => {
    expect(collectContentRoots(projectRoot)).toEqual([]);
  });
});
