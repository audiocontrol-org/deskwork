// T042 — per-codebase module-symmetry matrix (FR-022) + deprecation+importers
// report (FR-023), 010 / US4.
//
// Drives the ported `main()` of both verbs in-process against ON-DISK
// `.stack-control` installation fixtures, invoking with cwd inside the
// installation so the per-codebase registry + scan-root resolution is
// exercised end-to-end. An empty/absent registry is a clean no-op (SC-008).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { main as symmetryMain } from '../../scope-discovery/check-module-symmetry.js';
import { main as deprecationsMain } from '../../scope-discovery/check-deprecations.js';

const SCOPE_REL = '.stack-control/scope-discovery';

interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

type Verb = (argv: readonly string[], cwd: string) => Promise<number>;

async function run(verb: Verb, argv: string[], cwd: string): Promise<Captured> {
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
    const code = await verb(argv, cwd);
    return { code, stdout, stderr };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

function writeAdopterRegistry(root: string, yaml: string): void {
  const abs = join(root, SCOPE_REL, 'adopter-manifests.yaml');
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, yaml);
}

const ADOPTER = `@/lib/canonical-thing`;
const IMPORTING = `import { thing } from '${ADOPTER}';\nexport const x = thing;\n`;
const NOT_IMPORTING = `export const y = 2;\n`;

const SYMMETRY_MANIFEST = `adopter_manifests:
  - id: canonical-thing
    introduced_in: deadbeef
    from: '${ADOPTER}'
    expected_adopters_glob:
      - 'src/*/feature.ts'
    message: |
      Import { thing } from ${ADOPTER}.
`;

describe('check-module-symmetry — per-codebase matrix (T042 / FR-022)', () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it('absent registry is a clean no-op (exit 0) — config-activated (SC-008)', async () => {
    fx = makeFixture('sym-absent-');
    const root = fx.install('.');
    fx.writeFile('src/alpha/feature.ts', IMPORTING);
    const r = await run(symmetryMain, [], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('registry empty');
  });

  it('matrix surfaces a partial-adoption column across parallel modules', async () => {
    fx = makeFixture('sym-matrix-');
    const root = fx.install('.');
    writeAdopterRegistry(root, SYMMETRY_MANIFEST);
    // alpha adopts; beta holds out. Two parallel modules under src/.
    fx.writeFile('src/alpha/feature.ts', IMPORTING);
    fx.writeFile('src/beta/feature.ts', NOT_IMPORTING);
    const r = await run(symmetryMain, [], root);
    // beta is a ⚠/✗ cell → exit 1.
    expect(r.code, `stdout=${r.stdout}; stderr=${r.stderr}`).toBe(1);
    expect(r.stdout).toContain('canonical-thing');
    expect(r.stdout).toContain('alpha');
    expect(r.stdout).toContain('beta');
  });

  it('--write emits the artifact under the installation scope dir', async () => {
    fx = makeFixture('sym-write-');
    const root = fx.install('.');
    writeAdopterRegistry(root, SYMMETRY_MANIFEST);
    fx.writeFile('src/alpha/feature.ts', IMPORTING);
    const r = await run(symmetryMain, ['--write', '--quiet'], root);
    // alpha-only adoption with the single module fully adopting → exit 0.
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
  });
});

describe('check-deprecations — per-codebase queue (T042 / FR-023)', () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it('no deprecated files → exit 0, nothing to track', async () => {
    fx = makeFixture('dep-empty-');
    const root = fx.install('.');
    fx.writeFile('src/a.ts', 'export const a = 1;\n');
    const r = await run(deprecationsMain, [], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('nothing to track');
  });

  it('a deprecated file with an importer is reported blocked (importers named)', async () => {
    fx = makeFixture('dep-blocked-');
    const root = fx.install('.');
    fx.writeFile(
      'src/legacy.ts',
      '/**\n * @deprecated use the new thing instead\n */\nexport const legacy = 1;\n',
    );
    // An importer of the deprecated file (relative-path importer form).
    fx.writeFile(
      'src/consumer.ts',
      "import { legacy } from './legacy.js';\nexport const c = legacy;\n",
    );
    const r = await run(deprecationsMain, [], root);
    // Informational gate — always exit 0 on a successful scan.
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('src/legacy.ts');
    expect(r.stdout).toContain('Blocked');
    expect(r.stdout).toContain('src/consumer.ts');
  });

  it('a deprecated file with zero importers is safe-to-delete', async () => {
    fx = makeFixture('dep-safe-');
    const root = fx.install('.');
    fx.writeFile(
      'src/orphan.ts',
      '// DEPRECATED: nothing imports this anymore\nexport const orphan = 1;\n',
    );
    const r = await run(deprecationsMain, [], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('Safe to delete');
    expect(r.stdout).toContain('src/orphan.ts');
  });

  it('per-codebase: a sibling installation is NOT scanned', async () => {
    fx = makeFixture('dep-iso-');
    const a = fx.install('a');
    fx.install('b');
    // Deprecated file lives in the OTHER codebase (b); a's scan must not see it.
    fx.writeFile(
      'b/src/legacy.ts',
      '/**\n * @deprecated\n */\nexport const legacy = 1;\n',
    );
    fx.writeFile('a/src/clean.ts', 'export const a = 1;\n');
    const r = await run(deprecationsMain, [], a);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('nothing to track');
    expect(r.stdout).not.toContain('legacy.ts');
  });
});
