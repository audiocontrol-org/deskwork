// specs/036-fleet-control-plane — T026 + T030 (impl), pairs with T025 and
// T029's RED tests (tests/fleet/identity-mint.test.ts,
// tests/fleet/reattach.test.ts).
//
// MINTS AND PERSISTS `installationId` — the one durable identifier
// machine-local state exists to anchor (data-model.md § Identity,
// § Machine-local state). FR-031: minted ONCE, at first read, globally
// unique, and NEVER derived from a path. FR-032: persisted machine-locally,
// outside the version-controlled installation tree — never committed,
// never intentionally copied. FR-033 / SC-014: a copied or cloned
// installation tree re-mints its own identity; two hosts at an identical
// checkout path never collide.
//
// RE-MINT-ON-CLONE IS EMERGENT, NOT CODED HERE: this module does not detect
// "is this a clone?" at all. It reads/writes through locate.ts's
// `sha256(realpath.native(root))[0:16]` key (T024). A copy at a different
// real path resolves a DIFFERENT durable dir, which has no id file yet, so
// `mintOrReadInstallationId` mints fresh there.
//
// TWO HOSTS AT AN IDENTICAL PATH NEVER COLLIDE for the same reason in
// reverse: each host resolves the SAME key against its OWN machine-local
// durable store (a different physical `$HOME` / `$XDG_STATE_HOME` /
// `%LOCALAPPDATA%`). Nothing in this module — or locate.ts — ever reads or
// writes across hosts, so two mints for an identical path on two different
// machines are, and stay, independent.
//
// FAIL LOUD ON CORRUPTION (Principle V): "absent -> mint" and
// "present-but-corrupt -> fail loud" are deliberately DIFFERENT outcomes.
// An absent id file is the expected first-run state — every installation
// starts there. A present file that does not parse as a well-formed UUIDv4
// is evidence of disk corruption, a partial write, or a hand-edit; silently
// re-minting over it would discard identity (and the history keyed to it)
// without anyone knowing. It throws instead.
//
// The `mv`-re-mints consequence is the accepted counterpart of the clone
// guarantee above (research.md § Open items: "Move vs. clone identity is in
// genuine tension... mint-new on move, plus an explicit `reattach` escape
// hatch"). `reattachInstallationId` below is that escape hatch — it lets an
// operator deliberately restore a pre-move id at the new path.
//
// No `any`, no `as`, no `@ts-ignore` (Principle VI). Relative `.js` imports
// under node16 module resolution (no `@/` alias configured).

import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { locateMachineState } from './locate.js';
import { mintInstallationId as generateInstallationId } from '../fleet/types.js';

/** Filename for the persisted installationId inside the 0700 durable dir. */
const INSTALLATION_ID_FILENAME = 'installation-id';

/**
 * File authorization mode for the persisted id — matches the bearer token's
 * `0600` (data-model.md § Machine-local state: "file mode `0600`"). The id
 * is not a secret the way the token is, but it lives in the same durable
 * dir under the same 0700 boundary, and giving it the tighter file mode too
 * costs nothing and keeps the durable dir's contents uniformly guarded.
 */
const FILE_MODE = 0o600;

/** Case-insensitive UUIDv4 shape — validates id-file content on read. */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value);
}

/** Narrow an `unknown` catch value to a Node errno exception without `as`. */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function installationIdPath(root: string): string {
  return join(locateMachineState(root).durableDir, INSTALLATION_ID_FILENAME);
}

/**
 * Read the raw content of the id file at `path`. Returns `undefined` only
 * for the "not minted yet" state (ENOENT) — every OTHER read failure
 * (permission denied, I/O error, a directory where a file was expected,
 * etc.) is re-thrown, never silently treated as absent.
 */
function readRawIdFile(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return undefined;
    throw new Error(
      `cannot read installationId file at ${path}: ${errorMessage(err)}. This ` +
        `is NOT the "absent" case (ENOENT) — refusing to silently re-mint over ` +
        `a file that exists but could not be read.`,
    );
  }
}

/**
 * Parse + validate id-file content. A present file that is not a
 * well-formed UUIDv4 is corrupt — fails loud (see module header), a
 * deliberately different outcome from "absent".
 */
function parseIdFile(path: string, raw: string): string {
  const trimmed = raw.trim();
  if (!isUuidV4(trimmed)) {
    throw new Error(
      `installationId file at ${path} is present but corrupt (not a ` +
        `well-formed UUIDv4): ${JSON.stringify(raw)}. Refusing to silently ` +
        `re-mint over a corrupt file — remove it deliberately to mint fresh.`,
    );
  }
  return trimmed;
}

