// Release-notes body renderer for /dw-lifecycle:close-shipped.
//
// When invoked with --release-notes-body, the subcommand emits ONLY
// this markdown body (no other output) so the operator can pipe it
// into `gh release edit v<version> --notes "<body>"`.
//
// Format:
//
//   ## Pending verification
//
//   Shipped in v<version>; awaiting operator verification per the
//   issue-closure-requires-formally-installed-release rule.
//
//   - #NNN — <primary subject> (evidence: commit-log, audit-log)
//   - #NNN — <primary subject> (evidence: commit-log)
//
//   To verify: install v<version>, reproduce each issue against the
//   installed release, close with verification confirmation.

import type { MergedIssueEvidence } from './types.js';

export interface ReleaseNotesArgs {
  readonly toTag: string;
  readonly merged: readonly MergedIssueEvidence[];
}

export function buildReleaseNotesBody(args: ReleaseNotesArgs): string {
  const { toTag, merged } = args;
  const lines: string[] = [];
  lines.push('## Pending verification');
  lines.push('');
  if (merged.length === 0) {
    lines.push(
      `Shipped in ${toTag}; no issues flagged for verification by any evidence source.`,
    );
    lines.push('');
    return lines.join('\n');
  }
  lines.push(
    `Shipped in ${toTag}; awaiting operator verification per the issue-closure-requires-formally-installed-release rule.`,
  );
  lines.push('');
  for (const evidence of merged) {
    const subjectPart =
      evidence.primarySubject === ''
        ? ''
        : ` — ${truncateSubject(evidence.primarySubject)}`;
    const sourceList = evidence.sources.join(', ');
    const orphanMarker = evidence.orphanSource ? ' [orphan-source]' : '';
    lines.push(
      `- #${evidence.issue}${subjectPart} (evidence: ${sourceList})${orphanMarker}`,
    );
  }
  lines.push('');
  lines.push(
    `To verify: install ${toTag}, reproduce each issue against the installed release, close with verification confirmation.`,
  );
  lines.push('');
  return lines.join('\n');
}

function truncateSubject(subject: string): string {
  const maxLen = 100;
  const trimmed = subject.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 3)}...`;
}
