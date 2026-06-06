/**
 * Public surface of the design-control lint library.
 *
 * Import via `@/lint`. Exposes the `check-mockup-lofi` element/attribute
 * allowlist lint and its rule taxonomy.
 */

export type { LintRule, LintFinding, LintResult } from '@/lint/types';

export {
  type LintOptions,
  lintWireframe,
  ALLOWED_TAGS,
} from '@/lint/check-mockup-lofi';

export {
  type StylesheetPin,
  hashStylesheet,
  buildSketchKitPin,
  checkStylesheetIdentity,
} from '@/lint/stylesheet-pin';

export {
  type DisallowedCodepoint,
  isAllowedCodepoint,
  findDisallowedCodepoints,
  formatCodepoint,
} from '@/lint/codepoint';

export {
  GLOBAL_ATTRS,
  TAG_ATTRS,
  PRESENTATIONAL_ATTRS,
  URL_ATTRS,
  RESOURCE_URL_ATTRS,
} from '@/lint/allowlist';
