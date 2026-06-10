/**
 * plugins/stack-control/src/__tests__/scope-discovery/refactor-preconditions.gate-mode.test.ts
 *
 * `--gate-mode` flag on check-refactor-preconditions (ported from
 * dw-lifecycle, 010 US2):
 *
 *   (a) Without --gate-mode: precondition failures present → exits 0
 *       (informational mode); the failure detail is reported on stderr.
 *   (b) With --gate-mode: precondition failures present → exits 1
 *       (hook-friendly mode).
 *
 * Subprocess-based — the gate-mode flag only changes `main()`'s exit
 * code. Each invocation passes an explicit `--baseline` (absolute yaml
 * path) so the gate uses the override and does NOT need a `.stack-control`
 * installation.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runScannerSubprocess } from './util/run-scanner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(HERE, '..', '..', 'cli.ts');

/** Plant a clones.yaml that names a refactor marker but is missing the
 * referenced clone-group id — the gate will report a precondition
 * failure (marker names id not in baseline). */
async function planFailingFixture(label: string) {
  const dir = await mkdtemp(join(tmpdir(), `sc-rfp-gate-${label}-`));
  const yamlPath = join(dir, 'clones.yaml');
  await writeFile(
    yamlPath,
    [
      'generated_at: 2026-05-25T00:00:00.000Z',
      'clones: []',
      '',
    ].join('\n'),
    'utf8',
  );
  return { dir, yamlPath };
}

const COMMIT_MSG_WITH_MARKER =
  'feat(scope-discovery): extract shared parser\n\n' +
  'Closes clones.yaml aaaaaaaaaaaa\n';

async function runGateSubprocess(
  yamlPath: string,
  commitMsg: string,
  extra: readonly string[] = [],
) {
  return runScannerSubprocess(
    CLI_ENTRY,
    [
      'check-refactor-preconditions',
      '--commit-msg',
      commitMsg,
      '--baseline',
      yamlPath,
      '--skip-test-run',
      ...extra,
    ],
  );
}

describe('check-refactor-preconditions — --gate-mode flag', () => {
  it('without --gate-mode: precondition failure → exit 0, failure detail on stderr', async () => {
    const fixture = await planFailingFixture('informational');
    try {
      const run = await runGateSubprocess(
        fixture.yamlPath,
        COMMIT_MSG_WITH_MARKER,
      );
      expect(
        run.code,
        `informational default should exit 0 on precondition failure; stderr=${run.stderr}`,
      ).toBe(0);
      // Failure detail must still be reported.
      expect(run.stderr).toContain('aaaaaaaaaaaa');
      expect(run.stderr).toContain('refactor marker');
    } finally {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  });

  it('with --gate-mode: precondition failure → exit 1, failure detail on stderr', async () => {
    const fixture = await planFailingFixture('gated');
    try {
      const run = await runGateSubprocess(
        fixture.yamlPath,
        COMMIT_MSG_WITH_MARKER,
        ['--gate-mode'],
      );
      expect(run.code).toBe(1);
      expect(run.stderr).toContain('aaaaaaaaaaaa');
    } finally {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  });

  it('non-marker commit: --gate-mode has no effect (silent + exit 0)', async () => {
    const fixture = await planFailingFixture('no-marker');
    try {
      const run = await runGateSubprocess(
        fixture.yamlPath,
        'feat: an ordinary commit with no refactor marker\n',
        ['--gate-mode'],
      );
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
    } finally {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  });
});
