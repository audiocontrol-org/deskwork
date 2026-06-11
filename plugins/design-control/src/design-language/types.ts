/**
 * Shared types for the design-language spec convention (Phase 2).
 *
 * A design-language spec is a HAND-AUTHORABLE markdown artifact — the visual
 * *letter* reference of the design-control discipline (the lo-fi wireframe is
 * the UX *spirit*). The schema is allowlist-shaped like the rest of this
 * plugin: a closed kind vocabulary, a closed field-key set (typos surface as
 * findings, never silently drop), and per-rule structural requirements —
 * ≥1 live-CSS link, ≥1 example reference, ≥1 do/don't guidance line.
 *
 * Extracted so the pure-text schema axis (`schema.ts`) and the fs-backed
 * link-liveness axis (`link-liveness.ts`) share one taxonomy without a cycle
 * (mirrors `@/lint/types`).
 */

/**
 * Closed vocabulary of rule kinds, single-sourced as a `const ... as const`
 * array (mirroring `ENGINE_METHODS` / `FAILURE_MODES`): palette / type /
 * spacing tokens + the signature-component vocabulary.
 */
export const RULE_KINDS = ['palette', 'type', 'spacing', 'component'] as const;

export type DesignRuleKind = (typeof RULE_KINDS)[number];

/**
 * A rule's link to live CSS: a path to an author-written CSS file (relative to
 * the spec file) plus the selector the rule is anchored to. The selector may be
 * multi-token (descendant combinators); the path is the first whitespace-free
 * token of the `css:` field value.
 */
export interface CssLink {
  readonly path: string;
  readonly selector: string;
}

/** One structurally-valid rule parsed out of a design-language spec. */
export interface DesignSpecRule {
  /** The id from the `### rule: <id>` heading. */
  readonly id: string;
  /** Kind from the closed {@link RULE_KINDS} vocabulary. */
  readonly kind: DesignRuleKind;
  /** ≥1 live-CSS link (the link-liveness axis verifies each). */
  readonly cssLinks: readonly CssLink[];
  /** ≥1 example reference (structural presence only; truthfulness deferred). */
  readonly examples: readonly string[];
  /** `do:` guidance lines. */
  readonly dos: readonly string[];
  /** `don't:` guidance lines. */
  readonly donts: readonly string[];
}

/** Finding taxonomy across both axes (schema structure + link-liveness). */
export type DesignSpecFindingRule =
  // axis A — markdown schema structure
  | 'no-rules'
  | 'malformed-rule-heading'
  | 'duplicate-rule-id'
  | 'missing-kind'
  | 'unknown-kind'
  | 'missing-css-link'
  | 'malformed-css-link'
  | 'missing-example'
  | 'missing-guidance'
  | 'unknown-field'
  | 'empty-field'
  // axis B — static link-liveness against author-written CSS source
  | 'dead-link-file'
  | 'dead-link-selector';

export interface DesignSpecFinding {
  readonly rule: DesignSpecFindingRule;
  readonly message: string;
  /** The spec rule the finding is about, when rule-scoped. */
  readonly ruleId?: string;
  /** 1-based markdown source line, when known. */
  readonly line?: number;
}

/** The parsed spec: structurally-valid rules only (invalid rules are findings). */
export interface ParsedDesignSpec {
  readonly rules: readonly DesignSpecRule[];
}

export interface DesignSpecParseResult {
  /** True iff findings is empty. */
  readonly ok: boolean;
  readonly spec: ParsedDesignSpec;
  readonly findings: readonly DesignSpecFinding[];
}
