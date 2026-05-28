export type {
  ApplyOutcomeKind,
  CloseShippedOptions,
  CloseShippedOutcome,
  CloseShippedResult,
  CloseShippedSummary,
  CommitIssueReference,
  IssueReferenceGroup,
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
} from './apply.js';
