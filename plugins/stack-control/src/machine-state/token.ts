/**
 * specs/036-fleet-control-plane — T118 (impl), pairs with T110's RED test
 * (tests/fleet/no-creds-in-cli.test.ts).
 *
 * TOKEN CUSTODY — the bearer token's ONLY home (contracts/sidecar-plane-
 * protocol.md § C6: "Credentials live in the sidecar only — never in a CLI
 * process, never on the local socket."; SC-011: 0 credentials in any CLI
 * process).
 *
 * STRUCTURAL BOUNDARY, NOT JUST A RUNTIME ONE: this module MUST NEVER be
 * imported from `src/telemetry/emit.ts` (the CLI's emit path) or anything on
 * the CLI dispatcher's import graph. T110's test enforces this by scanning
 * emit.ts's SOURCE for a reference to this module — a structural guard, not
 * a behavioral one. The sidecar process (not the CLI) is this module's only
 * legitimate caller: it reads the token to authenticate its own outbound
 * calls to the plane; the CLI never touches it, so it can never leak it,
 * log it, or put it on the socket wire (that separate guarantee is
 * token-not-on-socket.test.ts's job, not this module's).
 *
 * FILE MODE 0600, MACHINE-LOCAL: the token file lives inside the located
 * durable dir (`locate.ts`'s `durableDir`, already 0700 — PT-001) at the
 * SAME 0600 mode `identity.ts` uses for `installation-id`. Mirrors that
 * module's `persistId` treatment: `writeFileSync(..., { mode: 0o600 })`
 * followed by an explicit `chmodSync` so the boundary is exact regardless of
 * process umask.
 *
 * WINDOWS CAVEAT (recorded per the task's NULL-DACL note): POSIX mode bits
 * are enforced by the filesystem; on Windows, `fs.writeFileSync`'s `mode`
 * and `chmodSync` only toggle the read-only attribute — there is no POSIX
 * permission bitmask. A file created there without an explicit ACL inherits
 * its parent directory's ACL (which itself may carry a NULL DACL, i.e. "no
 * ACL", if unset upstream) rather than being 0600-equivalent-guarded. This
 * module deliberately does NOT attempt to synthesize a Windows ACL — that is
 * out of scope here (mirrors `locate.ts`'s `ensureDir0700`, which skips
 * `chmodSync` on `win32` for the same reason). The 0700 durable-dir parent
 * (search-permission boundary, PT-001) is the primary guard on every
 * platform; the 0600 file mode is the additional POSIX-only belt.
 *
 * ABSENT vs CORRUPT: an absent token file is the ordinary "not yet
 * provisioned" state — `read()` returns `undefined`, never throws (T119's
 * provisioning verb is what creates it). This module does not validate the
 * token's shape (it is an opaque bearer credential minted by the plane, not
 * a value this module can independently verify) — it returns exactly the
 * trimmed file content, or `undefined` if there is none.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 module resolution (no `@/` alias configured).
 * Real filesystem only — no mocked fs.
 */

import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Filename for the persisted bearer token inside the 0700 durable dir. */
const TOKEN_FILENAME = 'bearer-token';

/**
 * File authorization mode for the persisted bearer token — `0600`
 * (data-model.md § Machine-local state, contract § C6). POSIX-enforced; see
 * the module header's Windows-caveat note for why this is a belt, not the
 * sole guard, on that platform.
 */
export const TOKEN_FILE_MODE = 0o600;

/** Narrow an `unknown` catch value to a Node errno exception without `as`. */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function tokenPath(machineStateDir: string): string {
  return join(machineStateDir, TOKEN_FILENAME);
}

/**
 * The sidecar's handle on its own bearer-token file. Deliberately minimal —
 * `read()` only (plus `write()` below for provisioning) — no `token`
 * property, no getter that could be destructured and passed around by
 * value; every access goes back through this handle so the file stays the
 * single source of truth.
 */
export interface TokenCustody {
  /**
   * Read the current bearer token, or `undefined` if none has been
   * provisioned yet at this machine-state dir. Never throws for the
   * "absent" case; a present-but-unreadable file (permission denied, I/O
   * error) DOES throw — that is a durability failure, not "no token".
   */
  read(): string | undefined;
  /**
   * Provision (or rotate) the bearer token: writes `token` to the token
   * file at `TOKEN_FILE_MODE` (0600), overwriting any prior value. Used by
   * the operator-run token-provisioning verb (T119, PT-015) — never called
   * from the CLI's telemetry-emit path (see module header).
   */
  write(token: string): void;
}

/**
 * Open token custody for a located machine-state dir (`locate.ts`'s
 * `durableDir`). Returns a handle whose `read()`/`write()` always operate on
 * the SAME on-disk path — no in-process caching, so a rotated or
 * newly-provisioned token is visible to the next `read()` without any
 * invalidation bookkeeping.
 */
export function openTokenCustody(machineStateDir: string): TokenCustody {
  const path = tokenPath(machineStateDir);

  return {
    read(): string | undefined {
      let raw: string;
      try {
        raw = readFileSync(path, 'utf8');
      } catch (err) {
        if (isErrnoException(err) && err.code === 'ENOENT') return undefined;
        throw new Error(
          `cannot read bearer token at ${path}: ${errorMessage(err)}. This is ` +
            `NOT the "not yet provisioned" case (ENOENT) — refusing to silently ` +
            `treat an unreadable file as absent.`,
        );
      }
      return raw.trim();
    },
    write(token: string): void {
      writeFileSync(path, token, { encoding: 'utf8', mode: TOKEN_FILE_MODE });
      // writeFileSync's mode is subject to umask; chmod the file we own so
      // the 0600 boundary is exact regardless of process umask (mirrors
      // identity.ts's persistId / locate.ts's ensureDir0700). Windows uses
      // ACLs, not POSIX bits — chmod there only toggles the read-only bit
      // (see module header's Windows-caveat note).
      if (process.platform !== 'win32') {
        chmodSync(path, TOKEN_FILE_MODE);
      }
    },
  };
}
