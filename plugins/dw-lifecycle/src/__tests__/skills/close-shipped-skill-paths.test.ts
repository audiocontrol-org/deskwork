/**
 * Phase 29 Task 4 — regression test for #425 (file-handling rule).
 *
 * close-shipped/SKILL.md previously documented `/tmp/release-notes.md`
 * in the --release-notes-body code path (sibling of #412). Per
 * .claude/rules/file-handling.md § "Never use bare /tmp/<name> paths",
 * two concurrent /release invocations would clobber each other. This
 * test asserts no bare /tmp/<name> paths remain anywhere in the
 * close-shipped SKILL.md.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const SKILL_PATH = resolve(
  HERE,
  '..',
  '..',
  '..',
  '..',
  'skills',
  'close-shipped',
  'SKILL.md',
);

describe('close-shipped/SKILL.md — file-handling rule compliance (#425)', () => {
  it('contains no bare `/tmp/<name>` paths in fenced code blocks', () => {
    const text = readFileSync(SKILL_PATH, 'utf8');
    const lines = text.split('\n');
    const offenders: string[] = [];
    let inCodeBlock = false;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (/^```/.test(line.trim())) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (!inCodeBlock) continue;
      // Match bare /tmp/<name> paths — anything matching /tmp/<identifier>
      // where <identifier> is a filename token (no further path component
      // beyond the first; sub-paths under /tmp/<dir>/ would still trip but
      // are also disallowed by the rule).
      if (/(^|[^A-Za-z0-9_/])\/tmp\/[A-Za-z0-9._-]+/.test(line)) {
        offenders.push(`${i + 1}: ${line}`);
      }
    }
    expect(offenders, `SKILL.md uses bare /tmp/<name> paths in code examples:\n${offenders.join('\n')}`).toEqual([]);
  });
});
