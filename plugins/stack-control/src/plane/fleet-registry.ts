/**
 * specs/037-instance-observability (plan: docs/superpowers/plans/
 * 2026-07-20-fleet-multihost-enrollment.md) — Task 1.
 *
 * Fleet registry: the plane's persisted store of accepted enrollment
 * credentials (host-scoped, operator-issued) and enrolled per-instance
 * telemetry tokens. Every later fleet task (the `/v1/enroll` HTTP handler,
 * the plane runtime wiring, the CLI verbs) builds on the `FleetRegistry`
 * this module returns.
 *
 * TWO-FILE PERSISTENCE, ONE WRITER ROLE EACH (per the plan's architecture
 * note): `enrollment.json` is CLI-owned (credentials + revocations),
 * `telemetry.json` is plane-owned (enrolled tokens + their bound identity).
 * Task 1 has both files written by this same module under test — that is
 * expected; later tasks split the writer roles across processes without
 * changing this module's on-disk shapes.
 *
 * LIVE MAPS: `activeTokens()` / `instanceBindings()` return the SAME Map
 * instances this module mutates internally — not copies. `enroll()` and
 * `revokeToken()` mutate them in place so a caller (the plane runtime) that
 * captured the reference sees every enroll/revoke without re-reading.
 *
 * File mode 0600 for both persisted files, mirroring
 * `src/machine-state/token.ts`'s write pattern: `writeFileSync(path, data,
 * { mode: 0o600 })` then an explicit `chmodSync` (skipped on win32, which
 * has no POSIX permission bitmask — see that module's header for the
 * caveat). The containing `fleet/` directory is created 0700.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Relative
 * `.js` imports under node16 module resolution (no `@/` alias configured).
 * Real filesystem only — no mocked fs.
 */

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** File authorization mode for both persisted fleet-registry files. */
const FLEET_FILE_MODE = 0o600;

const ENROLLMENT_FILENAME = 'enrollment.json';
const TELEMETRY_FILENAME = 'telemetry.json';

/**
 * A minted telemetry token's bound identity, as recorded at enroll time.
 * `credential` is the enrollment credential that minted this token — it is
 * what lets `enroll()` tell "self-heal re-enroll" (same credential) apart
 * from "identity hijack attempt" (a different credential claiming an
 * already-bound installationId+host+path).
 */
export interface InstanceBinding {
  readonly installationId: string;
  readonly host: string;
  readonly path: string;
  readonly credential: string;
}

/** The identity a caller claims when enrolling — everything but the credential. */
export interface EnrollIdentity {
  readonly installationId: string;
  readonly host: string;
  readonly path: string;
}

export type EnrollOutcome =
  | { ok: true; token: string }
  | { ok: false; reason: 'unknown-credential' | 'identity-owned-by-other-credential' };

/** The live, mutable fleet registry handle returned by `loadFleetRegistry`. */
export interface FleetRegistry {
  /** token -> installationId, excluding revoked tokens. Live Map — enroll/revoke mutate it in place. */
  activeTokens(): Map<string, string>;
  /** token -> "host:path", excluding revoked tokens. Live Map — enroll/revoke mutate it in place. */
  instanceBindings(): Map<string, string>;
  /** Revoked token set (persisted; excludes credential-level revocations). */
  revokedTokens(): Set<string>;
  /** Live (non-revoked) enrollment credentials. */
  enrollmentCredentials(): Set<string>;
  enroll(credential: string, identity: EnrollIdentity): EnrollOutcome;
  addCredential(credential: string, label: string): void;
  revokeToken(token: string): void;
  revokeCredential(credential: string): void;
  /**
   * Re-read `enrollment.json` if it changed on disk since this handle last saw
   * it, refreshing the credential + revocation state in place. Called by the
   * enroll path (before the credential check) and the auth path (before token
   * verification) so a credential issued — or a token revoked — by a separate
   * process (the `issue-enrollment` / `revoke` CLI) is honored by a running
   * plane without a restart. A no-op when the file is unchanged.
   */
  reloadEnrollmentIfChanged(): void;
}

interface CredentialRecord {
  readonly credential: string;
  readonly label: string;
}

interface EnrollmentFileShape {
  credentials: CredentialRecord[];
  revokedTokens: string[];
  revokedCredentials: string[];
}

interface TelemetryFileShape {
  tokens: Record<string, InstanceBinding>;
}

function emptyEnrollmentFile(): EnrollmentFileShape {
  return { credentials: [], revokedTokens: [], revokedCredentials: [] };
}

