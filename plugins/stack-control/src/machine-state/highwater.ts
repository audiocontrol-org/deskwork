/**
 * specs/036-fleet-control-plane — T028 (impl), pairs with T027's RED test
 * (tests/fleet/highwater.test.ts).
 *
 * The DURABLE HIGH-WATER MARK for `installationSequence` (research.md § R-02,
 * spec.md FR-039, data-model.md § Machine-local state — SETTLED, not
 * re-derived here):
 *
 *   The sidecar is the `installationSequence` sequencer, and runs survive its
 *   restart — but the COUNTER must too, or a restarted sidecar resuming from
 *   zero makes every subsequent event look like a regression under FR-042,
 *   and the plane rejects its own fleet's ongoing telemetry.
 *
 *   The mark is DURABLE, MONOTONIC, and NEVER RESETS across restart. It is
 *   persisted inside the located durable dir (`locate.ts`'s `durableDir`,
 *   PT-001) and restored on start. A mark that CANNOT be restored (a present
 *   but corrupt/unreadable file) MUST fail loud — a silent reset to zero is
 *   exactly the bug R-02 identifies.
 *
 * SCOPE: persistence of the high-water mark ONLY. This module does NOT own
 * the sequence domain logic — `InstallationSequence` / `InvocationSequence`
 * as nominal types, or gap classification, live in `src/fleet/sequence.ts`
 * (T019/T020) and are untouched here. `sequence.ts`'s `classifyGap` takes a
 * durable high-water mark as a plain `number` INPUT; this module is where
 * that number is durably read from and advanced on disk.
 *
 * NO IN-PROCESS CACHE, BY DESIGN: every `readHighWaterMark` call reads fresh
 * from disk. That is what makes "survives restart" true by construction
 * rather than by careful cache-invalidation bookkeeping — there is no cache
 * to go stale across a process boundary.
 *
 * ABSENT vs CORRUPT are distinct, deliberately: an absent file means
 * "first-ever start" and returns the legitimate initial value 0 (no
 * `installationSequence` has ever been emitted from this installation on
 * this machine — the first real emitted value elsewhere in this feature is
 * 1, see tests/fleet/event.test.ts / types.test.ts). A PRESENT but
 * unparseable or wrong-shaped file is a durability failure and throws a
 * descriptive error naming the problem; it is never treated as absent.
 *
 * No `any`, no `as`, no `@ts-ignore` (Constitution Principle VI). Every
 * `unknown` value read from disk is narrowed with a user-defined type guard,
 * never cast — mirrors src/fleet/event.ts's validation style.
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MachineStateLocation } from './locate.js';

/** The durable mark file's name inside the located durable dir. */
const HIGHWATER_FILENAME = 'installation-sequence-highwater.json';

/**
 * The legitimate initial high-water mark for an installation that has never
 * emitted an `installationSequence` on this machine (absent durable file).
 * Not a fallback in the "silently invented" sense (.claude/rules — fallbacks
 * are bug factories): it is the one true starting value, the same way an
 * unstarted counter starts at zero everywhere else in this codebase.
 */
export const INITIAL_HIGH_WATER_MARK = 0;

/** The on-disk shape of the durable mark file. */
interface HighWaterMarkFile {
  readonly installationSequence: number;
}

/**
 * The path to the durable high-water mark file for a located machine state.
 * Exported so callers (and tests) that need to inspect or deliberately
 * corrupt the on-disk file target the exact path this module reads/writes —
 * never a re-derived guess that could drift from the real one.
 */
export function highWaterMarkPath(location: MachineStateLocation): string {
  return join(location.durableDir, HIGHWATER_FILENAME);
}

// ---------------------------------------------------------------------------
// Narrowing helpers — `unknown` -> typed, never `as` (mirrors event.ts).
// ---------------------------------------------------------------------------

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Detect Node's ENOENT error code without an `as` cast. */
function isEnoent(err: unknown): boolean {
  if (!(err instanceof Error) || !('code' in err)) {
    return false;
  }
  return err.code === 'ENOENT';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(
      `${label}: expected a non-negative integer, got ${describeType(value)} (${String(value)})`,
    );
  }
  return value;
}