/**
 * Persist `id` at `path` as a 0600 file. `path`'s parent (the durable dir)
 * is already guaranteed to exist with the 0700 mode by `locateMachineState`
 * (T024) — every caller here reaches this via `installationIdPath`, which
 * calls it first.
 */
function persistId(path: string, id: string): void {
  writeFileSync(path, id, { encoding: 'utf8', mode: FILE_MODE });
  // writeFileSync's mode is subject to umask; chmod the file we own so the
  // 0600 boundary is exact regardless of process umask (mirrors locate.ts's
  // ensureDir0700 treatment of its 0700 dirs). Windows uses ACLs, not POSIX
  // bits — chmod there only toggles the read-only bit, so skip it.
  if (process.platform !== 'win32') {
    chmodSync(path, FILE_MODE);
  }
}

/**
 * Read the existing installationId for `root`, or `undefined` if none has
 * been minted yet. Never mints — a pure read. Throws if a present id file
 * is corrupt (see module header).
 */
export function readInstallationId(root: string): string | undefined {
  const path = installationIdPath(root);
  const raw = readRawIdFile(path);
  if (raw === undefined) return undefined;
  return parseIdFile(path, raw);
}

/**
 * Mint-once: return the existing installationId for `root` if one is
 * already persisted; otherwise mint a fresh UUIDv4 (FR-031 — never derived
 * from the path), persist it to the machine-local durable store located via
 * `locateMachineState`, and return it. A second call for the SAME `root`
 * returns the SAME id — it does not re-mint (FR-031: "minted once").
 *
 * `root` participates ONLY as the key into locate.ts's path-hash keying; the
 * minted id itself is random and carries no trace of the path.
 */
export function mintOrReadInstallationId(root: string): string {
  const path = installationIdPath(root);
  const raw = readRawIdFile(path);
  if (raw !== undefined) return parseIdFile(path, raw);
  const fresh = generateInstallationId();
  persistId(path, fresh);
  return fresh;
}

export interface ReattachOptions {
  /**
   * Overwrite an existing DIFFERENT id already present at `root`'s durable
   * store. Default `false` — see `reattachInstallationId`'s doc comment for
   * the reasoning.
   */
  readonly force?: boolean;
}

/**
 * Deliberately (re-)write `existingId` into `root`'s durable store — the
 * escape hatch research.md § Open items calls for: after an `mv` re-mints a
 * fresh, unwanted id at the new path, the operator restores the pre-move
 * identity by hand, out of band (their own record of the old id — e.g. from
 * logs, a prior `readInstallationId` call, or the plane's fleet registry).
 *
 * SAFETY / OVERWRITE DECISION (a judgment call, recorded here): refuses to
 * overwrite an EXISTING, DIFFERENT, well-formed id at `root` unless
 * `options.force` is `true`. Rationale: a store that already holds some
 * OTHER well-formed id is not "empty, waiting to be restored" — it may be a
 * legitimate identity for whatever now occupies that path (e.g. the
 * operator ran the sidecar once at the new location, it mint-on-clone'd a
 * fresh id, and THEN they remembered to reattach the old one). Silently
 * clobbering that would be exactly the kind of silent identity loss the
 * machine-local isolation exception exists to prevent — the same hazard
 * FR-032/033 legislate against, just self-inflicted instead of cross-host.
 * Reattaching the SAME id twice is idempotent (no error, `force` not
 * required) — that is expected repeat use (e.g. a retried `reattach`
 * invocation), not a clobber.
 *
 * `existingId` MUST already be a well-formed UUIDv4 — reattach restores a
 * KNOWN prior id; it is not a place to hand-mint a new one (use
 * `mintOrReadInstallationId` for that).
 *
 * Returns the id that ended up persisted (`existingId`, on success).
 */
export function reattachInstallationId(
  root: string,
  existingId: string,
  options: ReattachOptions = {},
): string {
  if (!isUuidV4(existingId)) {
    throw new Error(
      `reattachInstallationId: "${existingId}" is not a well-formed UUIDv4. ` +
        `reattach restores a KNOWN prior installationId — mint a fresh one ` +
        `with mintOrReadInstallationId() instead if that is what's needed.`,
    );
  }
  const path = installationIdPath(root);
  const raw = readRawIdFile(path);
  if (raw !== undefined) {
    const current = parseIdFile(path, raw);
    if (current === existingId) return current; // idempotent — already reattached
    if (options.force !== true) {
      throw new Error(
        `reattachInstallationId: refusing to overwrite the existing ` +
          `installationId "${current}" at ${path} with "${existingId}" — ` +
          `pass { force: true } to overwrite deliberately.`,
      );
    }
  }
  persistId(path, existingId);
  return existingId;
}
