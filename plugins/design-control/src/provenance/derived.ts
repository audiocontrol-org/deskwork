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
 * Sidecar layout (per surface, in the operator-chosen provenance dir):
 *   <surfaceId>.provenance.json          — zod-validated provenance record
 *   <surfaceId>.derived-snapshot.html    — the auto-derived draft (derived only)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

const drivingSchema = z.object({
  version: z.literal(PROVENANCE_VERSION),
  surfaceId: surfaceIdSchema,
  mode: z.literal('driving'),
  createdAt: z.string().datetime(),
  driving: z.object({
    /** Filename (dir-relative) of the wireframe this record certifies. */
    wireframeFile: z.string().min(1),
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
    /** Filename (dir-relative) of the snapshot stored at derivation time. */
    snapshotFile: z.string().min(1),
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

function writeProvenance(dir: string, provenance: WireframeProvenance): void {
  writeFileSync(
    sidecarPath(dir, provenance.surfaceId),
    JSON.stringify(provenance, null, 2) + '\n',
  );
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
  writeFileSync(join(input.dir, snapshotFile), input.derivedHtml);
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
  writeProvenance(input.dir, provenance);
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
        `it cannot vouch for "${surfaceId}". Re-record provenance for "${surfaceId}".`,
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
        `Re-derive the draft to re-establish a baseline.`,
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
        `Restore the wireframe or re-record provenance.`,
    );
  }
  if (sha256Hex(readFileSync(wireframePath, 'utf8')) !== provenance.driving.wireframeSha256) {
    throw new Error(
      `Wireframe ${wireframePath} does not match the hash recorded for surface "${surfaceId}" ` +
        `at recording time — the artifact was modified or replaced after the driving record was ` +
        `written, so the record cannot certify it. Re-lint and re-record provenance for the ` +
        `current wireframe.`,
    );
  }
  return provenance;
}