/**
 * Parse and validate the durable mark file's contents. Throws a descriptive,
 * problem-naming error on anything short of a well-formed
 * `{ installationSequence: <non-negative integer> }` object — never
 * coerces, never returns a guessed value.
 */
function parseHighWaterMarkFile(raw: string, path: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `installationSequence high-water mark at ${path} is corrupt (invalid JSON): ` +
        `${errorMessage(err)}. This mark cannot be restored — per R-02/FR-039 that is a ` +
        'fail-loud condition, never a silent reset to zero.',
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `installationSequence high-water mark at ${path} is corrupt: expected a JSON object, ` +
        `got ${describeType(parsed)}. This mark cannot be restored — per R-02/FR-039 that is a ` +
        'fail-loud condition, never a silent reset to zero.',
    );
  }
  if (!('installationSequence' in parsed)) {
    throw new Error(
      `installationSequence high-water mark at ${path} is corrupt: missing the ` +
        '"installationSequence" field. This mark cannot be restored — per R-02/FR-039 that is ' +
        'a fail-loud condition, never a silent reset to zero.',
    );
  }
  return requireNonNegativeInteger(
    parsed.installationSequence,
    `installationSequence high-water mark at ${path}: "installationSequence"`,
  );
}

/**
 * Read the durable `installationSequence` high-water mark for a located
 * machine state.
 *
 * - Absent file (first-ever start): returns `INITIAL_HIGH_WATER_MARK` (0).
 * - Present and well-formed: returns the stored value.
 * - Present but corrupt/unparseable/wrong-shaped: THROWS, naming the
 *   problem (R-02/FR-039 — a mark that cannot be restored is fail-loud,
 *   never a silent reset to zero).
 */
export function readHighWaterMark(location: MachineStateLocation): number {
  const path = highWaterMarkPath(location);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) {
      return INITIAL_HIGH_WATER_MARK;
    }
    throw new Error(
      `cannot read the installationSequence high-water mark at ${path}: ${errorMessage(err)}. ` +
        'This mark cannot be restored — per R-02/FR-039 that is a fail-loud condition, never a ' +
        'silent reset to zero.',
    );
  }
  return parseHighWaterMarkFile(raw, path);
}

/** Write the mark file atomically: write to a sibling temp file, then rename over the target. */
function writeHighWaterMarkAtomic(path: string, value: number): void {
  const payload: HighWaterMarkFile = { installationSequence: value };
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeFileSync(tmpPath, JSON.stringify(payload), 'utf8');
  renameSync(tmpPath, path);
}

/**
 * Advance the durable `installationSequence` high-water mark to `next` and
 * return the new mark.
 *
 * MONOTONIC, NEVER BACKWARD (R-02): `next` must be greater than or equal to
 * the current durable mark.
 *   - `next` strictly greater than the current mark: a legitimate advance;
 *     persisted durably and returned.
 *   - `next` equal to the current mark: a legitimate no-op (idempotent
 *     re-advance to the same point); persisted (harmless) and returned.
 *   - `next` LESS than the current mark: FAILS LOUD. A request to move the
 *     mark backward can only be a caller bug — the whole point of this
 *     module is that the mark never regresses across restart (R-02); silently
 *     clamping or accepting a lower value would quietly undermine that
 *     guarantee instead of surfacing the bug that produced it. The durable
 *     mark is left unchanged.
 */
export function advanceHighWaterMark(location: MachineStateLocation, next: number): number {
  const target = requireNonNegativeInteger(next, 'advanceHighWaterMark(next)');
  const current = readHighWaterMark(location);
  if (target < current) {
    throw new Error(
      `advanceHighWaterMark: refusing to move the installationSequence high-water mark ` +
        `backward (current ${current} -> requested ${target}). The mark is durable and ` +
        'monotonic across restart (R-02/FR-039); a request to regress it is a caller bug, not ' +
        'a legitimate advance. The durable mark is unchanged.',
    );
  }
  const path = highWaterMarkPath(location);
  writeHighWaterMarkAtomic(path, target);
  return target;
}
