// T081 — cross-cutting CLI-surface invariant (contracts § "each subcommand
// validates its own flags — no flag silently ignored"). Every migrated
// scope-discovery verb must FAIL LOUD on an unknown flag (non-zero exit) rather
// than silently ignore it and do work. This is the invariant the per-verb
// integration tests exercise only indirectly.

import { describe, it, expect } from 'vitest';
import { runCli } from '../_run-helpers.js';

// Every verb the 010 migration registered in cli.ts.
const MIGRATED_VERBS = [
  // US1/US2 — clone detection + disposition lifecycle
  'check-clones',
  'dispose-clone',
  'batch-dispose',
  'refresh-clones-baseline',
  'check-disposition-survivor',
  'check-refactor-preconditions',
  // US3 — discovery
  'scope-inventory',
  'scope-widen',
  // US4 — registry checks
  'check-anti-patterns',
  'check-adopters',
  'check-module-symmetry',
  'check-editor-symmetry',
  'check-deprecations',
  // US5 — dispatch wrapper + validator
  'wrap-prompt',
  'validate-return',
  'validate-scope-discovery',
  // US6 — install / customize / doctor / summary / export
  'install-scope-discovery',
  'customize',
  'scope-doctor',
  'scope-summary',
  'scope-export',
  // US8 — install drift
  'install-drift',
];

const BOGUS_FLAG = '--xyzzy-not-a-real-flag';

describe('migrated subcommand flag validation (no flag silently ignored)', () => {
  for (const verb of MIGRATED_VERBS) {
    it(`${verb} fails loud on an unknown flag`, () => {
      const res = runCli([verb, BOGUS_FLAG]);
      // Fail-loud: an unknown flag must never produce a clean exit-0 success.
      expect(res.status).not.toBe(0);
      // And it must say something on stderr (a fail-loud error, not silent).
      expect(res.stderr.length).toBeGreaterThan(0);
    }, 60_000);
  }
});

// specs/installation-isolation US1 (R2 — Clarification 2026-06-10): the
// repo-root parameter is RETIRED on the state-writing verbs. A legacy
// invocation passing the retired flag hits the verb's EXISTING
// unknown-flag usage error (exit 2, stderr naming the flag) — loud per
// the operator decision, never a silent acceptance that places state.
// Explicit anchoring is expressed ONLY as `--at <dir>` (the installation
// enclosing <dir>).
const RETIRED_REPO_ROOT_VERBS = [
  'audit-barrage',
  'audit-barrage-lift',
  'scope-widen',
  'scope-inventory',
  'slush-findings',
];

describe('retired --repo-root on state-writing verbs (installation-isolation R2)', () => {
  for (const verb of RETIRED_REPO_ROOT_VERBS) {
    it(`${verb} rejects --repo-root with the unknown-flag usage error`, () => {
      const res = runCli([verb, '--repo-root', '/tmp']);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain('--repo-root');
      expect(res.stderr).toMatch(/unknown flag|unknown arg|unexpected argument/i);
    }, 60_000);
  }
});
