/**
 * Public surface of the design-control lint library.
 *
 * Import via `@/lint`. Exposes the `check-mockup-lofi` element/attribute
 * allowlist lint and its rule taxonomy.
 */

export {
  type LintRule,
  type LintFinding,
  type LintResult,
  lintWireframe,
  ALLOWED_TAGS,
} from '@/lint/check-mockup-lofi';

export {
  GLOBAL_ATTRS,
  TAG_ATTRS,
  PRESENTATIONAL_ATTRS,
  RESOURCE_URL_ATTRS,
} from '@/lint/allowlist';
