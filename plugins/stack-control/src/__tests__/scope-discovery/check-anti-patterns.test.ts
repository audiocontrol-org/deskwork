// T040 — per-codebase anti-patterns gate (010 / US4, FR-019/020, SC-008).
//
// Drives the ported `main()` in-process against ON-DISK `.stack-control`
// installation fixtures (project rule: never mock the filesystem). Each case
// builds an installation, writes the registry under
// `<root>/.stack-control/scope-discovery/anti-patterns.yaml`, plants source
// files, and invokes the verb with cwd inside the installation so the
// per-codebase registry + scan-root resolution is exercised end-to-end.
//
// Scope: glob/regex/multi-pattern dispatch paths are tested here. The
// ast-grep / ts-morph pattern TYPES are rejected at parse time by the ported
// registry (v1 implements `regex` only — a pattern-handler module for the
// other types is owned by a separate agent and may not exist yet); the
// empty-no-op + regex/multi-pattern assertions below are green regardless.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { makeFixture, type Fixture } from './fixture.js';
import { main } from '../../scope-discovery/check-anti-patterns.js';

const SCOPE_REL = '.stack-control/scope-discovery';

interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run the verb in-process with cwd inside the installation; capture I/O. */
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

/** Write the anti-patterns registry under the installation's scope dir. */
function writeRegistry(root: string, yaml: string): void {
  const abs = join(root, SCOPE_REL, 'anti-patterns.yaml');
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, yaml);
}

const SINGLE_PATTERN = `anti_patterns:
  - id: prompt-fallback-composer
    added_in: deadbeef
    primitive: ScrapbookComposer
    from: '@/components/ScrapbookComposer'
    shape_regex: 'window\\.prompt\\([^)]*new note'
    message: |
      Replace window.prompt() with the ScrapbookComposer overlay.
`;

const MULTI_PATTERN = `anti_patterns:
  - id: slide-drawer-legacy
    added_in: cafef00d
    primitive: useExportDialogLifecycle
    from: '@/hooks/useExportDialogLifecycle'
    shape_regex:
      - 'useState\\(false\\)'
      - 'addEventListener.*keydown'
      - 'onBackdropClick'
    min_distance: 30
    message: |
      Replace the open/close/backdrop trio with useExportDialogLifecycle.
`;

const MATCH_SOURCE = [
  'export function NoteButton() {',
  '  return (',
  '    <button onClick={() => window.prompt("new note title")}>',
  '      + new note',
  '    </button>',
  '  );',
  '}',
  '',
].join('\n');

describe('check-anti-patterns — per-codebase gate (T040)', () => {
  let fx: Fixture;
  afterEach(() => fx?.cleanup());

  it('absent registry is a clean no-op (exit 0) — config-activated (SC-008)', async () => {
    fx = makeFixture('ap-absent-');
    const root = fx.install('.');
    fx.writeFile('src/a.ts', 'export const a = 1;\n');
    const r = await run([], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
  });

  it('empty registry is a clean no-op (exit 0) even with source present', async () => {
    fx = makeFixture('ap-empty-');
    const root = fx.install('.');
    writeRegistry(root, 'anti_patterns: []\n');
    fx.writeFile('src/a.ts', 'export const a = 1;\n');
    const r = await run([], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
  });

  it('seeded single regex entry + matching file surfaces the holdout', async () => {
    fx = makeFixture('ap-single-');
    const root = fx.install('.');
    writeRegistry(root, SINGLE_PATTERN);
    fx.writeFile('src/NoteButton.tsx', MATCH_SOURCE);
    // Informational default: prints the finding but exits 0.
    const r = await run([], root);
    expect(r.code, `stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).toContain('prompt-fallback-composer');
    expect(r.stdout).toContain('ScrapbookComposer');
  });

  it('--gate-mode honors severity: exit 1 when a finding is present (FR-020)', async () => {
    fx = makeFixture('ap-gate-');
    const root = fx.install('.');
    writeRegistry(root, SINGLE_PATTERN);
    fx.writeFile('src/NoteButton.tsx', MATCH_SOURCE);
    const r = await run(['--gate-mode'], root);
    expect(r.code, `stdout=${r.stdout}; stderr=${r.stderr}`).toBe(1);
    expect(r.stdout).toContain('prompt-fallback-composer');
  });

  it('--gate-mode with no matching source still exits 0', async () => {
    fx = makeFixture('ap-gate-clean-');
    const root = fx.install('.');
    writeRegistry(root, SINGLE_PATTERN);
    fx.writeFile('src/Clean.tsx', 'export const Clean = () => null;\n');
    const r = await run(['--gate-mode'], root);
    expect(r.code, `stdout=${r.stdout}`).toBe(0);
  });

  it('multi-pattern fingerprint matches only when all patterns co-occur', async () => {
    fx = makeFixture('ap-multi-');
    const root = fx.install('.');
    writeRegistry(root, MULTI_PATTERN);
    fx.writeFile(
      'src/partial.tsx',
      'const [open, setOpen] = useState(false);\n// no keydown, no backdrop\n',
    );
    fx.writeFile(
      'src/full-match.tsx',
      [
        'const [open, setOpen] = useState(false);',
        "document.addEventListener('keydown', handleEsc);",
        '<Backdrop onBackdropClick={() => setOpen(false)} />;',
        '',
      ].join('\n'),
    );
    const r = await run(['--gate-mode'], root);
    expect(r.code, `stdout=${r.stdout}`).toBe(1);
    expect(r.stdout).toContain('full-match.tsx');
    expect(r.stdout).not.toContain('partial.tsx');
  });

  it('per-codebase: a sibling installation is NOT scanned', async () => {
    fx = makeFixture('ap-iso-');
    const a = fx.install('a');
    fx.install('b');
    writeRegistry(a, SINGLE_PATTERN);
    // The matching file lives in the OTHER codebase (b); a's scan must not reach it.
    fx.writeFile('b/src/NoteButton.tsx', MATCH_SOURCE);
    fx.writeFile('a/src/clean.ts', 'export const a = 1;\n');
    const r = await run(['--gate-mode'], a);
    expect(r.code, `stdout=${r.stdout}; stderr=${r.stderr}`).toBe(0);
    expect(r.stdout).not.toContain('prompt-fallback-composer');
  });

  it('malformed registry exits 2 with a descriptive error', async () => {
    fx = makeFixture('ap-malformed-');
    const root = fx.install('.');
    writeRegistry(
      root,
      'anti_patterns:\n  - id: broken\n    added_in: deadbeef\n    primitive: X\n',
    );
    fx.writeFile('src/a.ts', 'export {};\n');
    const r = await run([], root);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('from');
  });
});
