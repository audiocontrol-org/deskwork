// specs/037-instance-observability — T040 (RED-first) — the fail-open guard.
//
// SC-005 / FR-014: With the sidecar/plane UNREACHABLE (no UDS peer bound),
// a stamped emit does NOT slow, block, or fail the three load-bearing
// producers:
//
//   (a) an invocation-telemetry emit via `runInvocationWithTelemetry`
//   (b) session lifecycle verbs (`session-start` / `session-end`)
//   (c) a phase advance (`emitAdvance`, a committed workflow transition)
//
// All three are already built fail-open, so this test likely PASSES on
// arrival (fine — it codifies the cross-cutting invariant). If it FAILS,
// that is a real fail-open regression to flag.
//
// Consolidates three existing fail-open cases into one guard:
//   - T019 (emit-stamps-identity.test.ts): invocation telemetry fail-open
//   - T025 (session-verbs.test.ts): session verb fail-open
//   - T030 (phase-emit.test.ts): phase advance fail-open
//
// Reuses fixture patterns (machine-state harness, workflow fixture).
// NO UDS peer is bound (that is the "unreachable" condition).
// All three producers are tested in a single suite to prove the
// cross-cutting fail-open contract holds uniformly.
//
// Real temp dirs; relative `.js` imports (no `@/`); strict TS
// (no `any`/`as`/`@ts-ignore` per Constitution Principle VI).

import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { useMachineStateStore } from '../fleet/_machine-state-harness.js';
import {
  runInvocationWithTelemetry,
  type InvocationTelemetryOptions,
} from '../../src/telemetry/invocation-telemetry.js';
import * as CurrentSession from '../../src/machine-state/current-session.js';
import { runSessionStartCli } from '../../src/subcommands/session-start.js';
import { runSessionEndCli } from '../../src/subcommands/session-end.js';
import {
  makeWorkflowFixture,
  type WorkflowFixture,
} from '../../src/__tests__/fixtures/workflow/workflow-fixtures.js';
import { loadRoadmap } from '../../src/roadmap/roadmap-model.js';
import { emitAdvance } from '../../src/subcommands/workflow-advance.js';

const IS_WIN = process.platform === 'win32';

function shortTmpBase(): string {
  return IS_WIN ? tmpdir() : '/tmp';
}

const roots: string[] = [];
const fixtures: WorkflowFixture[] = [];

/** A real installation-root dir (locate.ts's realpath.native requires it). */
function makeInstallationRoot(): string {
  const root = mkdtempSync(join(shortTmpBase(), 'scf-failopen-inst-'));
  roots.push(root);
  return root;
}

/** A disposable git fixture for session-end (NEVER the real dev repo). */
function makeGitFixture(): string {
  const ROADMAP = `---
doc-grammar: roadmap
---

# Roadmap

## impl:feature/x
- status: planned
`;
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'scf-failopen-git-')));
  roots.push(repo);
  mkdirSync(join(repo, '.stack-control'), { recursive: true });
  writeFileSync(join(repo, '.stack-control', 'config.yaml'), 'version: 1\n');
  writeFileSync(join(repo, 'ROADMAP.md'), ROADMAP);
  writeFileSync(join(repo, 'DEVELOPMENT-NOTES.md'), '# Development Notes\n\n---\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: repo });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'initial'], { cwd: repo });
  return repo;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const f of fixtures.splice(0)) f.cleanup();
});

describe(
  'FAIL-OPEN guard: all three producers complete promptly and never throw with unreachable sidecar/plane (T040, SC-005/FR-014)',
  () => {
    useMachineStateStore();

    it('(a) invocation-telemetry emit completes without throwing when sidecar is unreachable', async () => {
      const root = makeInstallationRoot();
      const opts: InvocationTelemetryOptions = {
        installationRoot: root,
        // NO socketPath override — resolveLocalSocketPath defaults from the store.
        // The store is redirected to a temp machine-state, so the resolved socket
        // path does not exist — no peer is bound. This is the "unreachable" condition.
      };

      const startTime = Date.now();
      await expect(
        runInvocationWithTelemetry(async () => {
          // A real invocation body.
          await new Promise((r) => setTimeout(r, 10));
        }, [], opts),
      ).resolves.toBeUndefined();
      const elapsed = Date.now() - startTime;

      // Sanity: the emit should NOT have hung waiting for a connect.
      // A multi-second delay would indicate a blocking socket attempt.
      expect(elapsed).toBeLessThan(2000);
    });

    it('(b) session-start completes without throwing when sidecar is unreachable', async () => {
      // NO peer bound — the resolved socket path is unreachable.
      const startTime = Date.now();
      await expect(runSessionStartCli([])).resolves.toBeUndefined();
      const elapsed = Date.now() - startTime;

      // Sanity: should not have blocked on connect.
      expect(elapsed).toBeLessThan(2000);

      // Session-start MUST still mint the record even when unreachable.
      expect(CurrentSession.read()).not.toBeNull();
    });

    it('(b) session-end completes without throwing when sidecar is unreachable', async () => {
      const repo = makeGitFixture();

      // Open a session.
      CurrentSession.mint('session-failopen-end', '2026-07-18T10:00:00Z');

      // NO peer bound — the resolved socket path is unreachable.
      const startTime = Date.now();
      await expect(runSessionEndCli(['--at', repo, '--no-push'])).resolves.toBeUndefined();
      const elapsed = Date.now() - startTime;

      // Sanity: should not have blocked on connect.
      expect(elapsed).toBeLessThan(2000);

      // Session-end MUST still clear the record even when unreachable.
      expect(CurrentSession.read()).toBeNull();
    });

    it('(c) phase advance (committed workflow transition) completes without throwing when sidecar is unreachable', async () => {
      // Use a real workflow fixture with one planned node.
      const f = makeWorkflowFixture(
        [{ identifier: 'multi:feature/test-phase-failopen', status: 'planned' }],
        { git: true },
      );
      fixtures.push(f);
      f.commitAll('baseline');
      const originalCwd = process.cwd();
      process.chdir(f.root);

      try {
        // NO peer bound — the resolved socket path is unreachable.
        // emitAdvance is async (bounded deliver-or-budget wait — T048): AWAIT the
        // returned promise and assert it RESOLVES. A sync `() => ...).not.toThrow()`
        // would let a rejected promise (a real fail-open regression) pass silently.
        const startTime = Date.now();
        await expect(
          emitAdvance('multi:feature/test-phase-failopen', true, {}),
        ).resolves.toBeUndefined();
        const elapsed = Date.now() - startTime;

        // Sanity: should not have blocked on connect.
        expect(elapsed).toBeLessThan(2000);

        // The advance MUST still commit (the real transition took effect).
        const status = loadRoadmap(f.roadmapPath, f.opts).byId.get(
          'multi:feature/test-phase-failopen',
        )?.status;
        expect(status).toBe('in-flight');
      } finally {
        process.chdir(originalCwd);
      }
    });
  },
);
