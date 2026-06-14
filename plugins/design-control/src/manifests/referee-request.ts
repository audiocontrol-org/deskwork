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
 *
 * STRICTNESS: every object in this manifest — both discriminated-union branches,
 * the referee-control block, and every nested object — is `.strict()`, so an
 * unknown key never silently drops. A misspelled `refree` block, a stray
 * secret-bearing field, or a typo'd nested key fails validation instead of being
 * stripped. `version` (a literal) is the forward-compatibility axis: a new
 * manifest version is how new fields are introduced, NOT by appending unknown
 * keys to v1.
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

const artifactRefSchema = z
  .object({
    path: pathSchema,
    sha256: sha256Schema,
  })
  .strict();

/**
 * A declared-stable DOM region. Keyed (in Phase 5) by surface id + route/state +
 * viewport + capture-step; here we only require the locator and an optional
 * capture-step label to be present and well-shaped.
 */
const stableRegionSchema = z
  .object({
    id: z.string().min(1),
    locator: z.string().min(1),
    captureStep: z.string().min(1).optional(),
  })
  .strict();

/**
 * A governed dynamic region: every such region must be named AND carry a
 * justification (specific / bounded / named / justified — the governance
 * contract). Structure-only: we require the justification string is present,
 * not that it is "good".
 */
const dynamicRegionSchema = z
  .object({
    id: z.string().min(1),
    locator: z.string().min(1),
    justification: z.string().min(1),
  })
  .strict();

/**
 * Deterministic capture recipe + its identity hash. Non-secret only.
 *
 * STRICT by contract (as is every object in this manifest): an unexpected key
 * fails validation rather than being silently stripped. This object's contract
 * is explicitly "secrets out", so a stray secret-bearing field (e.g. a token)
 * must be REJECTED, not ignored — "schema passed" must mean "no forbidden extra
 * fields".
 */
const captureConfigSchema = z
  .object({
    identityHash: sha256Schema,
    recipe: z.string().min(1),
  })
  .strict();

const perViewportIdentitySchema = z
  .object({
    viewportId: z.string().min(1),
    identityHash: sha256Schema,
  })
  .strict();

/**
 * Non-secret principal / auth metadata. A reference to a named storage-state is
 * allowed; secret tokens are NOT part of the manifest contract (default-deny is
 * a Phase-5 execution concern, but the schema only ever names a reference).
 *
 * STRICT by contract (same rationale as captureConfigSchema): a stray
 * secret-bearing key (e.g. a token) must be REJECTED, not silently stripped.
 */
const principalSchema = z
  .object({
    id: z.string().min(1),
    storageStateRef: z.string().min(1).optional(),
  })
  .strict();

/** The referee-control block — the Phase-5 fields, defined here, structure-only. */
const refereeControlSchema = z
  .object({
    baseline: artifactRefSchema,
    candidate: artifactRefSchema,
    stableRegions: z.array(stableRegionSchema).min(1),
    dynamicRegions: z.array(dynamicRegionSchema),
    captureConfig: captureConfigSchema,
    perViewportIdentity: z.array(perViewportIdentitySchema).min(1),
    principal: principalSchema,
  })
  .strict();

export type RefereeControl = z.infer<typeof refereeControlSchema>;

const baseManifestShape = {
  version: z.literal(REFEREE_REQUEST_MANIFEST_VERSION),
  surfaceId: z.string().min(1),
  routeState: z.string().min(1),
  viewports: z.array(viewportSchema).min(1),
  wireframe: artifactRefSchema,
  designSpec: z
    .object({
      path: pathSchema,
      version: z.string().min(1),
      sha256: sha256Schema,
    })
    .strict(),
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

/**
 * Reject any manifest whose declared `viewports[*].id` contains a duplicate
 * (AUDIT-20260614-21). Two viewports sharing an id (e.g. both `"desktop"`)
 * would collapse to one Set member and let `requirePerViewportIdentityCoverage`
 * report a FALSE exact-coverage match — so the duplicate is the root problem and
 * must be flagged independently, before identity coverage is evaluated.
 */
function requireUniqueViewportIds(
  viewports: readonly { readonly id: string }[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const viewport of viewports) {
    if (seen.has(viewport.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['viewports'],
        message: `duplicate viewport id "${viewport.id}"; each declared viewport must have a unique id`,
      });
    }
    seen.add(viewport.id);
  }
}

/**
 * Per-viewport-identity referential integrity (AUDIT-20260614-19). When a
 * referee-control block is present, the set of `perViewportIdentity[*].viewportId`
 * must correspond EXACTLY to the set of declared `viewports[*].id`: every
 * declared viewport has an identity entry, there are no duplicate viewportIds,
 * and there is no identity entry for an undeclared viewport. Structure-only —
 * referential integrity over the manifest's own fields; no filesystem, no
 * execution.
 */
function requirePerViewportIdentityCoverage(
  viewports: readonly { readonly id: string }[],
  perViewportIdentity: readonly { readonly viewportId: string }[],
  ctx: z.RefinementCtx,
): void {
  const declared = new Set(viewports.map((viewport) => viewport.id));
  const seen = new Set<string>();
  for (const entry of perViewportIdentity) {
    if (seen.has(entry.viewportId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referee', 'perViewportIdentity'],
        message: `duplicate perViewportIdentity entry for viewport "${entry.viewportId}"`,
      });
    }
    seen.add(entry.viewportId);
    if (!declared.has(entry.viewportId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referee', 'perViewportIdentity'],
        message: `perViewportIdentity references undeclared viewport "${entry.viewportId}"`,
      });
    }
  }
  for (const id of declared) {
    if (!seen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referee', 'perViewportIdentity'],
        message: `declared viewport "${id}" has no perViewportIdentity entry`,
      });
    }
  }
}

// Both branches are STRICT: a misspelled top-level key (e.g. `refree`) or a stray
// secret-bearing field fails validation rather than being silently stripped and
// mistaken for "referee omitted". `.strict()` still returns a ZodObject, so
// `z.discriminatedUnion('mode', [...])` continues to accept both branches.
const scaffoldManifestSchema = z
  .object({
    mode: z.literal('scaffold'),
    ...baseManifestShape,
    // OPTIONAL in scaffold mode; fully validated WHEN present.
    referee: refereeControlSchema.optional(),
  })
  .strict();

const refereePreviewManifestSchema = z
  .object({
    mode: z.literal('referee-preview'),
    ...baseManifestShape,
    // REQUIRED in referee-preview mode.
    referee: refereeControlSchema,
  })
  .strict();

// The discriminated union members must be plain ZodObjects; the shared
// desktop+phone viewport contract is applied as a post-union refinement (both
// branches carry `viewports`).
export const refereeRequestManifestSchema = z
  .discriminatedUnion('mode', [scaffoldManifestSchema, refereePreviewManifestSchema])
  .superRefine((value, ctx) => {
    // Duplicate viewport ids are the root problem — flag them BEFORE/independent
    // of identity coverage so a duplicate can't masquerade as a coverage match.
    requireUniqueViewportIds(value.viewports, ctx);
    requireDesktopAndPhone(value.viewports, ctx);
    // Referential integrity applies whenever a referee block is present — on the
    // referee-preview branch (always) and the scaffold branch (when supplied).
    if (value.referee) {
      requirePerViewportIdentityCoverage(value.viewports, value.referee.perViewportIdentity, ctx);
    }
  });

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
