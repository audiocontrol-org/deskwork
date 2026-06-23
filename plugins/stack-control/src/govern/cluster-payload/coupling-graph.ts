// 030 cluster-payload — build coupling edges over the governedSha..HEAD changed
// file set (FR-003). Universal baseline = directory-adjacency + diff
// cross-reference (language-agnostic); the TypeScript import graph is an
// additional precision signal added only when present, never required.
// Implemented in Phase 3 (T016).

/** The provenance of a coupling edge (R1 signals). */
export type CouplingSignal = 'dir' | 'diff-xref' | 'ts-import' | 'test-source';

/** A directed coupling edge between two changed files, with its signal provenance. */
export interface CouplingEdge {
  readonly from: string;
  readonly to: string;
  readonly signal: CouplingSignal;
}

/** The coupling graph over the changed-file set. */
export interface CouplingGraph {
  readonly files: readonly string[];
  readonly edges: readonly CouplingEdge[];
}

/** Inputs to coupling-graph construction: the changed files + optional precision signals. */
export interface CouplingInput {
  readonly changedFiles: readonly string[];
  /** Per-file diff text (path → that file's diff), for the diff-cross-reference baseline. */
  readonly fileDiffs?: ReadonlyMap<string, string>;
  /** Pre-resolved TS import edges, when the import-graph precision layer is available. */
  readonly tsImportEdges?: readonly CouplingEdge[];
}

function posixDirname(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

function posixBasename(p: string): string {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

/** The stem of a test file (`foo.test.ts` → `foo`, `bar.spec.tsx` → `bar`), or undefined if not a test. */
function testStem(file: string): string | undefined {
  return /^(.+)\.(?:test|spec)\.[cm]?[jt]sx?$/.exec(posixBasename(file))?.[1];
}

/** The stem of a source file (basename without its TS/JS extension): `seam-pass.ts` → `seam-pass`. */
function sourceStem(file: string): string {
  return posixBasename(file).replace(/\.[cm]?[jt]sx?$/, '');
}

/** Reference tokens that a diff mentioning file B might use to refer to it (path / basename / ESM .js swap). */
function referenceTokens(file: string): string[] {
  const base = posixBasename(file);
  const stem = base.replace(/\.[^.]+$/, '');
  return [file, base, `${stem}.js`];
}

/** Build the coupling graph (dir-adjacency + diff-xref baseline; capability-gated TS import layer). */
export function buildCouplingGraph(input: CouplingInput): CouplingGraph {
  const files = Array.from(new Set(input.changedFiles)).sort();
  const edges: CouplingEdge[] = [];

  // Universal baseline 1: directory-adjacency (same directory ⇒ candidate-coupled).
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i];
      const b = files[j];
      if (a !== undefined && b !== undefined && posixDirname(a) === posixDirname(b)) {
        edges.push({ from: a, to: b, signal: 'dir' });
      }
    }
  }

  // Universal baseline 2: diff cross-references (A's diff mentions changed file B).
  if (input.fileDiffs !== undefined) {
    for (const a of files) {
      const diff = input.fileDiffs.get(a);
      if (diff === undefined) continue;
      for (const b of files) {
        if (a === b) continue;
        if (referenceTokens(b).some((tok) => diff.includes(tok))) {
          edges.push({ from: a, to: b, signal: 'diff-xref' });
        }
      }
    }
  }

  // Universal baseline 3 (TASK-430): pair a test file with its implementing source by
  // NAME (`foo.test.ts` ↔ `foo.ts`), independent of directory and diff text, so the
  // chunker keeps them in the SAME chunk. A RED-first test split from its source makes
  // the model auditing the test-only chunk read stale "FAILS today" TDD comments and
  // report a false failing-test finding (the 030 dogfood meta-finding).
  for (const t of files) {
    const stem = testStem(t);
    if (stem === undefined) continue;
    for (const s of files) {
      if (s === t || testStem(s) !== undefined) continue; // source side only
      if (sourceStem(s) === stem) edges.push({ from: t, to: s, signal: 'test-source' });
    }
  }

  // Precision layer (additive, capability-gated): TS import edges, only when supplied.
  if (input.tsImportEdges !== undefined) {
    for (const e of input.tsImportEdges) {
      edges.push({ from: e.from, to: e.to, signal: 'ts-import' });
    }
  }

  edges.sort((x, y) => x.signal.localeCompare(y.signal) || x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
  return { files, edges };
}
