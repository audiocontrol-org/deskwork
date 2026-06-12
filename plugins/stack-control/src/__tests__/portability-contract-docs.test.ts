import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PLUGIN_ROOT } from './_run-helpers.js';

function read(rel: string): string {
  return readFileSync(resolve(PLUGIN_ROOT, rel), 'utf8');
}

const REPO_ROOT = resolve(dirname(PLUGIN_ROOT), '..');

function readRepo(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

describe('portability-facing docs and skills', () => {
  it('front-door skills do not require an interactive Claude Code session', () => {
    const files = [
      'skills/define/SKILL.md',
      'skills/extend/SKILL.md',
      'skills/execute/SKILL.md',
    ];
    for (const file of files) {
      expect(read(file)).not.toContain('interactive Claude Code session');
    }
  });

  it('stable backlog user contract does not require backlog.md references', () => {
    const files = ['skills/backlog/SKILL.md', 'README.md'];
    for (const file of files) {
      expect(read(file)).not.toContain('backlog.md');
    }
  });

  it('deprecated repo-wide feature workflow docs redirect to stack-control', () => {
    expect(readRepo('AGENTS.md')).toContain('old repo-wide `.agents/skills/feature-*` workflow is deprecated');
    expect(readRepo('README.md')).toContain('old repo-wide feature lifecycle skills are deprecated');
    expect(readRepo('.agents/skills/feature-help/SKILL.md')).toContain('deprecated');
    expect(readRepo('.agents/skills/feature-help/SKILL.md')).toContain('stack-control');
    expect(readRepo('.agents/skills/feature-define/SKILL.md')).toContain('DEPRECATED');
    expect(readRepo('.agents/skills/release/SKILL.md')).toContain('DEPRECATED');
  });
});
