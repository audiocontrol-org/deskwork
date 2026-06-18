// Shared fixtures for the capability-interface mediation feature (026 T001).
// Not a *.test.ts, so vitest does not collect it. Builds a flat stack-control
// installation (a tmp dir owning `.stack-control/config.yaml`) that the marker,
// mediate-check, and front-door tests anchor against via `--at`. Mirrors the
// govern/workflow fixtures' shape (mkdtemp installation, hermetic git, write/
// cleanup helpers) so the capability suite shares one tmp-installation idiom.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** The on-disk location the front-door marker writer (T008) keys per session. */
export const FRONT_DOOR_STATE_REL = join('.stack-control', 'state', 'front-door');

export interface CapabilityFixtureOptions {
  /** Initialise a hermetic git repo at the installation root (no signing). */
  readonly git?: boolean;
}

export interface CapabilityFixture {
  /** Absolute path of the installation root (a tmp dir). */
  readonly root: string;
  /** Absolute path of the front-door marker state dir under this installation. */
  readonly frontDoorDir: string;
  /** Absolute path of a session's marker file (`<frontDoorDir>/<session>.json`). */
  sessionMarkerPath(session: string): string;
  /** Write a file (relative to root); creates parent dirs; returns abs path. */
  write(rel: string, content: string): string;
  /** Read a file relative to root as utf8. Throws if absent. */
  read(rel: string): string;
  /** Run a git command in the installation root; throws on non-zero. */
  git(args: readonly string[]): string;
  /** Stage everything and commit (the installation must be git-initialised). */
  commitAll(message: string): void;
  /** Remove the tmp installation. */
  cleanup(): void;
}

/** A flat installation fixture (a tmp dir owning `.stack-control/config.yaml`). */
export function makeCapabilityFixture(
  options: CapabilityFixtureOptions = {},
): CapabilityFixture {
  const root = mkdtempSync(join(tmpdir(), 'cap-fixture-'));
  mkdirSync(join(root, '.stack-control'), { recursive: true });
  writeFileSync(join(root, '.stack-control', 'config.yaml'), 'version: 1\n', 'utf8');

  const frontDoorDir = join(root, FRONT_DOOR_STATE_REL);

  const write = (rel: string, content: string): string => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf8');
    return abs;
  };

  const read = (rel: string): string => readFileSync(join(root, rel), 'utf8');

  const git = (args: readonly string[]): string => {
    const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr ?? ''}`);
    return r.stdout ?? '';
  };

  if (options.git === true) {
    git(['init', '-q']);
    git(['config', 'user.email', 'cap@example.invalid']);
    git(['config', 'user.name', 'cap-fixture']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['config', 'tag.gpgsign', 'false']);
  }

  return {
    root,
    frontDoorDir,
    sessionMarkerPath: (session) => join(frontDoorDir, `${session}.json`),
    write,
    read,
    git,
    commitAll: (message) => {
      git(['add', '-A']);
      git(['commit', '-q', '-m', message]);
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
