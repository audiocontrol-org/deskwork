/**
 * Shared types for the `check-mockup-lofi` lint. Extracted so the element/
 * attribute axis (`check-mockup-lofi.ts`) and the stylesheet identity-pin
 * (`stylesheet-pin.ts`) can share the rule taxonomy without a circular import.
 */

export type LintRule =
  // axis 1 — element/attribute allowlist
  | 'disallowed-element'
  | 'disallowed-attribute'
  | 'inline-style'
  | 'event-handler'
  | 'presentational-attribute'
  | 'data-uri'
  | 'external-resource'
  | 'disallowed-uri-scheme'
  | 'disallowed-link-rel'
  | 'disallowed-meta-name'
  | 'disallowed-input-type'
  | 'kit-root-missing'
  | 'stylesheet-filename-mismatch'
  // axis 2 — text-content codepoint allowlist
  | 'disallowed-codepoint'
  | 'punctuation-density'
  // axis 1.5 — stylesheet identity-pin
  | 'stylesheet-missing'
  | 'stylesheet-not-singleton'
  | 'stylesheet-path-mismatch'
  | 'stylesheet-unresolvable'
  | 'stylesheet-hash-mismatch'
  | 'stylesheet-sri-mismatch'
  | 'font-hash-mismatch'
  | 'font-missing';

export interface LintFinding {
  readonly rule: LintRule;
  readonly message: string;
  readonly tag?: string;
  readonly attr?: string;
}

export interface LintResult {
  readonly ok: boolean;
  readonly findings: readonly LintFinding[];
}
