/**
 * plugins/stack-control/src/scope-discovery/synthesis-error-hints.ts
 *
 * Hint-bearing wrapper for raw ajv schema-validation errors surfaced by
 * the `scope-inventory` subcommand. The raw ajv text tells the operator
 * what failed at the JSON-pointer level (e.g. `/modules: must NOT have
 * fewer than 1 items`) but nothing about *why* the constraint exists,
 * what a "module" means in this tool's vocabulary, or how to fix it.
 *
 * This module owns the lookup table that maps known schema-error shapes
 * to actionable hint paragraphs. Operators see the hint inline; the raw
 * ajv text remains available under a `(raw: ...)` suffix for diagnostic
 * use.
 *
 * The hint table is intentionally small — only well-understood failure
 * modes get a hint. Errors not in the table fall through with the
 * generic wrapper, which still preserves the raw text + adds the
 * "run with --debug for the full path" pointer.
 *
 * Friction-feedback provenance:
 *   - TF-015 (dogfood, low priority): "/modules: must NOT have fewer
 *     than 1 items" was the canonical cryptic-message that motivated
 *     this hint surface. The deskwork repo's layout (`packages/<pkg>/`,
 *     `plugins/<plugin>/`) doesn't match the audiocontrol pilot's
 *     `<module-root>/<feature-slug>/` convention; the schema relaxation
 *     in TF-016a permits an empty `modules:` array, but pre-relaxation
 *     adopters with the old schema (or with a different schema
 *     violation that produces a similar "minItems" complaint) deserve
 *     a hint that names the underlying assumption.
 */

/**
 * One hint table entry. The `matcher` is a substring check against the
 * ajv-formatted error line (instancePath + ": " + message + params).
 * Substring rather than regex because the message format is stable;
 * regex would buy nothing and risk catastrophic-backtracking shapes
 * if a future ajv version threads user-supplied content into the
 * message.
 */
interface HintEntry {
  readonly matcher: string;
  readonly hint: string;
}

/**
 * The known-shape hint table. Grows over time as new schema-validation
 * failure modes surface in dogfood passes. Order matters: the first
 * matching entry wins, so put more-specific matchers first.
 */
const HINT_TABLE: ReadonlyArray<HintEntry> = [
  {
    matcher: '/modules: must NOT have fewer than 1 items',
    hint:
      'manifest contains zero modules — scope-inventory walks ' +
      '`<module-root>/<feature-slug>/` paths to populate the modules ' +
      'array. For repos that don\'t use that layout (e.g. deskwork\'s ' +
      '`packages/<pkg>/` + `plugins/<plugin>/`), this is expected: the ' +
      'modules array stays empty and downstream consumers ignore it. ' +
      'If your modules live elsewhere, pass `--module-root <dir>` to ' +
      'point the slug extraction at the right tree. Pass ' +
      '`--no-require-modules` to silence the empty-modules advisory.',
  },
];

/**
 * Wrap a single raw ajv error line with a hint when one is registered;
 * fall back to the generic wrapper otherwise. The raw text is
 * preserved verbatim under a `(raw: ...)` suffix so the operator can
 * grep / search by the exact original message when correlating with
 * upstream ajv documentation.
 *
 * The output is a single line (no embedded newlines) so it composes
 * cleanly into the bulleted error block built by `wrapSchemaErrors`.
 * Multi-sentence hints stay on one line — terminals wrap, and the
 * single-line shape keeps the error block parse-safe for downstream
 * log shippers.
 */
export function wrapSchemaError(rawError: string): string {
  for (const entry of HINT_TABLE) {
    if (rawError.includes(entry.matcher)) {
      return `${entry.hint} (raw: ${rawError})`;
    }
  }
  return `${rawError} — run with --debug for the full path.`;
}

/**
 * Build the operator-facing schema-validation error block. The block
 * leads with a one-line summary, then one bullet per (hinted-or-raw)
 * error. The summary line carries the "manifest validation failed"
 * framing the orchestrator's catch-block re-uses to set exit code 2.
 *
 * Inputs are the raw ajv error strings as already formatted by
 * `formatAjvErrors` (so the bullet content stays a stable contract
 * for downstream parsers if any ever land).
 */
export function wrapSchemaErrors(rawErrors: ReadonlyArray<string>): string {
  if (rawErrors.length === 0) {
    return 'scope-inventory: synthesis manifest validation failed (no error details).';
  }
  const bullets = rawErrors.map((e) => `  - ${wrapSchemaError(e)}`);
  return [
    'scope-inventory: synthesis manifest validation failed:',
    ...bullets,
  ].join('\n');
}

/**
 * Detect whether an error message came from the schema-validation
 * path. The synthesis layer prefixes such errors with the literal
 * "fails the manifest schema" string (set in synthesis.ts when ajv
 * rejects the strawman). Used by the orchestrator to (a) decide
 * whether to swap in the hint-wrapped output and (b) set exit code 2
 * rather than the generic infra-error exit.
 */
export function isSchemaValidationError(errorMessage: string): boolean {
  return errorMessage.includes('fails the manifest schema');
}

/**
 * Extract the raw ajv error bullets from a synthesis-layer error
 * message. The synthesis layer's error shape is:
 *
 *   "synthesis produced a manifest that fails the manifest schema:
 *      - <ajv error 1>
 *      - <ajv error 2>"
 *
 * Returns the parsed bullets so the caller can re-format them via
 * `wrapSchemaErrors`. Lines that don't start with the bullet prefix
 * are dropped (defensive: keeps the parser tolerant of future
 * synthesis-layer message tweaks).
 */
export function extractAjvErrorsFromSynthesisMessage(
  message: string,
): ReadonlyArray<string> {
  const lines = message.split('\n');
  const bullets: string[] = [];
  const BULLET_PREFIX = '  - ';
  for (const line of lines) {
    if (line.startsWith(BULLET_PREFIX)) {
      bullets.push(line.slice(BULLET_PREFIX.length));
    }
  }
  return bullets;
}
