// Public entry point for /dw-lifecycle:worktree-report.

export { runWorktreeReport } from './scan.js';
export { formatMarkdown, formatJson } from './formatters.js';
export {
  evaluateStaleness,
  buildSignals,
  CANONICAL_SIGNAL_ORDER,
} from './staleness.js';
export type {
  WorktreeEntry,
  WorktreeReport,
  WorktreeReportOptions,
  StalenessSignal,
  WorktreeVerdict,
  RecommendedDisposition,
  PerSignalCheck,
  PrState,
  WorkingTreeState,
  FeatureDocLocation,
} from './types.js';