function emptyTelemetryFile(): TelemetryFileShape {
  return { tokens: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isCredentialRecord(value: unknown): value is CredentialRecord {
  return isRecord(value) && typeof value.credential === 'string' && typeof value.label === 'string';
}

/** Parse+validate `enrollment.json`'s contents; corruption throws rather than silently coercing. */
function parseEnrollmentFile(raw: string, path: string): EnrollmentFileShape {
  const parsed: unknown = JSON.parse(raw);
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.credentials) ||
    !parsed.credentials.every(isCredentialRecord) ||
    !isStringArray(parsed.revokedTokens) ||
    !isStringArray(parsed.revokedCredentials)
  ) {
    throw new Error(`malformed fleet enrollment file at ${path}: does not match the expected shape`);
  }
  const credentials: CredentialRecord[] = [];
  for (const entry of parsed.credentials) {
    if (isCredentialRecord(entry)) credentials.push({ credential: entry.credential, label: entry.label });
  }
  return { credentials, revokedTokens: [...parsed.revokedTokens], revokedCredentials: [...parsed.revokedCredentials] };
}

function isInstanceBindingLike(value: unknown): value is InstanceBinding {
  return (
    isRecord(value) &&
    typeof value.installationId === 'string' &&
    typeof value.host === 'string' &&
    typeof value.path === 'string' &&
    typeof value.credential === 'string'
  );
}

/** Parse+validate `telemetry.json`'s contents; corruption throws rather than silently coercing. */
function parseTelemetryFile(raw: string, path: string): TelemetryFileShape {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed) || !isRecord(parsed.tokens)) {
    throw new Error(`malformed fleet telemetry file at ${path}: does not match the expected shape`);
  }
  const tokens: Record<string, InstanceBinding> = {};
  for (const [token, binding] of Object.entries(parsed.tokens)) {
    if (!isInstanceBindingLike(binding)) {
      throw new Error(`malformed fleet telemetry file at ${path}: entry "${token}" does not match InstanceBinding`);
    }
    tokens[token] = {
      installationId: binding.installationId,
      host: binding.host,
      path: binding.path,
      credential: binding.credential,
    };
  }
  return { tokens };
}

/**
 * Write JSON atomically: write a uniquely-named sibling temp file, then
 * `rename` it over the target. `rename` is atomic on POSIX, so a concurrent
 * reader (a running plane re-reading the file it does not own) sees either the
 * complete old file or the complete new one — never a half-written file. This
 * is the precondition that makes {@link FleetRegistry.reloadEnrollmentIfChanged}
 * safe to call at request time.
 */
function writeJsonFile(path: string, data: unknown): void {
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: FLEET_FILE_MODE });
  if (process.platform !== 'win32') {
    chmodSync(tmp, FLEET_FILE_MODE);
  }
  renameSync(tmp, path);
}

/**
 * A cheap change signature for `enrollment.json` — `mtimeMs:size`. `''` when the
 * file is absent. Size is folded in alongside mtime so an add/revoke (which
 * always changes the file's byte length) is detected even on a filesystem whose
 * mtime granularity would otherwise alias two writes in the same tick.
 */
function enrollmentSignatureOf(path: string): string {
  const st = statSync(path, { throwIfNoEntry: false });
  if (st === undefined) return '';
  return `${st.mtimeMs}:${st.size}`;
}

/**
 * Build a collision-safe key for identity comparison. `host`/`path` are
 * free-form and may contain spaces, so a space-joined key (the prior
 * implementation) can alias two distinct identities onto the same string
 * (e.g. host="host a" path="/p" vs host="host" path="a /p" both joined to
 * "inst host a /p"). JSON-encoding the tuple preserves field boundaries
 * unambiguously.
 */
function bindingKey(identity: EnrollIdentity): string {
  return JSON.stringify([identity.installationId, identity.host, identity.path]);
}

/**
 * Load (creating if absent) the fleet registry rooted at
 * `<planeDurableDir>/fleet/`. Returns a live object: the Maps/Sets it hands
 * back are mutated in place by `enroll`/`addCredential`/`revokeToken`/
 * `revokeCredential`, and every mutation is persisted to the matching file
 * before the call returns.
 */
