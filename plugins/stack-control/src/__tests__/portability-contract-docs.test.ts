import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PLUGIN_ROOT } from './_run-helpers.js';

function read(rel: string): string {
  return readFileSync(resolve(PLUGIN_ROOT, rel), 'utf8');
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
});
