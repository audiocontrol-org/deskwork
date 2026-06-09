// T019 (RED-first, US3, 007) — the single-mechanism outcome (FR-011 / SC-004):
// once native capture ships, the interim convention is retired so exactly one
// capture mechanism and one inbox source of truth remain. Asserts the interim
// rule + the docs-tree pointer are gone, the discipline's new home (the inbox
// SKILL) exists, and no `.claude/rules/` doc still instructs hand-appending.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// tests/inbox → stack-control → plugins → repo root.
const REPO_ROOT = resolve(here, '..', '..', '..', '..');
const PLUGIN_ROOT = resolve(here, '..', '..');

describe('insight-capture retirement of the interim convention (T019)', () => {
  it('the interim rule .claude/rules/design-inbox.md is removed', () => {
    expect(existsSync(join(REPO_ROOT, '.claude', 'rules', 'design-inbox.md'))).toBe(false);
  });

  it('the docs-tree pointer is removed', () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          'docs',
          '1.0',
          '001-IN-PROGRESS',
          'pluggable-lifecycle-providers',
          'design-inbox.md',
        ),
      ),
    ).toBe(false);
  });

  it('the discipline has a new home: the inbox SKILL', () => {
    expect(existsSync(join(PLUGIN_ROOT, 'skills', 'inbox', 'SKILL.md'))).toBe(true);
  });

  it('no .claude/rules/ doc still instructs hand-appending to the inbox', () => {
    const rulesDir = join(REPO_ROOT, '.claude', 'rules');
    const offenders: string[] = [];
    for (const name of readdirSync(rulesDir)) {
      if (!name.endsWith('.md')) continue;
      const text = readFileSync(join(rulesDir, name), 'utf8');
      // The retired rule's distinctive hand-append instruction.
      if (text.includes('Capture is instant and append-only')) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
