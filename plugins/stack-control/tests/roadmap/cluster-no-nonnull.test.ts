// T047 (027 residual hygiene, FR-030) — guard that cluster.test.ts contains NO
// TypeScript non-null `!` assertions. The project bans `!` (no non-null assertions
// — .claude/CLAUDE.md "Never bypass typing"); cluster.test.ts must use the local
// get-or-throw `item()` helper instead. This test reads cluster.test.ts as text and
// fails if any postfix non-null assertion survives.
//
// The match is deliberately narrow: a non-null assertion is a `!` immediately
// following an identifier char, `)`, or `]` (i.e. used as a postfix operator),
// and NOT part of `!=` / `!==` (inequality) and NOT a leading `!` (logical not).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Postfix `!` after an ident / `)` / `]`, not followed by `=` (rules out `!=`/`!==`). */
const NON_NULL_ASSERTION = /[\w$)\]]!(?!=)/g;

describe('027 FR-030 — cluster.test.ts is free of non-null `!` assertions', () => {
  it('contains no postfix non-null `!` assertions', () => {
    const src = readFileSync(join(here, 'cluster.test.ts'), 'utf8');
    // Strip the one comment line that legitimately mentions `!` in prose so the
    // scanner asserts on CODE, not on the doc-comment describing this very ban.
    const codeOnly = src
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//') && !line.trimStart().startsWith('*'))
      .join('\n');
    const matches = codeOnly.match(NON_NULL_ASSERTION) ?? [];
    expect(matches).toEqual([]);
  });
});
