// T041 — per-codebase adopter-manifest gate (010 / US4, FR-021, SC-008).
//
// Drives the ported `main()` in-process against ON-DISK `.stack-control`
// installation fixtures. A non-importing file in an adopter glob is flagged as
// a holdout; declared exceptions and tracked-holdouts are honored (gate-
// passing). Per-codebase resolution is exercised by invoking the verb with cwd
// inside the installation and writing the registry under the installation's
// scope dir.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { main } from '../../scope-discovery/check-adopters.js';

const SCOPE_REL = '.stack-control/scope-discovery';

interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function run(argv: string[], cwd: string): Promise<Captured> {
  let stdout = '';
  let stderr = '';
  const outSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stdout += chunk.toString();
      return true;
    });
  const errSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array): boolean => {
      stderr += chunk.toString();
      return true;
    });
  try {
    const code = await main(argv, cwd);
    return { code, stdout, stderr };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

function writeRegistry(root: string, yaml: string): void {
  const abs = join(root, SCOPE_REL, 'adopter-manifests.yaml');
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, yaml);
}

const ADOPTER = `@/lib/canonical-thing`;
const IMPORTING = `import { thing } from '${ADOPTER}';\nexport const x = thing;\n`;
const NOT_IMPORTING = `export const y = 2;\n`;

function manifest(extra = ''): string {
  return `adopter_manifests:
  - id: canonical-thing
    introduced_in: deadbeef
    from: '${ADOPTER}'
    expected_adopters_glob:
      - 'src/features/**/*.ts'
    message: |
      Import { thing } from ${ADOPTER}.
${extra}`;
}

describe('check-adopters — per-codebase gate (T041)', () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it('absent registry is a clean no-op (exit 0) — config-activated (SC-008)', async () => {
    fx = makeFixture('ad-absent-');
    const root = fx.install('.');
    fx.writeFile('src/features/a.ts', NOT_IMPORTING);
    const r = await run([], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
  });

  it('empty registry is a clean no-op (exit 0)', async () => {
    fx = makeFixture('ad-empty-');
    const root = fx.install('.');
    writeRegistry(root, 'adopter_manifests: []\n');
    fx.writeFile('src/features/a.ts', NOT_IMPORTING);
    const r = await run([], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
  });

  it('a non-importing file in an adopter glob is flagged as a holdout', async () => {
    fx = makeFixture('ad-holdout-');
    const root = fx.install('.');
    writeRegistry(root, manifest());
    fx.writeFile('src/features/adopter.ts', IMPORTING);
    fx.writeFile('src/features/holdout.ts', NOT_IMPORTING);
    // Informational default exits 0 but reports the holdout.
    const r = await run([], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('holdout.ts');
    expect(r.stdout).not.toContain('1 holdouts across 1 manifest');
    // --gate-mode flips to exit 1 on a real holdout.
    const gated = await run(['--gate-mode'], root);
    expect(gated.code, `stdout=${gated.stdout}`).toBe(1);
    expect(gated.stdout).toContain('holdout.ts');
  });

  it('declared exception suppresses the holdout (gate passes)', async () => {
    fx = makeFixture('ad-exception-');
    const root = fx.install('.');
    writeRegistry(
      root,
      manifest(
        `    exceptions:\n      - path: src/features/holdout.ts\n        reason: legitimately bypasses the primitive\n`,
      ),
    );
    fx.writeFile('src/features/adopter.ts', IMPORTING);
    fx.writeFile('src/features/holdout.ts', NOT_IMPORTING);
    const r = await run(['--gate-mode'], root);
    expect(r.code, `stdout=${r.stdout}; stderr=${r.stderr}`).toBe(0);
  });

  it('tracked-holdout passes the gate but is reported separately', async () => {
    fx = makeFixture('ad-tracked-');
    const root = fx.install('.');
    writeRegistry(
      root,
      manifest(
        `    tracked_holdouts:\n      - path: src/features/holdout.ts\n        issue: '#123'\n        reason: deferred migration\n`,
      ),
    );
    fx.writeFile('src/features/adopter.ts', IMPORTING);
    fx.writeFile('src/features/holdout.ts', NOT_IMPORTING);
    const r = await run(['--gate-mode'], root);
    expect(r.code, `stdout=${r.stdout}; stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('tracked holdout');
  });

  it('per-codebase: a sibling installation is NOT scanned', async () => {
    fx = makeFixture('ad-iso-');
    const a = fx.install('a');
    fx.install('b');
    writeRegistry(a, manifest());
    // The holdout lives in the OTHER codebase (b); a's scan must not reach it.
    fx.writeFile('b/src/features/holdout.ts', NOT_IMPORTING);
    fx.writeFile('a/src/features/adopter.ts', IMPORTING);
    const r = await run(['--gate-mode'], a);
    expect(r.code, `stdout=${r.stdout}; stderr=${r.stderr}`).toBe(0);
  });
});
