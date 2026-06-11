/**
 * Public surface of the design-language spec convention (Phase 2):
 * markdown schema (axis A, pure) + static link-liveness (axis B, fs-backed)
 * + the file-level composition behind `bin/check-design-spec`.
 */

export {
  RULE_KINDS,
  type CssLink,
  type DesignRuleKind,
  type DesignSpecFinding,
  type DesignSpecFindingRule,
  type DesignSpecParseResult,
  type DesignSpecRule,
  type ParsedDesignSpec,
  type RuleScopedCssLink,
} from '@/design-language/types';
export { parseDesignSpec } from '@/design-language/schema';
export {
  checkCssLinkLiveness,
  checkLinkLiveness,
  cssDefinesSelector,
  type LivenessResult,
  type SkippedLink,
} from '@/design-language/link-liveness';
export {
  checkDesignSpecFile,
  runCheckDesignSpec,
  type CliIo,
  type DesignSpecCheckResult,
} from '@/design-language/check-spec-file';
