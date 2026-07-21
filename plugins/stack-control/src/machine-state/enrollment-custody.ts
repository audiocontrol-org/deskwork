/**
 * specs/036-fleet-control-plane — Task 4 (impl), pairs with the RED test
 * (tests/fleet/enrollment-custody.test.ts).
 *
 * HOST-LEVEL ENROLLMENT-CREDENTIAL CUSTODY — mirrors `token.ts`'s
 * `openTokenCustody` structure, but for the operator-issued *enrollment*
 * credential rather than the plane-minted bearer token, and rooted at the
 * HOST-level durable dir (`locate.ts`'s `locateHostState().durableDir`)
 * rather than the per-installation durable dir. Remote hosts store this
 * credential ONCE, shared across every installation on the host; the sidecar
 * reads it to self-enroll (later tasks: `sidecar set-enrollment`, `sidecar
 * run` auto-enroll, `plane serve` loopback seeding).
 *
 * FILE MODE 0600, MACHINE-LOCAL: the credential file lives inside the
 * located host-level durable dir (already 0700 — PT-001) at the same 0600
 * mode `token.ts` uses for the bearer token. Same `writeFileSync(...,
 * { mode: 0o600 })` + explicit `chmodSync` pattern so the boundary is exact
 * regardless of process umask.
 *
 * WINDOWS CAVEAT: see `token.ts`'s module header — POSIX mode bits are
 * filesystem-enforced; on Windows this module skips `chmodSync` for the same
 * reason `locate.ts`'s `ensureDir0700` does.
 *
 * ABSENT vs CORRUPT: an absent credential file is the ordinary "not yet
 * enrolled" state — `read()` returns `undefined`, never throws. This module
 * does not validate the credential's shape (it is an opaque operator-issued
 * value) — it returns exactly the trimmed file content, or `undefined` if
 * there is none.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 module resolution (no `@/` alias configured).
 * Real filesystem only — no mocked fs.
 */

import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Filename for the persisted enrollment credential inside the 0700 host durable dir. */
const ENROLLMENT_FILENAME = 'enrollment-credential';

/**
 * File authorization mode for the persisted enrollment credential — `0600`,
 * same as `token.ts`'s `TOKEN_FILE_MODE`. POSIX-enforced; see the module
 * header's Windows-caveat note for why this is a belt, not the sole guard,
 * on that platform.
 */
export const ENROLLMENT_FILE_MODE = 0o600;

/** Narrow an `unknown` catch value to a Node errno exception without `as`. */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function enrollmentPath(hostDurableDir: string): string {
  return join(hostDurableDir, ENROLLMENT_FILENAME);
}

/**
 * The host's handle on its own enrollment-credential file. Deliberately
 * minimal — `read()` / `write()` only, mirroring `TokenCustody` — every
 * access goes back through this handle so the file stays the single source
 * of truth.
 */
export interface EnrollmentCustody {
  /**
   * Read the current enrollment credential, or `undefined` if none has been
   * provisioned yet at this host durable dir. Never throws for the "absent"
   * case; a present-but-unreadable file (permission denied, I/O error) DOES
   * throw — that is a durability failure, not "no credential".
   */
  read(): string | undefined;
  /**
   * Provision (or rotate) the enrollment credential: writes `credential` to
   * the credential file at `ENROLLMENT_FILE_MODE` (0600), overwriting any
   * prior value.
   */
  write(credential: string): void;
}

/**
 * Open enrollment custody for a located host-level durable dir
 * (`locate.ts`'s `locateHostState().durableDir`). Returns a handle whose
 * `read()`/`write()` always operate on the SAME on-disk path — no
 * in-process caching, so a rotated or newly-provisioned credential is
 * visible to the next `read()` without any invalidation bookkeeping.
 */
export function openEnrollmentCustody(hostDurableDir: string): EnrollmentCustody {
  const path = enrollmentPath(hostDurableDir);

  return {
    read(): string | undefined {
      let raw: string;
      try {
        raw = readFileSync(path, 'utf8');
      } catch (err) {
        if (isErrnoException(err) && err.code === 'ENOENT') return undefined;
        throw new Error(
          `cannot read enrollment credential at ${path}: ${errorMessage(err)}. This ` +
            `is NOT the "not yet enrolled" case (ENOENT) — refusing to silently ` +
            `treat an unreadable file as absent.`,
        );
      }
      return raw.trim();
    },
    write(credential: string): void {
      writeFileSync(path, credential, { encoding: 'utf8', mode: ENROLLMENT_FILE_MODE });
      // writeFileSync's mode is subject to umask; chmod the file we own so
      // the 0600 boundary is exact regardless of process umask (mirrors
      // token.ts's write / locate.ts's ensureDir0700). Windows uses ACLs,
      // not POSIX bits — chmod there only toggles the read-only bit (see
      // module header's Windows-caveat note).
      if (process.platform !== 'win32') {
        chmodSync(path, ENROLLMENT_FILE_MODE);
      }
    },
  };
}
