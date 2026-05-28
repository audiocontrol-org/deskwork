import { describe, expect, it } from 'vitest';
import { buildReleaseNotesBody } from '../close-shipped/release-notes.js';
import type { MergedIssueEvidence } from '../close-shipped/types.js';

function mkEvidence(args: {
  readonly issue: number;
  readonly sources: readonly MergedIssueEvidence['sources'][number][];
  readonly subject?: string;
  readonly orphan?: boolean;
}): MergedIssueEvidence {
  return {
    issue: args.issue,
    sources: args.sources,
    commits: [],
    verbs: [],
    primarySubject: args.subject ?? '',
    provenance: [],
    orphanSource: args.orphan ?? false,
    orphanReason: args.orphan ? 'mock-orphan' : null,
  };
}

describe('buildReleaseNotesBody', () => {
  it('renders the heading and the empty-state body when no issues', () => {
    const body = buildReleaseNotesBody({ toTag: 'v2.0.0', merged: [] });
    expect(body).toContain('## Pending verification');
    expect(body).toContain('no issues flagged');
    expect(body).toContain('v2.0.0');
  });

  it('renders one bullet per merged issue with subject and sources', () => {
    const body = buildReleaseNotesBody({
      toTag: 'v2.0.0',
      merged: [
        mkEvidence({
          issue: 42,
          sources: ['commit-log', 'audit-log'],
          subject: 'fix the thing',
        }),
        mkEvidence({
          issue: 100,
          sources: ['commit-log'],
          subject: 'feat: shiny',
        }),
      ],
    });
    expect(body).toContain('## Pending verification');
    expect(body).toContain(
      '- #42 — fix the thing (evidence: commit-log, audit-log)',
    );
    expect(body).toContain('- #100 — feat: shiny (evidence: commit-log)');
    expect(body).toContain('To verify: install v2.0.0');
  });

  it('marks orphan-source findings with [orphan-source]', () => {
    const body = buildReleaseNotesBody({
      toTag: 'v3.0.0',
      merged: [
        mkEvidence({
          issue: 7,
          sources: ['commit-log', 'audit-log'],
          subject: 'split signal',
          orphan: true,
        }),
      ],
    });
    expect(body).toContain('[orphan-source]');
  });

  it('elides the subject when empty', () => {
    const body = buildReleaseNotesBody({
      toTag: 'v1.0.0',
      merged: [
        mkEvidence({
          issue: 5,
          sources: ['workplan-checkbox'],
          subject: '',
        }),
      ],
    });
    expect(body).toContain('- #5 (evidence: workplan-checkbox)');
  });

  it('truncates very long subjects', () => {
    const long = 'a'.repeat(200);
    const body = buildReleaseNotesBody({
      toTag: 'v1.0.0',
      merged: [
        mkEvidence({
          issue: 5,
          sources: ['commit-log'],
          subject: long,
        }),
      ],
    });
    expect(body).toContain('...');
    expect(body).not.toContain(long);
  });
});
