// T050 (027 residual hygiene, FR-032) — UNIFORM empty/stray-comma handling across
// the four roadmap comma-list flags: `--depends-on` (add), `--part-of` (add),
// `--children` (cluster), and `--into` (decompose). Before this fix the four
// diverged: `--part-of`/`--children` failed loud on a stray/empty id, while
// `--depends-on` silently kept the empty id and `--into` silently dropped it. The
// fix routes all four through one shared parse-or-fail helper so a malformed
// grouping flag is ALWAYS an exit-2 usage error (never a silent drop or a
// fabricated edge). This test pins that uniform contract at the CLI boundary.

import { describe, it, expect } from 'vitest';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { writeTempRoadmap } from './helpers.js';

/** A roadmap with two real items the list-flags can legitimately reference. */
function docWithItems(): string {
  return writeTempRoadmap([
    '## impl:feature/a',
    '- status: planned',
    '',
    '## impl:feature/b',
    '- status: planned',
  ]);
}

/** Build the CLI args for one list-flag carrying `value`, on a fresh doc. */
function argsFor(flag: string, value: string, docPath: string): string[] {
  switch (flag) {
    case '--depends-on':
      return ['roadmap', 'add', 'impl:feature/new', '--depends-on', value, '--doc', docPath, '--apply'];
    case '--part-of':
      return ['roadmap', 'add', 'impl:feature/new', '--part-of', value, '--doc', docPath, '--apply'];
    case '--children':
      return ['roadmap', 'cluster', 'multi:feature/grp', '--children', value, '--doc', docPath, '--apply'];
    case '--into':
      return ['roadmap', 'decompose', 'impl:feature/a', '--into', value, '--doc', docPath, '--apply'];
    default:
      throw new Error(`unknown flag ${flag}`);
  }
}

const LIST_FLAGS = ['--depends-on', '--part-of', '--children', '--into'] as const;

// Stray-comma values (embedded / leading / trailing) yield an empty id AFTER the
// split: a malformed grouping flag the shared `parseListFlag` guard rejects with
// an exit-2 usage error UNIFORMLY across all four flags. Before this fix
// `--depends-on` kept the empty id (exit 1 model error) and `--into` silently
// dropped it (no error) — divergent. They must now all behave identically.
const STRAY_COMMA = ['impl:feature/a,,impl:feature/b', ',impl:feature/a', 'impl:feature/a,'];

describe('027 FR-032 — uniform empty/stray-comma guard across roadmap list-flags', () => {
  for (const flag of LIST_FLAGS) {
    for (const value of STRAY_COMMA) {
      it(`${flag} ${JSON.stringify(value)} → exit 2 (empty-id usage error)`, () => {
        const r = runCli(argsFor(flag, value, docWithItems()));
        expect(r.status).toBe(2);
        expect(r.stderr).toMatch(/empty id/i);
      });
    }
  }

  // A bare empty value `""` is uniformly rejected one layer earlier by the shared
  // option adapter (`stringOption` — non-empty required-value contract) for every
  // list-flag: exit 1 with the same "non-empty string value" message. The point is
  // uniformity — all four reject it identically, none silently accepts it.
  for (const flag of LIST_FLAGS) {
    it(`${flag} "" → exit 1 (uniform non-empty-value rejection)`, () => {
      const r = runCli(argsFor(flag, '', docWithItems()));
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/non-empty string value/i);
    });
  }

  // A clean single id (no stray commas) must still succeed for every flag.
  // AUDIT-20260621-51: `--into` (decompose) creates the child id, so it must be a
  // NEW id, not the target `impl:feature/a` itself (a self-decompose duplicate /
  // self-cycle would exit non-zero). The other flags reference an EXISTING id.
  for (const flag of LIST_FLAGS) {
    it(`${flag} with a clean id succeeds (exit 0)`, () => {
      const cleanValue = flag === '--into' ? 'impl:feature/child' : 'impl:feature/a';
      const r = runCli(argsFor(flag, cleanValue, docWithItems()));
      expect(r.status).toBe(0);
    });
  }
});
