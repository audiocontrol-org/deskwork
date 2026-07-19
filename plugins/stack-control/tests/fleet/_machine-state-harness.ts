// T009 (036 fleet-control-plane) — machine-local store redirect harness.
//
// WHY THIS EXISTS (plan.md § Complexity Tracking, "the isolation exception must
// be tested, not assumed"): this feature DELIBERATELY persists identity
// (`installationId`, bearer token, `installationSequence` high-water mark)
// OUTSIDE the installation tree, because `.stack-control/` is version-controlled
// and shipping identity in it would reintroduce the cross-host collision minting
// exists to prevent. The store lives in machine-local dirs the OS locates via
// env vars. Consequence: without a redirect, a test run mints identity into a
// real developer's `$HOME` and a CI run pollutes the agent. This harness is the
// non-negotiable redirect. Every fleet test uses it.
//
// THE STORE CONTRACT BEING REDIRECTED (research.md PT-001, data-model.md
// § Machine-local state — SETTLED, not re-derived here):
//   Durable   (installationId, bearer token, high-water mark):
//     Linux   $XDG_STATE_HOME              macOS  ~/Library/Application Support
//     Windows %LOCALAPPDATA%
//   Ephemeral (socket/pipe endpoint — reboot-cleared):
//     Linux   $XDG_RUNTIME_DIR            macOS  $TMPDIR            Windows  named pipe
//   Keyed by sha256(realpath.native(installationRoot))[0:16].
//   UDS path length is the forcing constraint: 103 usable bytes (macOS) /
//   107 (Linux). The socket is NEVER under the installation root.
//
// NOTE: `src/machine-state/locate.ts` DOES NOT EXIST YET (that is T024). This
// harness is written against the CONTRACT (the env vars + keying), RED-first —
// it controls what a future locate.ts will read, without depending on it.
//
// DESIGN — omission fails LOUD, never silent (the core requirement):
//   1. IMPORT-TIME DURABLE POISON. The instant this module is imported, the
//      durable-store env vars (HOME/USERPROFILE/XDG_STATE_HOME/LOCALAPPDATA) are
//      overwritten to point into a process-unique "tripwire" temp dir. So a test
//      that FORGETS to redirect cannot reach a real developer's `$HOME` — the
//      worst it can do is write identity into the tripwire, which is disposable.
//      (The ephemeral endpoint is left on the real $TMPDIR/$XDG_RUNTIME_DIR when
//      un-redirected: a stray socket in the OS tmp is benign and reboot-cleared —
//      it is DESIGNED to live there — and poisoning $TMPDIR would false-trip on
//      every incidental os.tmpdir() call. Only DURABLE identity is safety-critical.)
//   2. TRIPWIRE ASSERTION. `assertTripwireEmpty()` fails loud if any durable
//      store dir appeared under the tripwire — i.e. some path skipped the
//      redirect. It runs in the per-test teardown AND as a file-level afterAll,
//      so an omitting test surfaces as a hard failure, not a silent leak.
//   3. UDS BUDGET. Redirected runtime dirs are rooted at a deliberately SHORT
//      base (/tmp, not macOS's deep /var/folders tmpdir) and every redirect
//      asserts the worst-case socket path stays within the macOS 103-byte budget
//      — the exact failure research.md PT-001 warns a too-deep temp dir causes.
//
// Real temp dirs on disk; never a mocked filesystem (.claude/rules/testing.md).
// This repo's convention is relative `.js` imports with node16 resolution (there
// is no `@/` alias configured — using one would break tsc/vitest); this file
// imports only node builtins + vitest, so the question is moot here.

import { afterAll, afterEach, beforeEach } from 'vitest';
// storeKey is single-sourced from locate.ts (the authoritative store-location
// module). The harness redirects the store that locate.ts resolves, so its key
// MUST be locate's key, byte-for-byte — importing it makes divergence impossible
// rather than merely test-detectable.
import { locateMachineState, storeKey } from '../../src/machine-state/locate.js';
import { resolveInstallation } from '../../src/config/installation.js';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** macOS `sun_path` usable budget — the tightest POSIX limit (research.md PT-001). */
export const MACOS_UDS_BUDGET_BYTES = 103;
/** Linux `sun_path` usable budget. */
export const LINUX_UDS_BUDGET_BYTES = 107;

const STORE_SUBDIR = 'stack-control';
const SOCKET_SUFFIX = '.sock';

/** The env vars the OS store-locator reads; the whole surface the harness owns. */
type MachineStateEnvKey =
  | 'HOME'
  | 'USERPROFILE'
  | 'XDG_STATE_HOME'
  | 'LOCALAPPDATA'
  | 'TMPDIR'
  | 'XDG_RUNTIME_DIR';

