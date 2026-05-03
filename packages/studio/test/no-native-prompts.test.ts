/**
 * #166 Phase 34b — production code must never call `window.prompt`,
 * `window.confirm`, or `window.alert` directly. Native browser dialogs
 * are unstyleable, can't be keyboard-driven consistently, and block
 * the JS thread in ways that interact badly with the studio's polling
 * + toast layers.
 *
 * Replacements:
 *   - `window.prompt`  → inline composer (server-rendered, client
 *                        wires) OR `inline-prompt.ts` helper.
 *   - `window.confirm` → `inlineConfirm` from `entry-review/inline-prompt.ts`.
 *   - `window.alert`   → toast (when a `[data-toast]` element is
 *                        mounted on the surface) OR `console.error`
 *                        as a final fallback.
 *
 * This test pins the rule so a regression gets caught at unit-test
 * time, not at operator-walk time.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');

function gitGrepCalls(): string[] {
  // Match actual call sites (open paren after the method name) so docs
  // comments referencing the legacy pattern don't false-positive.
  // Excludes test code (which still touches these for fixtures).
  try {
    const out = execSync(
      [
        'git',
        '-C',
        REPO_ROOT,
        'grep',
        '-n',
        '-E',
        // eslint-disable-next-line no-useless-escape
        '"window\\.(prompt|confirm|alert)\\("',
        '--',
        'plugins/deskwork-studio/public/src/',
        'packages/studio/src/',
        'packages/cli/src/',
        'packages/core/src/',
      ].join(' '),
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return out
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .filter((line) => !/\.test\.|\/test\//.test(line))
      // Exclude doc comments mentioning the legacy pattern (lines where
      // the match is inside a JS comment, marked by `*` or `//` before
      // `window.`). Real call sites have `window.` at column position 0
      // through whitespace and an opening identifier or assignment.
      .filter((line) => {
        // line shape is `path:lineno:source` (git grep -n).
        const colon = line.indexOf(':', line.indexOf(':') + 1);
        if (colon < 0) return true;
        const source = line.slice(colon + 1);
        const matchIdx = source.search(/window\.(prompt|confirm|alert)\(/);
        if (matchIdx < 0) return true;
        const before = source.slice(0, matchIdx);
        // If the prefix contains `//`, `*`, or backtick/quote (string
        // literal mentioning the API), it's documentation, not a call.
        return !/(\/\/|\*|`|"|')/.test(before);
      });
  } catch (err) {
    // git grep exits 1 when there are no matches — that's the success case.
    const status = (err as { status?: number }).status;
    if (status === 1) return [];
    throw err;
  }
}

describe('no native browser dialogs in production code (#166)', () => {
  it('git grep finds zero `window.(prompt|confirm|alert)(` call sites', () => {
    const matches = gitGrepCalls();
    if (matches.length > 0) {
      throw new Error(
        `Found ${matches.length} native browser dialog call(s):\n` +
          matches.map((m) => `  ${m}`).join('\n') +
          '\n\nReplacements:\n' +
          '  window.prompt  → inline composer / inlineConfirm.\n' +
          '  window.confirm → inlineConfirm from entry-review/inline-prompt.ts.\n' +
          '  window.alert   → toast (data-toast element) or console.error.',
      );
    }
    expect(matches).toEqual([]);
  });
});
