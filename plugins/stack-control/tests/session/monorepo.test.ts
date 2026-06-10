// 011 T025 (RED-first) — monorepo isolation: with two installations at distinct
// subtrees, a verb resolves the NEAREST enclosing installation and leaves the
// sibling untouched; `--at <other>` orients on the other (FR-015/SC-009). US3.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';

const ROADMAP = `---
doc-grammar: roadmap
---

# RM

## impl:feature/x
- status: planned
`;

const made: string[] = [];
afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

function mkInstallationAt(root: string, sub: string): string {
  const dir = join(root, sub);
  mkdirSync(join(dir, '.stack-control'), { recursive: true });
  writeFileSync(join(dir, '.stack-control', 'config.yaml'), 'version: 1\n');
  writeFileSync(join(dir, 'ROADMAP.md'), ROADMAP);
  writeFileSync(join(dir, 'DEVELOPMENT-NOTES.md'), '# Development Notes\n\n---\n');
  return dir;
}

describe('monorepo isolation', () => {
  it('resolves the nearest enclosing installation; sibling files untouched', () => {
    // realpath: on macOS tmpdir() is the /var -> /private/var symlink; the
    // resolver canonicalizes installationRoot, so compare against canonical paths.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'sc-mono-')));
    made.push(root);
    const a = mkInstallationAt(root, 'a');
    const b = mkInstallationAt(root, 'b');
    const bBefore = readFileSync(join(b, 'DEVELOPMENT-NOTES.md'), 'utf8');

    const r = runCli(['session-start', '--json'], { cwd: a });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).installationRoot).toBe(a);
    // sibling b untouched (session-start is read-only anyway)
    expect(readFileSync(join(b, 'DEVELOPMENT-NOTES.md'), 'utf8')).toBe(bBefore);
  });

  it('--at <other> orients on the other installation', () => {
    // realpath: on macOS tmpdir() is the /var -> /private/var symlink; the
    // resolver canonicalizes installationRoot, so compare against canonical paths.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'sc-mono-')));
    made.push(root);
    const a = mkInstallationAt(root, 'a');
    const b = mkInstallationAt(root, 'b');

    const r = runCli(['session-start', '--at', b, '--json'], { cwd: a });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).installationRoot).toBe(b);
  });
});
