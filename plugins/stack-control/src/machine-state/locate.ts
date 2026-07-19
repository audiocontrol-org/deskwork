// specs/036-fleet-control-plane — T024 (impl), pairs with T023's RED test
// (tests/fleet/machine-state-locate.test.ts).
//
// LOCATES the machine-local store for an installation and creates its parent
// dirs with the correct authorization mode. SCOPE IS LOCATION + DIR CREATION
// ONLY — this module does NOT mint identity, issue tokens, or persist the
// high-water mark (that is T025/T026/T027/T028). It resolves *where* those
// live and guarantees the directories exist with a 0700 boundary.
//
// THE CONTRACT (research.md § PT-001, data-model.md § Machine-local state —
// SETTLED, not re-derived here):
//   Durable   (installationId, bearer token, high-water mark):
//     Linux   $XDG_STATE_HOME (XDG default $HOME/.local/state)
//     macOS   ~/Library/Application Support
//     Windows %LOCALAPPDATA%
//   Ephemeral (socket/pipe endpoint — reboot-cleared):
//     Linux   $XDG_RUNTIME_DIR      macOS  $TMPDIR      Windows  named pipe
//   Keyed by  sha256(realpath.native(installationRoot))[0:16].
//
// WHY NEVER UNDER THE INSTALLATION ROOT: a UDS path is limited to 103 usable
// bytes on macOS / 107 on Linux. The installation root can be arbitrarily
// deep, so the socket cannot live under it. Hashing into a SHORT runtime dir
// keeps the macOS worst case ~76 of 103 (research.md § PT-001 rationale).
// Additionally, `.stack-control/` is version-controlled — shipping durable
// identity inside it would reintroduce the cross-host collision minting exists
// to prevent (plan.md § Complexity Tracking, the declared isolation exception).
//
// AUTHORIZATION is a 0700 PARENT DIRECTORY, not the socket file mode: `unix(7)`
// says POSIX makes no guarantee about socket-file permissions and BSD-derived
// systems (incl. macOS) may ignore them. Directory search permission is the
// universally-enforced mechanism (PT-001).
//
// CONSISTENCY WITH THE T009 HARNESS: this module reads the SAME env vars the
// harness redirects (HOME/USERPROFILE, XDG_STATE_HOME, LOCALAPPDATA for
// durable; XDG_RUNTIME_DIR/TMPDIR for ephemeral) and derives the socket path
// with the SAME leaf layout the harness's `socketPathFor` models
// (`<runtimeDir>/stack-control/<key>.sock`). That is what makes a
// `redirectMachineState()` actually redirect this module's reads.
//
// No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
// `.js` imports under node16 resolution (no `@/` alias configured). Fail loud
// when a required base cannot be resolved — never silently fall back to the
// installation root (the forbidden location).

import { chmodSync, mkdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** The app namespace directory / pipe-name prefix under every store base. */
const STORE_NAMESPACE = 'stack-control';
/** UDS filename suffix (POSIX). */
const SOCKET_SUFFIX = '.sock';
/** Authorization mode for every store parent directory (PT-001). */
const DIR_MODE = 0o700;

/** macOS `sun_path` usable budget — the tightest POSIX limit (PT-001). */
export const MACOS_UDS_BUDGET_BYTES = 103;
/** Linux `sun_path` usable budget. */
export const LINUX_UDS_BUDGET_BYTES = 107;

/**
 * The located machine-local store for one installation. Durable and ephemeral
 * halves are split by lifetime (PT-001); on Windows the ephemeral endpoint is
 * a named pipe in the kernel namespace with no filesystem parent.
 */
export interface MachineStateLocation {
  /** The installation root as passed in (not realpath-resolved). */
  readonly installationRoot: string;
  /** `sha256(realpath.native(installationRoot))[0:16]` — the store key. */
  readonly key: string;
  /** The platform this location was resolved for. */
  readonly platform: NodeJS.Platform;
  /** Per-installation durable dir (0700) — holds identity, token, high-water. */
  readonly durableDir: string;
  /** Socket path (POSIX) or `\\.\pipe\...` named-pipe path (Windows). */
  readonly socketPath: string;
  /**
   * The 0700 parent directory of the socket — the authorization boundary
   * (PT-001). `undefined` on Windows: a named pipe has no filesystem parent.
   */
  readonly socketDir?: string;
}

/** `sha256(realpath.native(installationRoot))[0:16]` — the store key (PT-001). */
export function storeKey(installationRoot: string): string {
  const native = realpathSync.native(installationRoot);
  return createHash('sha256').update(native).digest('hex').slice(0, 16);
}

/**
 * Assert a socket path stays within the UDS `sun_path` budget. The macOS limit
 * (103) is enforced on ALL POSIX platforms so a socket minted on Linux is still
 * macOS-portable. Windows named pipes have no such limit — a no-op there.
 * Fails loud (Principle V): a too-long path is a hard, nameable error, never a
 * silent truncation the transport layer would later trip over.
 */
export function assertUdsBudget(socketPath: string): void {
  if (process.platform === 'win32') return;
  const bytes = Buffer.byteLength(socketPath, 'utf8');
  if (bytes > MACOS_UDS_BUDGET_BYTES) {
    throw new Error(
      `UDS path-length budget exceeded: socket path (${bytes} bytes) overruns ` +
        `the macOS sun_path limit of ${MACOS_UDS_BUDGET_BYTES}: ${socketPath}. ` +
        `The socket must live in a short runtime dir, never under the ` +
        `installation root (research.md § PT-001).`,
    );
  }
}

/** Read a required env var, or throw naming it (fail loud — never fall back). */
function requireEnv(name: string, context: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `cannot resolve the ${context}: environment variable ${name} is not set. ` +
        `The machine-local store is deliberately outside the installation root ` +
        `(research.md § PT-001); refusing to fall back to a location that would ` +
        `ship identity in version control.`,
    );
  }
  return value;
}