/** A redirected machine-local store: where the durable + ephemeral halves land. */
export interface MachineStateStore {
  /** Temp root containing every redirected sub-store for this scope. */
  readonly root: string;
  /** `$HOME` override — macOS durable derives `~/Library/Application Support` from it. */
  readonly home: string;
  /** `$XDG_STATE_HOME` override — the Linux durable base. */
  readonly stateHome: string;
  /** `%LOCALAPPDATA%` override — the Windows durable base. */
  readonly localAppData: string;
  /** `$XDG_RUNTIME_DIR` / `$TMPDIR` override — the ephemeral (socket) base. */
  readonly runtimeDir: string;
  /** The exact env overrides applied for this redirect. */
  readonly env: Readonly<Record<MachineStateEnvKey, string>>;
  /** The worst-case socket path for a given installation root (budget-relevant). */
  socketPathFor(installationRoot: string): string;
  /**
   * The durable dir for the enclosing stack-control installation (the one
   * `resolveInstallation(process.cwd())` resolves) UNDER this redirected
   * store — the same resolution `current-session.ts` and other root-less
   * machine-state callers use. Convenience for tests that assert against a
   * module with no caller-supplied installation root (e.g.
   * `tests/instance/current-session.test.ts`).
   */
  readonly durableDir: string;
}

/** A redirect handle whose `dispose()` re-poisons durable + restores ephemeral. */
export interface MachineStateRedirect extends MachineStateStore {
  dispose(): void;
}

// storeKey is imported from locate.ts (above) and re-exported so existing
// harness consumers keep importing it from here.
export { storeKey };

// A too-deep runtime dir makes the socket path exceed macOS's 103-byte sun_path
// limit and produces confusing failures in later transport tests. /tmp is short
// and POSIX-guaranteed; macOS os.tmpdir() (`/var/folders/xx/…/T`, ≈49 bytes) is
// not. Windows uses named pipes (no sun_path budget), so os.tmpdir() is fine.
function shortTmpBase(): string {
  return process.platform === 'win32' ? tmpdir() : '/tmp';
}

function worstCaseSocketPath(runtimeDir: string): string {
  // 16 hex chars is the contract's key width (sha256[0:16]); model it directly.
  return join(runtimeDir, STORE_SUBDIR, 'f'.repeat(16) + SOCKET_SUFFIX);
}

/**
 * Assert the worst-case socket path under `runtimeDir` fits the macOS UDS budget.
 * The macOS limit (103) is enforced on all POSIX platforms so a dir minted on
 * Linux CI is still macOS-portable. Windows (named pipes) has no such limit.
 */
export function assertUdsBudget(runtimeDir: string): void {
  if (process.platform === 'win32') return;
  const worst = worstCaseSocketPath(runtimeDir);
  const bytes = Buffer.byteLength(worst, 'utf8');
  if (bytes > MACOS_UDS_BUDGET_BYTES) {
    throw new Error(
      `UDS path-length budget exceeded: worst-case socket path (${bytes} bytes) ` +
        `overruns the macOS sun_path limit of ${MACOS_UDS_BUDGET_BYTES}. ` +
        `Redirected runtime dir is too deep: ${runtimeDir}. ` +
        `The harness roots runtime dirs at ${shortTmpBase()} precisely to avoid this.`,
    );
  }
}

interface StoreRoots {
  readonly root: string;
  readonly home: string;
  readonly stateHome: string;
  readonly localAppData: string;
  readonly runtimeDir: string;
}

function scaffoldRoots(prefix: string): StoreRoots {
  const root = mkdtempSync(join(shortTmpBase(), `${prefix}-${process.pid}-`));
  const home = join(root, 'home');
  const stateHome = join(root, 'state');
  const localAppData = join(root, 'localappdata');
  const runtimeDir = join(root, 'run');
  for (const dir of [home, stateHome, localAppData, runtimeDir]) {
    mkdirSync(dir, { recursive: true });
  }
  return { root, home, stateHome, localAppData, runtimeDir };
}

function applyEnv(
  values: Partial<Record<MachineStateEnvKey, string | undefined>>,
): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function durableEnv(
  roots: StoreRoots,
): Record<'HOME' | 'USERPROFILE' | 'XDG_STATE_HOME' | 'LOCALAPPDATA', string> {
  return {
    HOME: roots.home,
    USERPROFILE: roots.home,
    XDG_STATE_HOME: roots.stateHome,
    LOCALAPPDATA: roots.localAppData,
  };
}

function ephemeralEnv(
  roots: StoreRoots,
): Record<'TMPDIR' | 'XDG_RUNTIME_DIR', string> {
  return { TMPDIR: roots.runtimeDir, XDG_RUNTIME_DIR: roots.runtimeDir };
}

function rmSafe(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup; a leftover temp dir is not worth failing a test. */
  }
}

// --- Import-time durable poison (guarantee: no un-redirected write reaches a
//     real developer's $HOME). Captured real ephemeral values are restored on
//     dispose; the durable env is never restored to real during the run. -------

