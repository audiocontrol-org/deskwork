import { describe, it, expect } from 'vitest';
import {
  appendBacklink,
  replaceWithWontfix,
  WorkplanDriftError,
} from '../promote-deferrals/workplan-edit.js';

const SAMPLE = `# Workplan

## Phase 1: Setup

### Task 1: Bootstrap

- [ ] TBD: figure out database schema for nested groups
- [x] done
- [ ] follow-up: review the migration script with the storage team

### Task 2: Implementation

- [ ] defer to next milestone — auth needs a redesign
`;

function lineOf(content: string, oneBased: number): string {
  return content.split('\n')[oneBased - 1] ?? '';
}

describe('appendBacklink', () => {
  it('appends [debt: #N] to the recorded line', () => {
    const next = appendBacklink({
      content: SAMPLE,
      sample: {
        lineNumber: 7,
        expectedText: '- [ ] TBD: figure out database schema for nested groups',
      },
      issueNumber: 189,
    });
    expect(lineOf(next, 7)).toBe(
      '- [ ] TBD: figure out database schema for nested groups [debt: #189]',
    );
    // Other lines untouched.
    expect(lineOf(next, 9)).toBe(
      '- [ ] follow-up: review the migration script with the storage team',
    );
  });

  it('refuses non-positive issue numbers', () => {
    expect(() =>
      appendBacklink({
        content: SAMPLE,
        sample: {
          lineNumber: 7,
          expectedText: '- [ ] TBD: figure out database schema for nested groups',
        },
        issueNumber: 0,
      }),
    ).toThrow(/positive integer/i);
    expect(() =>
      appendBacklink({
        content: SAMPLE,
        sample: {
          lineNumber: 7,
          expectedText: '- [ ] TBD: figure out database schema for nested groups',
        },
        issueNumber: -3,
      }),
    ).toThrow(/positive integer/i);
  });

  it('throws WorkplanDriftError when the line text drifted', () => {
    expect(() =>
      appendBacklink({
        content: SAMPLE,
        sample: {
          lineNumber: 7,
          expectedText: '- [ ] TBD: something completely different',
        },
        issueNumber: 189,
      }),
    ).toThrow(WorkplanDriftError);
  });

  it('throws WorkplanDriftError when line number is out of range', () => {
    expect(() =>
      appendBacklink({
        content: SAMPLE,
        sample: {
          lineNumber: 999,
          expectedText: '- [ ] TBD: figure out database schema for nested groups',
        },
        issueNumber: 189,
      }),
    ).toThrow(WorkplanDriftError);
  });

  it('refuses to double-link a line that already carries [debt: #N]', () => {
    const already = SAMPLE.replace(
      '- [ ] TBD: figure out database schema for nested groups',
      '- [ ] TBD: figure out database schema for nested groups [debt: #100]',
    );
    expect(() =>
      appendBacklink({
        content: already,
        sample: {
          lineNumber: 7,
          expectedText:
            '- [ ] TBD: figure out database schema for nested groups [debt: #100]',
        },
        issueNumber: 200,
      }),
    ).toThrow(WorkplanDriftError);
  });
});

describe('replaceWithWontfix', () => {
  it('strips the TBD: marker and appends (wontfix: ...)', () => {
    const reason =
      'nested groups conflict with the lane-immutability invariant Phase 4 codified';
    const next = replaceWithWontfix({
      content: SAMPLE,
      sample: {
        lineNumber: 7,
        expectedText: '- [ ] TBD: figure out database schema for nested groups',
      },
      reason,
    });
    expect(lineOf(next, 7)).toBe(
      `- [ ] figure out database schema for nested groups (wontfix: ${reason})`,
    );
  });

  it('strips the follow-up: marker', () => {
    const reason =
      'the storage team retired this surface in the v0.18 migration; no consumers remain';
    const next = replaceWithWontfix({
      content: SAMPLE,
      sample: {
        lineNumber: 9,
        expectedText: '- [ ] follow-up: review the migration script with the storage team',
      },
      reason,
    });
    expect(lineOf(next, 9)).toBe(
      `- [ ] review the migration script with the storage team (wontfix: ${reason})`,
    );
  });

  it('strips the defer marker', () => {
    const reason =
      'auth redesign was absorbed into the OIDC migration; the line is moot now';
    const next = replaceWithWontfix({
      content: SAMPLE,
      sample: {
        lineNumber: 13,
        expectedText: '- [ ] defer to next milestone — auth needs a redesign',
      },
      reason,
    });
    expect(lineOf(next, 13)).toBe(
      `- [ ] to next milestone — auth needs a redesign (wontfix: ${reason})`,
    );
  });

  it('preserves indentation when present', () => {
    const indented = `# Plan
  - [ ] TBD: nested indented item
`;
    const reason =
      'the indented surface is owned by an external collaborator; out-of-tree by design';
    const next = replaceWithWontfix({
      content: indented,
      sample: {
        lineNumber: 2,
        expectedText: '- [ ] TBD: nested indented item',
      },
      reason,
    });
    expect(lineOf(next, 2)).toBe(
      `  - [ ] nested indented item (wontfix: ${reason})`,
    );
  });

  it('throws WorkplanDriftError when the line drifted', () => {
    expect(() =>
      replaceWithWontfix({
        content: SAMPLE,
        sample: {
          lineNumber: 7,
          expectedText: '- [ ] TBD: a completely different thing',
        },
        reason: 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      }),
    ).toThrow(WorkplanDriftError);
  });

  it('refuses an empty reason', () => {
    expect(() =>
      replaceWithWontfix({
        content: SAMPLE,
        sample: {
          lineNumber: 7,
          expectedText: '- [ ] TBD: figure out database schema for nested groups',
        },
        reason: '   ',
      }),
    ).toThrow(/non-empty/i);
  });

  it('refuses to wontfix a line that already carries a [debt: #N] tag', () => {
    const already = SAMPLE.replace(
      '- [ ] TBD: figure out database schema for nested groups',
      '- [ ] TBD: figure out database schema for nested groups [debt: #100]',
    );
    expect(() =>
      replaceWithWontfix({
        content: already,
        sample: {
          lineNumber: 7,
          expectedText:
            '- [ ] TBD: figure out database schema for nested groups [debt: #100]',
        },
        reason:
          'the tracking issue already exists; promoting again would create a duplicate audit-trail entry',
      }),
    ).toThrow(WorkplanDriftError);
  });
});
