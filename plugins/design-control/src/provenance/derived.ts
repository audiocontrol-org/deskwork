/**
 * Wireframe provenance — the retroactive (`derived`) path.
 *
 * A wireframe is either DRIVING (authored before the implementation; the
 * artifact that drove the change) or DERIVED (reverse-engineered from an
 * already-existing surface). The derived path exists so a legacy surface can be
 * brought under the discipline, but with two hard properties from the spec:
 *
 *  1. The auto-derived draft is SNAPSHOTTED at derivation time, alongside its
 *     provenance, so acceptance has a baseline to diff against.
 *  2. Accepting a `derived` artifact REQUIRES a recorded operator edit — a
 *     non-empty byte diff between the stored snapshot and the accepted version.
 *     A bare state transition is not an edit.
 *
 * And a `derived` artifact NEVER satisfies a "wireframe drove implementation"
 * claim ({@link wireframeDroveImplementation}) — provenance distinguishes the
 * two modes precisely so the claim cannot be laundered through acceptance.
 *
 * Provenance is APPEND-ONCE over BOTH final targets: recording over an
 * existing sidecar fails loud in both modes and both directions, so a
 * `derived` record can never be silently flipped to `driving` by a later
 * call — and a derivation additionally refuses when a lingering snapshot
 * exists at its target path (AUDIT-20260611-11: an operator who removed only
 * the sidecar must not have the historical baseline silently overwritten).
 * Mode transitions require explicitly removing or superseding the existing
 * record AND, for derived records, its snapshot.
 *
 * Sidecar layout (per surface, in the operator-chosen provenance dir):
 *   <surfaceId>.provenance.json          — zod-validated provenance record
 *   <surfaceId>.derived-snapshot.html    — the auto-derived draft (derived only)
 */