const REAL_TMPDIR = process.env.TMPDIR;
const REAL_XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR;

const TRIPWIRE = scaffoldRoots('scf-tripwire');
applyEnv(durableEnv(TRIPWIRE));
process.once('exit', () => rmSafe(TRIPWIRE.root));

function restoreEphemeralToReal(): void {
  applyEnv({ TMPDIR: REAL_TMPDIR, XDG_RUNTIME_DIR: REAL_XDG_RUNTIME_DIR });
}

function dirHasEntries(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

/**
 * Fail loud if durable identity was written under the tripwire — the signal that
 * a code path skipped the redirect harness. The tripwire's durable bases start
 * empty; only a store write populates them, so any entry is an omission leak.
 */
export function assertTripwireEmpty(): void {
  const violations: string[] = [];
  const macDurable = join(TRIPWIRE.home, 'Library', 'Application Support');
  if (dirHasEntries(TRIPWIRE.stateHome)) violations.push(TRIPWIRE.stateHome);
  if (dirHasEntries(TRIPWIRE.localAppData)) violations.push(TRIPWIRE.localAppData);
  if (existsSync(macDurable)) violations.push(macDurable);
  if (violations.length > 0) {
    throw new Error(
      'machine-state omission leak: durable identity was written to the tripwire ' +
        'instead of a redirected store — a test path skipped the redirect harness ' +
        '(T009). Wrap it with useMachineStateStore() / withMachineState(). ' +
        `Offending paths:\n  ${violations.join('\n  ')}`,
    );
  }
}

/** The tripwire root — exposed for diagnostics; do not write here on purpose. */
export function tripwireRoot(): string {
  return TRIPWIRE.root;
}

/**
 * Redirect BOTH machine-local stores to a fresh temp dir. Caller MUST call
 * `dispose()` (or use `withMachineState` / `useMachineStateStore`, which do it
 * for you even when the test throws).
 */
export function redirectMachineState(): MachineStateRedirect {
  const roots = scaffoldRoots('scf');
  assertUdsBudget(roots.runtimeDir);
  const env: Record<MachineStateEnvKey, string> = {
    ...durableEnv(roots),
    ...ephemeralEnv(roots),
  };
  applyEnv(env);
  let disposed = false;
  return {
    root: roots.root,
    home: roots.home,
    stateHome: roots.stateHome,
    localAppData: roots.localAppData,
    runtimeDir: roots.runtimeDir,
    env,
    socketPathFor(installationRoot: string): string {
      return join(roots.runtimeDir, STORE_SUBDIR, storeKey(installationRoot) + SOCKET_SUFFIX);
    },
    get durableDir(): string {
      return locateMachineState(resolveInstallation(process.cwd()).root).durableDir;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      applyEnv(durableEnv(TRIPWIRE)); // re-poison durable; never restore to real
      restoreEphemeralToReal();
      rmSafe(roots.root);
    },
  };
}

/** Run `fn` with the machine-local store redirected; cleanup runs even on throw. */
export function withMachineState<T>(fn: (store: MachineStateStore) => T): T {
  const redirect = redirectMachineState();
  try {
    return fn(redirect);
  } finally {
    redirect.dispose();
  }
}

/** Async form of `withMachineState`. */
export async function withMachineStateAsync<T>(
  fn: (store: MachineStateStore) => Promise<T>,
): Promise<T> {
  const redirect = redirectMachineState();
  try {
    return await fn(redirect);
  } finally {
    redirect.dispose();
  }
}

/**
 * Register vitest `beforeEach`/`afterEach` that redirect the store per test and
 * dispose it (asserting no omission leak) afterward. Returns an accessor for the
 * current redirect; throws if read outside an active test.
 *
 * Usage:
 *   const store = useMachineStateStore();
 *   it('mints under the temp store', () => { const s = store(); ... });
 */
export function useMachineStateStore(): () => MachineStateStore {
  let current: MachineStateRedirect | undefined;
  beforeEach(() => {
    current = redirectMachineState();
  });
  afterEach(() => {
    try {
      assertTripwireEmpty();
    } finally {
      current?.dispose();
      current = undefined;
    }
  });
  return (): MachineStateStore => {
    if (current === undefined) {
      throw new Error(
        'machine-state store accessed outside an active test — useMachineStateStore() ' +
          'registers beforeEach/afterEach; read the accessor inside it()/test().',
      );
    }
    return current;
  };
}

// File-level loud guard: even a test that imports this harness but never calls a
// redirect helper cannot silently leak — a durable write lands in the tripwire
// and this afterAll fails the file. Guarded so the module stays importable
// outside a vitest suite (a plain tsx script / typecheck), where the import-time
// durable poison still protects real $HOME even without the loud assertion.
try {
  afterAll(() => {
    assertTripwireEmpty();
  });
} catch {
  /* not inside a vitest suite; import-time poison remains in force. */
}