export function loadFleetRegistry(planeDurableDir: string): FleetRegistry {
  const fleetDir = join(planeDurableDir, 'fleet');
  mkdirSync(fleetDir, { recursive: true, mode: 0o700 });

  const enrollmentPath = join(fleetDir, ENROLLMENT_FILENAME);
  const telemetryPath = join(fleetDir, TELEMETRY_FILENAME);

  const enrollmentFile = existsSync(enrollmentPath)
    ? parseEnrollmentFile(readFileSync(enrollmentPath, 'utf8'), enrollmentPath)
    : emptyEnrollmentFile();
  const telemetryFile = existsSync(telemetryPath)
    ? parseTelemetryFile(readFileSync(telemetryPath, 'utf8'), telemetryPath)
    : emptyTelemetryFile();

  const revokedTokenSet = new Set<string>(enrollmentFile.revokedTokens);
  const revokedCredentialSet = new Set<string>(enrollmentFile.revokedCredentials);
  const credentialSet = new Set<string>(
    enrollmentFile.credentials
      .map((record) => record.credential)
      .filter((credential) => !revokedCredentialSet.has(credential)),
  );

  const active = new Map<string, string>();
  const instances = new Map<string, string>();
  for (const [token, binding] of Object.entries(telemetryFile.tokens)) {
    if (revokedTokenSet.has(token)) continue;
    active.set(token, binding.installationId);
    instances.set(token, `${binding.host}:${binding.path}`);
  }

  // The change signature this handle last saw for enrollment.json. Updated on
  // every write THIS handle makes (so a self-write never triggers a reload) and
  // on every reload (so a peer's write is picked up exactly once).
  let enrollmentSignature = enrollmentSignatureOf(enrollmentPath);

  function persistEnrollment(): void {
    writeJsonFile(enrollmentPath, enrollmentFile);
    enrollmentSignature = enrollmentSignatureOf(enrollmentPath);
  }

  function persistTelemetry(): void {
    writeJsonFile(telemetryPath, telemetryFile);
  }

  function reloadEnrollmentIfChanged(): void {
    const signature = enrollmentSignatureOf(enrollmentPath);
    if (signature === '' || signature === enrollmentSignature) return;
    const fresh = parseEnrollmentFile(readFileSync(enrollmentPath, 'utf8'), enrollmentPath);
    enrollmentSignature = signature;
    // Refresh the read model in place so the runtime's captured references to
    // credentialSet / revokedTokenSet / active / instances stay valid.
    enrollmentFile.credentials = fresh.credentials;
    enrollmentFile.revokedTokens = fresh.revokedTokens;
    enrollmentFile.revokedCredentials = fresh.revokedCredentials;
    revokedCredentialSet.clear();
    for (const credential of fresh.revokedCredentials) revokedCredentialSet.add(credential);
    credentialSet.clear();
    for (const record of fresh.credentials) {
      if (!revokedCredentialSet.has(record.credential)) credentialSet.add(record.credential);
    }
    for (const token of fresh.revokedTokens) {
      revokedTokenSet.add(token);
      active.delete(token);
      instances.delete(token);
    }
  }

  function findTokenForIdentity(identity: EnrollIdentity): string | undefined {
    const key = bindingKey(identity);
    for (const [token, binding] of Object.entries(telemetryFile.tokens)) {
      if (revokedTokenSet.has(token)) continue;
      if (bindingKey(binding) === key) return token;
    }
    return undefined;
  }

  function forgetToken(token: string): void {
    delete telemetryFile.tokens[token];
    active.delete(token);
    instances.delete(token);
  }

  return {
    activeTokens(): Map<string, string> {
      return active;
    },
    instanceBindings(): Map<string, string> {
      return instances;
    },
    revokedTokens(): Set<string> {
      return revokedTokenSet;
    },
    enrollmentCredentials(): Set<string> {
      return credentialSet;
    },
    reloadEnrollmentIfChanged,
    enroll(credential: string, identity: EnrollIdentity): EnrollOutcome {
      // Honor a credential a separate process (issue-enrollment) added after
      // this handle loaded — the credential works the first time it is used.
      reloadEnrollmentIfChanged();
      if (!credentialSet.has(credential)) {
        return { ok: false, reason: 'unknown-credential' };
      }

      const existingToken = findTokenForIdentity(identity);
      if (existingToken !== undefined) {
        const existingBinding = telemetryFile.tokens[existingToken];
        if (existingBinding !== undefined && existingBinding.credential !== credential) {
          return { ok: false, reason: 'identity-owned-by-other-credential' };
        }
        // Same credential re-enrolling the same identity: supersede
        // (self-heal) — drop the prior token before minting the new one.
        forgetToken(existingToken);
      }

      const token = mintCredential();
      const binding: InstanceBinding = { ...identity, credential };
      telemetryFile.tokens[token] = binding;
      active.set(token, identity.installationId);
      instances.set(token, `${identity.host}:${identity.path}`);
      persistTelemetry();
      return { ok: true, token };
    },
    addCredential(credential: string, label: string): void {
      if (credentialSet.has(credential)) return;
      enrollmentFile.credentials.push({ credential, label });
      credentialSet.add(credential);
      persistEnrollment();
    },
    revokeToken(token: string): void {
      enrollmentFile.revokedTokens.push(token);
      revokedTokenSet.add(token);
      active.delete(token);
      instances.delete(token);
      persistEnrollment();
    },
    revokeCredential(credential: string): void {
      enrollmentFile.revokedCredentials.push(credential);
      revokedCredentialSet.add(credential);
      credentialSet.delete(credential);
      persistEnrollment();
    },
  };
}

/** Mint a fresh 43-char base64url secret (32 random bytes). */
export function mintCredential(): string {
  return randomBytes(32).toString('base64url');
}
