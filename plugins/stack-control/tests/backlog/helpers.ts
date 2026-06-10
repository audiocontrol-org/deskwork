// T004 (008) — shared scaffolding for the backlog suite. Mirrors
// tests/inbox/helpers.ts. Fixtures live on disk; never mock the filesystem
// (.claude/rules/testing.md). The backlog suite exercises the REAL `backlog`
// binary against an isolated tmp dir, so `tmpBacklog()` provisions a working
// backlog project (a copy of the committed `backlog/config.yml`) the binary can
// operate on without a full `backlog init` or a git repo — verified hands-on at
// backlog.md 1.46.0 (a hand-authored `filesystem_only: true` config is enough).

import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = resolve(here, 'fixtures');
export const PLUGIN_ROOT = resolve(here, '..', '..');
/** The committed backlog.md config the dogfood pile uses (T002). Relocated to
 *  the default `.stack-control/backlog` layout when stack-control adopted its
 *  own per-plugin installation. */
export const COMMITTED_CONFIG = resolve(PLUGIN_ROOT, '.stack-control', 'backlog', 'config.yml');

export { runCli } from '../../src/__tests__/_run-helpers.js';

/** Absolute path to a committed fixture file under tests/backlog/fixtures. */
export function fixturePath(name: string): string {
  return join(FIXTURES, name);
}

/**
 * Provision an isolated backlog project in a fresh tmp dir and return its root.
 * The real `backlog` binary, run with `cwd` = this dir, finds `backlog/config.yml`
 * and operates on `backlog/tasks/` under it. No git repo and no `backlog init`
 * are required (filesystem_only config).
 */
export function tmpBacklog(): string {
  const root = mkdtempSync(join(tmpdir(), 'backlog-'));
  mkdirSync(join(root, 'backlog'), { recursive: true });
  copyFileSync(COMMITTED_CONFIG, join(root, 'backlog', 'config.yml'));
  return root;
}