/** The durable store BASE for the current platform (before the app namespace). */
function durableBase(platform: NodeJS.Platform): string {
  if (platform === 'darwin') {
    const home = requireEnv('HOME', 'macOS durable store base (~/Library/Application Support)');
    return join(home, 'Library', 'Application Support');
  }
  if (platform === 'win32') {
    return requireEnv('LOCALAPPDATA', 'Windows durable store base (%LOCALAPPDATA%)');
  }
  // Linux / other POSIX: XDG_STATE_HOME, with the XDG-defined default
  // ($HOME/.local/state) when unset — that default is the spec, not a fallback.
  const xdgStateHome = process.env.XDG_STATE_HOME;
  if (xdgStateHome !== undefined && xdgStateHome.length > 0) {
    return xdgStateHome;
  }
  const home = requireEnv('HOME', 'Linux durable store base ($XDG_STATE_HOME / $HOME/.local/state)');
  return join(home, '.local', 'state');
}

/** The ephemeral (runtime) store BASE for POSIX platforms. */
function ephemeralBase(platform: NodeJS.Platform): string {
  if (platform === 'darwin') {
    return requireEnv('TMPDIR', 'macOS ephemeral store base ($TMPDIR)');
  }
  // Linux / other POSIX: XDG_RUNTIME_DIR is required — the XDG spec defines no
  // safe default for it, so its absence is a fail-loud condition, not a guess.
  return requireEnv('XDG_RUNTIME_DIR', 'Linux ephemeral store base ($XDG_RUNTIME_DIR)');
}

/** Create `dir` (and any parents) and set the leaf to the 0700 auth mode. */
function ensureDir0700(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: DIR_MODE });
  // mkdir's mode is subject to umask; chmod the leaf we own so the 0700 auth
  // boundary is exact regardless of the process umask. POSIX only — Windows
  // uses ACLs and chmod there only toggles the read-only bit.
  if (process.platform !== 'win32') {
    chmodSync(dir, DIR_MODE);
  }
}

/**
 * Locate the machine-local store for `installationRoot` and create its durable
 * + socket parent directories with the 0700 authorization mode. Returns the
 * resolved durable dir, socket path, and (on POSIX) the 0700 socket parent.
 *
 * `installationRoot` MUST exist on disk — `realpath.native` resolves it (macOS
 * `/tmp` → `/private/tmp`, symlinks, case) so the key is stable across the ways
 * the same tree can be named.
 */
export function locateMachineState(installationRoot: string): MachineStateLocation {
  const platform = process.platform;
  const key = storeKey(installationRoot);

  // Durable: <base>/stack-control/<key>. Both the app-namespace dir and the
  // per-installation key dir get the 0700 boundary; the token (0600, T118) will
  // live inside the key dir.
  const durableAppDir = join(durableBase(platform), STORE_NAMESPACE);
  const durableDir = join(durableAppDir, key);
  ensureDir0700(durableAppDir);
  ensureDir0700(durableDir);

  if (platform === 'win32') {
    // Named pipe — kernel namespace, no filesystem parent, no UDS budget.
    const socketPath = `\\\\.\\pipe\\${STORE_NAMESPACE}-${key}`;
    return { installationRoot, key, platform, durableDir, socketPath };
  }

  // POSIX: <runtimeDir>/stack-control/<key>.sock. This leaf layout is exactly
  // what the T009 harness's `socketPathFor` models — keep them identical.
  const socketDir = join(ephemeralBase(platform), STORE_NAMESPACE);
  const socketPath = join(socketDir, key + SOCKET_SUFFIX);
  ensureDir0700(socketDir);
  assertUdsBudget(socketPath);

  return { installationRoot, key, platform, durableDir, socketPath, socketDir };
}
