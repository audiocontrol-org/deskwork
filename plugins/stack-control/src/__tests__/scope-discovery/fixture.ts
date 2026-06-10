// Shared tmp-fixture builder for the scope-discovery migration tests (T003).
//
// Builds a throwaway directory tree on disk containing one or more
// stack-control installations (each a dir carrying its own
// `.stack-control/config.yaml`), so the per-codebase boundary resolver and
// the clone detector can be exercised against REAL files (project rule:
// never mock the filesystem — use fixture trees on disk).
//
// The builder is intentionally minimal and composable: callers create a root,
// add installations, and write source files (including a helper that plants an
// identical ≥N-line block into two files to manufacture a deterministic clone).

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/** A built fixture tree. Call `cleanup()` in a `finally` to remove it. */
export interface Fixture {
  /** Absolute path to the throwaway root (parent of all installations). */
  readonly root: string;
  /**
   * Create a stack-control installation at `rel` (relative to the fixture
   * root) by writing `<rel>/.stack-control/config.yaml`. Returns its absolute
   * root. `rel === '.'` installs at the fixture root itself.
   */
  install(rel: string, configBody?: string): string;
  /** Write `content` to `<root>/<rel>`, creating parent dirs. Returns abs path. */
  writeFile(rel: string, content: string): string;
  /**
   * Plant an identical block into two files so jscpd reports exactly one clone
   * pair. `lines` controls block size (default 20 — comfortably above jscpd's
   * default min-tokens threshold). Each file gets a unique prefix/suffix so
   * only the shared block duplicates.
   */
  plantClone(relA: string, relB: string, lines?: number): void;
  /** Remove the whole fixture tree. */
  cleanup(): void;
}

/** Default minimal installation config — the marker the boundary resolver walks to. */
const DEFAULT_CONFIG = 'version: 1\n';

export function makeFixture(prefix = 'sd-fixture-'): Fixture {
  const root = mkdtempSync(join(tmpdir(), prefix));

  const writeFile = (rel: string, content: string): string => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    return abs;
  };

  const install = (rel: string, configBody = DEFAULT_CONFIG): string => {
    const instRoot = rel === '.' ? root : join(root, rel);
    mkdirSync(join(instRoot, '.stack-control'), { recursive: true });
    writeFileSync(join(instRoot, '.stack-control', 'config.yaml'), configBody);
    return instRoot;
  };

  const plantClone = (relA: string, relB: string, lines = 20): void => {
    const block = sharedBlock(lines);
    writeFile(relA, `// file A head\nexport const aHead = 1;\n${block}\n// file A tail\n`);
    writeFile(relB, `// file B head\nexport const bHead = 2;\n${block}\n// file B tail\n`);
  };

  const cleanup = (): void => {
    rmSync(root, { recursive: true, force: true });
  };

  return { root, install, writeFile, plantClone, cleanup };
}

/**
 * A deterministic, syntactically-plausible TypeScript block of `lines`
 * statements. Identical text in two files = one clone pair under jscpd.
 */
export function sharedBlock(lines: number): string {
  const out: string[] = ['export function sharedComputation(input: number): number {'];
  for (let i = 0; i < lines; i += 1) {
    out.push(`  const step${i} = input * ${i + 1} + ${i};`);
  }
  out.push('  return step0;');
  out.push('}');
  return out.join('\n');
}
