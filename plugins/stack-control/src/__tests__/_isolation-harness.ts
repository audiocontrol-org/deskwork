// Isolation-probe harness (specs/installation-isolation — FR-008 / research R5).
//
// Not a *.test.ts, so vitest does not collect it. The probe test
// (installation-isolation-probe.test.ts) composes these pieces into the
// table-driven suite; US2/US4/US5 reuse the same fixture + snapshot.
//
// Fixture shape: an OUTER git repository (deliberately NOT an installation)
// containing a nested stack-control installation. The isolation invariant
// (spec FR-001) says: every state-writing verb anchors its state inside the
// installation; the outer tree stays byte-identical.
//
// Snapshot contract (data-model.md § Isolation probe): a recursive
// (path, size, mtime) listing of the outer tree EXCLUDING:
//   - the installation subtree (the legitimate write target),
//   - `.git/` (git's own bookkeeping, not stack-control-owned state — read
//     verbs like `git diff` may refresh the index stat cache),
//   - per-row exemptions (FR-008's exhaustive list: the resolved feature
//     anchor; explicitly announced operator overrides). OS tmpdirs are
//     outside the outer tree by construction.

import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface NestedFixture {
  /** Absolute path of the outer git repo root (NOT an installation). */
  readonly outerRoot: string;
  /** Absolute path of the nested installation root (carries the marker). */
  readonly installationRoot: string;
  /** The installation root, relative to the outer root (e.g. 'sub'). */
  readonly installationRel: string;
  /** Write `<outerRoot>/<rel>`, creating parents. Returns the abs path. */
  writeOuter(rel: string, content: string): string;
  /** Write `<installationRoot>/<rel>`, creating parents. Returns the abs path. */
  writeInstallation(rel: string, content: string): string;
  cleanup(): void;
}

/** Minimal valid installation config — the marker the resolver walks to. */
export const MINIMAL_INSTALLATION_CONFIG = 'version: 1\n';

export function gitIn(cwd: string, args: readonly string[]): void {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${cwd}: ${r.stderr ?? '(no stderr)'}`,
    );
  }
}

/**
 * Build the nested fixture: outer git repo (one seed commit) ⊃ installation
 * at `sub/` seeded with the `.stack-control/config.yaml` marker (the same
 * marker `stackctl setup` writes — the install primitive's identity fact).
 */
export function makeNestedFixture(opts?: {
  readonly installationRel?: string;
}): NestedFixture {
  const outerRoot = mkdtempSync(join(tmpdir(), 'iso-probe-'));
  const installationRel = opts?.installationRel ?? 'sub';
  const installationRoot = join(outerRoot, installationRel);

  const writeAt = (base: string, rel: string, content: string): string => {
    const abs = join(base, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    return abs;
  };

  mkdirSync(join(installationRoot, '.stack-control'), { recursive: true });
  writeFileSync(
    join(installationRoot, '.stack-control', 'config.yaml'),
    MINIMAL_INSTALLATION_CONFIG,
    'utf8',
  );

  gitIn(outerRoot, ['init', '-q']);
  gitIn(outerRoot, ['config', 'user.email', 'probe@example.invalid']);
  gitIn(outerRoot, ['config', 'user.name', 'isolation-probe']);
  writeFileSync(join(outerRoot, 'README.md'), 'outer fixture repo\n', 'utf8');
  gitIn(outerRoot, ['add', '.']);
  gitIn(outerRoot, ['commit', '-q', '-m', 'seed']);

  return {
    outerRoot,
    installationRoot,
    installationRel,
    writeOuter: (rel, content) => writeAt(outerRoot, rel, content),
    writeInstallation: (rel, content) => writeAt(installationRoot, rel, content),
    cleanup: () => rmSync(outerRoot, { recursive: true, force: true }),
  };
}

/** One file's identity in a snapshot: `${size}:${mtimeMs}`. */
export type Snapshot = Map<string, string>;

/**
 * Snapshot the outer tree (path + size + mtime per file), excluding the
 * installation subtree, `.git/`, and the caller's per-row exemptions
 * (relative paths; a listed dir excludes its whole subtree).
 */
export function snapshotOutsideInstallation(
  fixture: NestedFixture,
  exemptRel: readonly string[] = [],
): Snapshot {
  const excluded = new Set([fixture.installationRel, '.git', ...exemptRel]);
  const snapshot: Snapshot = new Map();
  const walk = (rel: string): void => {
    const abs = rel === '' ? fixture.outerRoot : join(fixture.outerRoot, rel);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (excluded.has(childRel)) continue;
      if (entry.isDirectory()) {
        snapshot.set(`${childRel}/`, 'dir');
        walk(childRel);
        continue;
      }
      const st = statSync(join(fixture.outerRoot, childRel));
      snapshot.set(childRel, `${st.size}:${st.mtimeMs}`);
    }
  };
  walk('');
  return snapshot;
}

/**
 * Human-readable delta between two snapshots — the probe's failure message
 * names exactly which outer-tree paths a verb created/changed/removed.
 */
export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  for (const [path, sig] of after) {
    const prior = before.get(path);
    if (prior === undefined) out.push(`created: ${path}`);
    else if (prior !== sig) out.push(`modified: ${path}`);
  }
  for (const path of before.keys()) {
    if (!after.has(path)) out.push(`removed: ${path}`);
  }
  return out.sort();
}