import {
  existsSync,
  linkSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const PROVENANCE_VERSION = 1;

const sha256Hex = (content: string): string => createHash('sha256').update(content).digest('hex');

/**
 * `surfaceId` is interpolated into filesystem paths (sidecar + snapshot names),
 * so it MUST be a portable filename: alphanumeric first character, then only
 * letters, digits, `.`, `_`, `-`. This rejects `..` (the dot fails the
 * alphanumeric start anchor) and any `/` or `\` (not in the character class),
 * so an id can never escape the operator-chosen provenance directory or land
 * in an unintended subdirectory.
 */
const SURFACE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

const surfaceIdMessage = (surfaceId: string): string =>
  `Invalid surfaceId ${JSON.stringify(surfaceId)}: surfaceId is used as a filename, so it must ` +
  `match the portable-filename pattern ${String(SURFACE_ID_PATTERN)} — an alphanumeric first ` +
  `character, then only letters, digits, ".", "_", "-". Path separators and ".." are rejected ` +
  `so the sidecar and snapshot cannot escape the provenance directory.`;

const surfaceIdSchema = z
  .string()
  .min(1)
  .refine((id) => SURFACE_ID_PATTERN.test(id), {
    message: `surfaceId must match the portable-filename pattern ${String(SURFACE_ID_PATTERN)}`,
  });

/** Fail loud at every path-building entry point — no fallback, no sanitizing. */
function assertPortableSurfaceId(surfaceId: string): void {
  if (!SURFACE_ID_PATTERN.test(surfaceId)) {
    throw new Error(surfaceIdMessage(surfaceId));
  }
}

/**
 * Sidecar-stored filenames (`driving.wireframeFile`, `derived.snapshotFile`)
 * are joined back onto the operator-chosen directory, so they get the same
 * portable-filename defense as {@link SURFACE_ID_PATTERN} (AUDIT-20260611-10 —
 * the surfaceId fix's sibling). The pattern's alphanumeric start anchor rejects
 * `..`, and `/` / `\` are not in the character class, so a stored filename can
 * never escape the directory or land in a subdirectory; extension dots after
 * the first character pass (`my-surface.html`).
 */
const PORTABLE_FILENAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

const wireframeFileMessage = (field: string, value: string): string =>
  `Invalid ${field} ${JSON.stringify(value)}: ${field} is joined onto the provenance directory ` +
  `as a filename, so it must match the portable-filename pattern ` +
  `${String(PORTABLE_FILENAME_PATTERN)} — an alphanumeric first character, then only letters, ` +
  `digits, ".", "_", "-". Path separators and ".." are rejected so the bound artifact cannot ` +
  `escape the operator-chosen directory.`;

const portableFilenameSchema = (field: string) =>
  z
    .string()
    .min(1)
    .refine((name) => PORTABLE_FILENAME_PATTERN.test(name), {
      message: `${field} must match the portable-filename pattern ${String(PORTABLE_FILENAME_PATTERN)}`,
    });

/** Fail loud at record time — the both-sides mirror of {@link assertPortableSurfaceId}. */
function assertPortableWireframeFile(wireframeFile: string): void {
  if (!PORTABLE_FILENAME_PATTERN.test(wireframeFile)) {
    throw new Error(wireframeFileMessage('wireframeFile', wireframeFile));
  }
}

const drivingSchema = z.object({
  version: z.literal(PROVENANCE_VERSION),
  surfaceId: surfaceIdSchema,
  mode: z.literal('driving'),
  createdAt: z.string().datetime(),
  driving: z.object({
    /** Filename (dir-relative, portable — never a path) of the wireframe this record certifies. */
    wireframeFile: portableFilenameSchema('wireframeFile'),
    /** sha256 (hex) of the wireframe bytes as recorded — tamper evidence. */
    wireframeSha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
});

const derivedSchema = z.object({
  version: z.literal(PROVENANCE_VERSION),
  surfaceId: surfaceIdSchema,
  mode: z.literal('derived'),
  createdAt: z.string().datetime(),
  derived: z.object({
    /** Filename (dir-relative, portable — never a path) of the snapshot stored at derivation time. */
    snapshotFile: portableFilenameSchema('snapshotFile'),
    /** sha256 (hex) of the snapshot bytes as recorded — tamper evidence. */
    snapshotSha256: z.string().regex(/^[0-9a-f]{64}$/),
    /** What the draft was derived FROM (route, URL, file — operator-meaningful). */
    source: z.string().min(1),
  }),
});

const provenanceSchema = z.discriminatedUnion('mode', [drivingSchema, derivedSchema]);

export type WireframeProvenance = z.infer<typeof provenanceSchema>;

export interface ProvenanceFinding {
  readonly rule: 'derived-unedited';
  readonly message: string;
}

export interface AcceptanceResult {
  readonly ok: boolean;
  readonly findings: readonly ProvenanceFinding[];
}

const sidecarPath = (dir: string, surfaceId: string): string =>
  join(dir, `${surfaceId}.provenance.json`);

/**
 * The single chokepoint both recorders write through. Provenance is
 * append-once: if a sidecar already exists for the surface — in ANY mode —
 * writing fails loud. Without this, a later `recordDrivingWireframe` call
 * could silently flip a `derived` record to `driving` (orphaning the
 * derivation-time snapshot), after which {@link wireframeDroveImplementation}
 * returns true — laundering the exact claim this module exists to prevent.
 * Mode transitions are NOT a write-over; they require explicitly removing or
 * superseding the existing record as a separate, deliberate operation.
 */
function assertAppendOnce(dir: string, provenance: WireframeProvenance): string {
  const path = sidecarPath(dir, provenance.surfaceId);
  if (existsSync(path)) {
    const existing = loadProvenance(dir, provenance.surfaceId);
    throw new Error(
      `Refusing to record ${provenance.mode} provenance for surface "${provenance.surfaceId}": ` +
        `a ${existing.mode} record already exists at ${path}. Provenance is append-once — ` +
        `overwriting would silently rewrite the surface's mode and its recorded baseline. ` +
        `Re-recording requires explicitly removing or superseding the existing record ` +
        `(and, for a derived record, its stored snapshot) first.`,
    );
  }
  return path;
}

function writeProvenance(dir: string, provenance: WireframeProvenance): void {
  const path = assertAppendOnce(dir, provenance);
  writeFileSync(path, JSON.stringify(provenance, null, 2) + '\n');
}

/**
 * Failure-path cleanup for staged temp files. Swallows secondary errors
 * deliberately: the caller is about to rethrow the ORIGINAL failure, and a
 * cleanup hiccup (e.g. permissions just changed) must not mask it. This is
 * cleanup, not a fallback — the operation still fails loud.
 */
function bestEffortRemove(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
}

/**
 * Record a DRIVING wireframe's provenance (the authored-first path). The record
 * binds the artifact it certifies: `wireframeFile` (dir-relative filename of
 * the lint-green wireframe, which exists by this point — lint precedes
 * provenance in the skill's step ordering) is read and hashed at record time,
 * so a later wholesale replacement of the wireframe is tamper-evident
 * ({@link verifyDrivingWireframe}), mirroring the derived path's snapshot hash.
 */
export function recordDrivingWireframe(input: {
  dir: string;
  surfaceId: string;
  /** Filename (within dir) of the wireframe HTML this record certifies. */
  wireframeFile: string;
  createdAt?: Date;
}): WireframeProvenance {
  assertPortableSurfaceId(input.surfaceId);
  assertPortableWireframeFile(input.wireframeFile);
  const wireframePath = join(input.dir, input.wireframeFile);
  if (!existsSync(wireframePath)) {
    throw new Error(
      `Cannot record driving provenance for surface "${input.surfaceId}": wireframe file ` +
        `${wireframePath} does not exist. The driving record binds the artifact it certifies ` +
        `by filename + hash, so the lint-green wireframe must be on disk at record time ` +
        `(lint precedes provenance — see the wireframe skill's step ordering).`,
    );
  }
  const provenance: WireframeProvenance = {
    version: PROVENANCE_VERSION,
    surfaceId: input.surfaceId,
    mode: 'driving',
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    driving: {
      wireframeFile: input.wireframeFile,
      wireframeSha256: sha256Hex(readFileSync(wireframePath, 'utf8')),
    },
  };
  writeProvenance(input.dir, provenance);
  return provenance;
}

/**
 * Record a DERIVED draft at derivation time: store the auto-derived snapshot
 * AND the provenance sidecar in one move, so the acceptance diff always has its
 * baseline. The snapshot hash is recorded for tamper evidence.
 */
export function recordDerivation(input: {
  dir: string;
  surfaceId: string;
  derivedHtml: string;
  source: string;
  createdAt?: Date;
}): WireframeProvenance {
  assertPortableSurfaceId(input.surfaceId);
  const snapshotFile = `${input.surfaceId}.derived-snapshot.html`;
  const provenance: WireframeProvenance = {
    version: PROVENANCE_VERSION,
    surfaceId: input.surfaceId,
    mode: 'derived',
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    derived: {
      snapshotFile,
      snapshotSha256: sha256Hex(input.derivedHtml),
      source: input.source,
    },
  };
  // The append-once refusals fire BEFORE any byte hits disk — otherwise a
  // refused re-derivation would have already clobbered (or littered next to)
  // the existing surface's derivation-time baseline.
  const sidecarTarget = assertAppendOnce(input.dir, provenance);
  const snapshotTarget = join(input.dir, snapshotFile);
  // Append-once covers the snapshot target too (AUDIT-20260611-11): the
  // sidecar check alone misses the case where the operator removed the
  // record but left the historical snapshot — a rename-promote over it would
  // silently destroy the old baseline before the sidecar commit point.
  if (existsSync(snapshotTarget)) {
    throw new Error(
      `Refusing to record derived provenance for surface "${input.surfaceId}": a derivation-time ` +
        `snapshot already exists at ${snapshotTarget} with no sidecar referencing it (likely a ` +
        `previous record was only partially removed). Provenance is append-once for BOTH the ` +
        `sidecar and the snapshot — promoting over it would silently destroy the historical ` +
        `baseline. Remove the lingering snapshot too (or move it aside), then re-derive.`,
    );
  }
  // All-or-nothing commit (AUDIT-20260611-07): two sequential writes to the
  // final paths can be interrupted between them, leaving a committed sidecar
  // whose snapshot does not exist (or vice versa). Instead, stage BOTH
  // artifacts as temp files in the same directory, then promote each only
  // after both staged writes succeeded.
  const stagedSnapshot = `${snapshotTarget}.tmp-${process.pid}`;
  const stagedSidecar = `${sidecarTarget}.tmp-${process.pid}`;
  let snapshotPromoted = false;
  try {
    writeFileSync(stagedSnapshot, input.derivedHtml);
    writeFileSync(stagedSidecar, JSON.stringify(provenance, null, 2) + '\n');
    // Promote snapshot first, sidecar last: the sidecar is the commit point.
    // The snapshot promote is NO-CLOBBER (linkSync throws EEXIST if the
    // target appeared between the check above and this point — renameSync
    // would silently overwrite on POSIX), so a pre-existing baseline can
    // never be destroyed even under a race. If the process dies between the
    // two promotes, a snapshot without a sidecar is inert debris at worst —
    // nothing reads it (loadProvenance fails loud on the absent sidecar).
    // The inverse ordering would commit a sidecar whose recorded snapshot
    // does not exist — a live record with a missing baseline that breaks
    // checkDerivedAcceptance.
    linkSync(stagedSnapshot, snapshotTarget);
    snapshotPromoted = true;
    unlinkSync(stagedSnapshot);
    renameSync(stagedSidecar, sidecarTarget);
  } catch (error) {
    // Safe to remove the promoted snapshot: linkSync's no-clobber semantics
    // guarantee THIS call created it, so no pre-existing bytes are touched.
    if (snapshotPromoted) bestEffortRemove(snapshotTarget);
    bestEffortRemove(stagedSnapshot);
    bestEffortRemove(stagedSidecar);
    throw error;
  }
  return provenance;
}

/** Load + zod-validate a surface's provenance sidecar. Fails loud when absent/malformed. */
export function loadProvenance(dir: string, surfaceId: string): WireframeProvenance {
  assertPortableSurfaceId(surfaceId);
  const path = sidecarPath(dir, surfaceId);
  if (!existsSync(path)) {
    throw new Error(
      `No provenance sidecar for surface "${surfaceId}" at ${path}. ` +
        `Record provenance at authoring/derivation time (recordDrivingWireframe / recordDerivation).`,
    );
  }
  const parsed = provenanceSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (parsed.surfaceId !== surfaceId) {
    throw new Error(
      `Provenance sidecar identity mismatch at ${path}: requested surface "${surfaceId}" but the ` +
        `sidecar records surfaceId "${parsed.surfaceId}". The sidecar was likely copied or renamed ` +
        `to another surface's filename — its snapshot and hash belong to "${parsed.surfaceId}", so ` +
        `it cannot vouch for "${surfaceId}". Remove the misplaced sidecar, then record provenance ` +
        `for "${surfaceId}" (recording refuses to overwrite an existing sidecar).`,
    );
  }
  return parsed;
}

/**
 * The acceptance gate for `derived` artifacts: the accepted version must carry
 * a recorded operator edit — a non-empty byte diff against the snapshot stored
 * at derivation time. Driving wireframes pass through (the gate is mode-scoped).
 * Fails loud if the stored snapshot no longer matches its recorded hash — a
 * tampered baseline cannot certify an edit.
 */
export function checkDerivedAcceptance(
  dir: string,
  surfaceId: string,
  acceptedHtml: string,
): AcceptanceResult {
  const provenance = loadProvenance(dir, surfaceId);
  if (provenance.mode !== 'derived') {
    return { ok: true, findings: [] };
  }
  const snapshotPath = join(dir, provenance.derived.snapshotFile);
  const snapshot = readFileSync(snapshotPath, 'utf8');
  if (sha256Hex(snapshot) !== provenance.derived.snapshotSha256) {
    throw new Error(
      `Derived snapshot ${snapshotPath} does not match the hash recorded at derivation time — ` +
        `the baseline was modified after recording, so the operator-edit diff cannot be trusted. ` +
        `Remove the existing record AND the stored snapshot, then re-derive the draft to ` +
        `re-establish a baseline (recording refuses to overwrite an existing sidecar or a ` +
        `lingering snapshot).`,
    );
  }
  if (acceptedHtml === snapshot) {
    return {
      ok: false,
      findings: [
        {
          rule: 'derived-unedited',
          message:
            `Surface "${surfaceId}": the accepted artifact is byte-identical to the auto-derived ` +
            `snapshot. Accepting a derived wireframe requires a recorded operator edit ` +
            `(non-empty diff against the derivation-time snapshot), not just a state transition.`,
        },
      ],
    };
  }
  return { ok: true, findings: [] };
}

/**
 * Whether this wireframe supports a "wireframe drove implementation" claim.
 * Only a DRIVING wireframe does; a `derived` one never does, edited or not —
 * it was reverse-engineered from the surface it would be claiming to have driven.
 */
export function wireframeDroveImplementation(provenance: WireframeProvenance): boolean {
  return provenance.mode === 'driving';
}

/**
 * Verify a DRIVING record against the artifact it certifies, the way
 * {@link checkDerivedAcceptance} checks the derived snapshot: load the
 * provenance, require `mode === 'driving'`, re-hash the bound wireframe file,
 * and fail loud on a mismatch — a record whose wireframe was replaced after
 * recording cannot certify the "wireframe drove implementation" claim.
 * Returns the (now hash-verified) provenance.
 */
export function verifyDrivingWireframe(dir: string, surfaceId: string): WireframeProvenance {
  const provenance = loadProvenance(dir, surfaceId);
  if (provenance.mode !== 'driving') {
    throw new Error(
      `Surface "${surfaceId}" has ${provenance.mode} provenance, not driving — a derived ` +
        `artifact never supports a "wireframe drove implementation" claim, so there is no ` +
        `driving binding to verify.`,
    );
  }
  const wireframePath = join(dir, provenance.driving.wireframeFile);
  if (!existsSync(wireframePath)) {
    throw new Error(
      `Driving provenance for surface "${surfaceId}" binds wireframe file ${wireframePath}, ` +
        `but that file no longer exists — the record cannot certify an artifact that is gone. ` +
        `Restore the wireframe, or remove the existing record and re-record provenance ` +
        `(recording refuses to overwrite an existing sidecar).`,
    );
  }
  if (sha256Hex(readFileSync(wireframePath, 'utf8')) !== provenance.driving.wireframeSha256) {
    throw new Error(
      `Wireframe ${wireframePath} does not match the hash recorded for surface "${surfaceId}" ` +
        `at recording time — the artifact was modified or replaced after the driving record was ` +
        `written, so the record cannot certify it. Remove the existing record, then re-lint and ` +
        `re-record provenance for the current wireframe (recording refuses to overwrite an ` +
        `existing sidecar).`,
    );
  }
  return provenance;
}
