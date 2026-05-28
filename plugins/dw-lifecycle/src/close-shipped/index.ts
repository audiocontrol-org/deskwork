export type {
  ApplyOutcomeKind,
  CloseShippedOptions,
  CloseShippedOutcome,
  CloseShippedResult,
  CloseShippedSummary,
  CommitIssueReference,
  EvidenceSource,
  IssueReferenceGroup,
  MergedIssueEvidence,
  ProvenanceEntry,
  ReferenceVerb,
  RunGh,
  RunGit,
  ScannedCommit,
} from './types.js';

export {
  CommitScanError,
  extractReferencesFromCommit,
  groupReferencesByIssue,
  parseLogOutput,
  scanAndGroup,
  scanCommits,
} from './commit-scanner.js';

export {
  TagResolutionError,
  assertTagsExist,
  listSemverTags,
  resolveDefaults,
} from './tag-resolver.js';

export {
  applyAll,
  buildCommentBody,
  buildEvidenceCommentBody,
} from './apply.js';

export { walkAuditLogs } from './audit-log-walker.js';
export type { AuditLogFinding } from './audit-log-walker.js';

export { walkToolingFeedback } from './tooling-feedback-walker.js';
export type { ToolingFeedbackFinding } from './tooling-feedback-walker.js';

export { walkWorkplans } from './workplan-walker.js';
export type { WorkplanFinding } from './workplan-walker.js';

export { mergeAll } from './merger.js';

export { buildReleaseNotesBody } from './release-notes.js';
