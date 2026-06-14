/**
 * Referee-request manifest schema (Phase 4 — v1-scaffold).
 *
 * This module declares the SCHEMA for a referee-request manifest and nothing
 * more: Phase 4 is schema-validation only — no execution, no capture, no
 * baseline promotion. The referee itself (Phase 5) is a gated evidence-spike
 * built last; this schema exists so Phase 4 can ship a contract Phase 5 will
 * not have to break.
 *
 * The manifest is mode-aware (a zod discriminated union on `mode`):
 *
 * - `scaffold`        — the referee-control block is OPTIONAL. A scaffold
 *                       manifest that omits it is valid (the v1-scaffold "NO
 *                       capture/baseline" boundary). When it IS supplied it is
 *                       fully validated (validated-when-present), so a malformed
 *                       referee-control field is still rejected.
 * - `referee-preview` — the referee-control block is REQUIRED. A referee-preview
 *                       manifest that omits it (or supplies it malformed) is
 *                       rejected.
 *
 * Everything here is STRUCTURE-ONLY: required sub-fields present, correct types,
 * non-empty strings, sha256 shape, the desktop+phone viewport contract. The
 * semantic rules (stable-region overlap, the 25%-oversized dynamic-region rule,
 * secret-token classification, baseline promotion) belong to Phase 5 execution,
 * not to this schema.
 */
import { z } from 'zod';
import {
  collectionRelativePathSchema,
  sha256HexSchema,
  viewportSchema,
} from '@/manifests/manifest-fields';

const REFEREE_REQUEST_MANIFEST_VERSION = 1;

const pathSchema = collectionRelativePathSchema;
const sha256Schema = sha256HexSchema;

const artifactRefSchema = z.object({
  path: pathSchema,
  sha256: sha256Schema,
});

/**
 * A declared-stable DOM region. Keyed (in Phase 5) by surface id + route/state +
 * viewport + capture-step; here we only require the locator and an optional
 * capture-step label to be present and well-shaped.
 */
const stableRegionSchema = z.object({
  id: z.string().min(1),
  locator: z.string().min(1),
  captureStep: z.string().min(1).optional(),
});

/**
 * A governed dynamic region: every such region must be named AND carry a
 * justification (specific / bounded / named / justified — the governance
 * contract). Structure-only: we require the justification string is present,
 * not that it is "good".
 */
const dynamicRegionSchema = z.object({
  id: z.string().min(1),
  locator: z.string().min(1),
  justification: z.string().min(1),
});

/** Deterministic capture recipe + its identity hash. Non-secret only. */
const captureConfigSchema = z.object({
  identityHash: sha256Schema,
  recipe: z.string().min(1),
});

const perViewportIdentitySchema = z.object({
  viewportId: z.string().min(1),
  identityHash: sha256Schema,
});

/**
 * Non-secret principal / auth metadata. A reference to a named storage-state is
 * allowed; secret tokens are NOT part of the manifest contract (default-deny is
 * a Phase-5 execution concern, but the schema only ever names a reference).
 */
const principalSchema = z.object({
  id: z.string().min(1),
  storageStateRef: z.string().min(1).optional(),
});

/** The referee-control block — the Phase-5 fields, defined here, structure-only. */
const refereeControlSchema = z.object({
  baseline: artifactRefSchema,
  candidate: artifactRefSchema,
  stableRegions: z.array(stableRegionSchema).min(1),
  dynamicRegions: z.array(dynamicRegionSchema),
  captureConfig: captureConfigSchema,
  perViewportIdentity: z.array(perViewportIdentitySchema).min(1),
  principal: principalSchema,
});

export type RefereeControl = z.infer<typeof refereeControlSchema>;

const baseManifestShape = {
  version: z.literal(REFEREE_REQUEST_MANIFEST_VERSION),
  surfaceId: z.string().min(1),
  routeState: z.string().min(1),
  viewports: z.array(viewportSchema).min(1),
  wireframe: artifactRefSchema,
  designSpec: z.object({
    path: pathSchema,
    version: z.string().min(1),
    sha256: sha256Schema,
  }),
  implementationCommit: z.string().min(1),
  changeIntentBrief: z.string().min(1),
} as const;

/** The scaffold-required viewport contract: at least one desktop (>=1280) and one phone (<=390). */
function requireDesktopAndPhone(viewports: readonly { readonly width: number }[], ctx: z.RefinementCtx): void {
  if (!viewports.some((viewport) => viewport.width >= 1280)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['viewports'],
      message: 'viewports must include at least one desktop viewport with width >= 1280',
    });
  }
  if (!viewports.some((viewport) => viewport.width <= 390)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['viewports'],
      message: 'viewports must include at least one phone viewport with width <= 390',
    });
  }
}

const scaffoldManifestSchema = z.object({
  mode: z.literal('scaffold'),
  ...baseManifestShape,
  // OPTIONAL in scaffold mode; fully validated WHEN present.
  referee: refereeControlSchema.optional(),
});

const refereePreviewManifestSchema = z.object({
  mode: z.literal('referee-preview'),
  ...baseManifestShape,
  // REQUIRED in referee-preview mode.
  referee: refereeControlSchema,
});

// The discriminated union members must be plain ZodObjects; the shared
// desktop+phone viewport contract is applied as a post-union refinement (both
// branches carry `viewports`).
export const refereeRequestManifestSchema = z
  .discriminatedUnion('mode', [scaffoldManifestSchema, refereePreviewManifestSchema])
  .superRefine((value, ctx) => requireDesktopAndPhone(value.viewports, ctx));

export type RefereeRequestManifest = z.infer<typeof refereeRequestManifestSchema>;

/**
 * Parse-and-validate a candidate referee-request manifest. Fail-loud: throws a
 * `ZodError` on any structural violation (no fallback, no partial manifest).
 * Callers that want a non-throwing result can use
 * {@link refereeRequestManifestSchema}.safeParse directly.
 */
export function parseRefereeRequestManifest(value: unknown): RefereeRequestManifest {
  return refereeRequestManifestSchema.parse(value);
}
