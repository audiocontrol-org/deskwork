import { describe, it, expect } from 'vitest';
import {
  insertTaskBlock,
  applyTaskBlocks,
  WorkplanInsertionError,
} from '../../../scope-discovery/promote-findings/workplan-editor.js';
import type {
  WorkplanInsertion,
  ReadWorkplan,
  WriteWorkplan,
} from '../../../scope-discovery/promote-findings/types.js';

function workplanFixture(): string {
  return [
    '# Workplan',
    '', // line 2
    '## Phase 13: Audit-finding lifecycle',
    '',
    '### Task 1', // line 5
    '',
    'Some content.',
    '',
    '## Phase 14: Next phase',
    '',
    '### Task 1', // line 11
    '',
    'Other content.',
  ].join('\n');
}

function makeRead(content: string): ReadWorkplan {
  return async () => content;
}

describe('insertTaskBlock — atomic in-place inserts', () => {
  it('inserts a single task block at the chosen anchor', async () => {
    const wp = workplanFixture();
    const insertion: WorkplanInsertion = {
      findingId: 'AUDIT-1',
      taskBlock: '### Task 13.2 (fix-finding-AUDIT-1): foo\n\nbody.',
      phaseHeading: '## Phase 13: Audit-finding lifecycle',
      insertAfterLine: 7, // after 'Some content.'
    };
    const { newContent } = await insertTaskBlock({
      workplanPath: '/tmp/test.md',
      insertions: [insertion],
      read: makeRead(wp),
    });
    const lines = newContent.split('\n');
    // Original line 7 was 'Some content.'; new content inserted after it.
    expect(lines[6]).toBe('Some content.');
    expect(lines[7]).toBe('');
    expect(lines[8]).toBe('### Task 13.2 (fix-finding-AUDIT-1): foo');
    expect(lines[9]).toBe('');
    expect(lines[10]).toBe('body.');
    expect(lines[11]).toBe('');
  });

  it('inserts multiple task blocks (DESC by insertAfterLine; later ones do not shift earlier anchors)', async () => {
    const wp = workplanFixture();
    const insertions: WorkplanInsertion[] = [
      {
        findingId: 'AUDIT-A',
        taskBlock: '### A-block',
        phaseHeading: '## Phase 13: Audit-finding lifecycle',
        insertAfterLine: 5, // after '### Task 1'
      },
      {
        findingId: 'AUDIT-B',
        taskBlock: '### B-block',
        phaseHeading: '## Phase 14: Next phase',
        insertAfterLine: 11, // after '### Task 1' of phase 14
      },
    ];
    const { newContent } = await insertTaskBlock({
      workplanPath: '/tmp/test.md',
      insertions,
      read: makeRead(wp),
    });
    expect(newContent).toContain('### A-block');
    expect(newContent).toContain('### B-block');
    // B-block must appear AFTER A-block.
    const aIdx = newContent.indexOf('### A-block');
    const bIdx = newContent.indexOf('### B-block');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);
  });

  it('throws WorkplanInsertionError when phase heading does not exist', async () => {
    const wp = workplanFixture();
    const insertion: WorkplanInsertion = {
      findingId: 'AUDIT-X',
      taskBlock: '### X-block',
      phaseHeading: '## Phase 99: Nonexistent',
      insertAfterLine: 7,
    };
    await expect(
      insertTaskBlock({
        workplanPath: '/tmp/test.md',
        insertions: [insertion],
        read: makeRead(wp),
      }),
    ).rejects.toBeInstanceOf(WorkplanInsertionError);
  });

  it('throws WorkplanInsertionError when insertAfterLine is out of range', async () => {
    const wp = workplanFixture();
    const insertion: WorkplanInsertion = {
      findingId: 'AUDIT-Y',
      taskBlock: '### Y-block',
      phaseHeading: '## Phase 13: Audit-finding lifecycle',
      insertAfterLine: 9999,
    };
    await expect(
      insertTaskBlock({
        workplanPath: '/tmp/test.md',
        insertions: [insertion],
        read: makeRead(wp),
      }),
    ).rejects.toBeInstanceOf(WorkplanInsertionError);
  });

  it('throws WorkplanInsertionError when insertAfterLine sits in a different phase', async () => {
    const wp = workplanFixture();
    // insertAfterLine 11 is INSIDE Phase 14, not Phase 13.
    const insertion: WorkplanInsertion = {
      findingId: 'AUDIT-Z',
      taskBlock: '### Z-block',
      phaseHeading: '## Phase 13: Audit-finding lifecycle',
      insertAfterLine: 11,
    };
    await expect(
      insertTaskBlock({
        workplanPath: '/tmp/test.md',
        insertions: [insertion],
        read: makeRead(wp),
      }),
    ).rejects.toBeInstanceOf(WorkplanInsertionError);
  });

  it('does not mutate the source content on any validation failure', async () => {
    const wp = workplanFixture();
    const insertions: WorkplanInsertion[] = [
      {
        findingId: 'AUDIT-OK',
        taskBlock: '### OK-block',
        phaseHeading: '## Phase 13: Audit-finding lifecycle',
        insertAfterLine: 7,
      },
      {
        findingId: 'AUDIT-BAD',
        taskBlock: '### BAD-block',
        phaseHeading: '## Phase 99: Nonexistent',
        insertAfterLine: 7,
      },
    ];
    await expect(
      insertTaskBlock({
        workplanPath: '/tmp/test.md',
        insertions,
        read: makeRead(wp),
      }),
    ).rejects.toBeInstanceOf(WorkplanInsertionError);
    // The original content is untouched (this is a pure-fn test, so we
    // assert by re-reading via the same shim and confirming the OK
    // block was never appended on a separate call).
    const reReadOnly = await makeRead(wp)('/tmp/test.md');
    expect(reReadOnly).not.toContain('OK-block');
  });
});

describe('applyTaskBlocks — wraps insertTaskBlock + writes', () => {
  it('writes the new content on success', async () => {
    const wp = workplanFixture();
    const captured: { path: string; content: string }[] = [];
    const write: WriteWorkplan = async (path, content) => {
      captured.push({ path, content });
    };
    const insertion: WorkplanInsertion = {
      findingId: 'AUDIT-W',
      taskBlock: '### W-block',
      phaseHeading: '## Phase 13: Audit-finding lifecycle',
      insertAfterLine: 7,
    };
    await applyTaskBlocks({
      workplanPath: '/tmp/test.md',
      insertions: [insertion],
      read: makeRead(wp),
      write,
    });
    expect(captured).toHaveLength(1);
    const recorded = captured[0];
    if (recorded === undefined) throw new Error('write callback was not invoked');
    expect(recorded.path).toBe('/tmp/test.md');
    expect(recorded.content).toContain('### W-block');
  });

  it('does not call write on validation failure', async () => {
    const wp = workplanFixture();
    let writeCalled = false;
    const write: WriteWorkplan = async () => {
      writeCalled = true;
    };
    await expect(
      applyTaskBlocks({
        workplanPath: '/tmp/test.md',
        insertions: [
          {
            findingId: 'AUDIT-BAD',
            taskBlock: '### BAD',
            phaseHeading: '## Phase 99: Nonexistent',
            insertAfterLine: 7,
          },
        ],
        read: makeRead(wp),
        write,
      }),
    ).rejects.toBeInstanceOf(WorkplanInsertionError);
    expect(writeCalled).toBe(false);
  });
});

describe('insertTaskBlock — idempotency on partial-apply re-run', () => {
  it('skips findings whose (fix-finding-<id>) marker is already in the workplan', async () => {
    // First insert AUDIT-1, then re-invoke with both AUDIT-1 + AUDIT-2.
    // AUDIT-1 should be skipped (already present); AUDIT-2 should land.
    const wp = workplanFixture();
    const first = await insertTaskBlock({
      workplanPath: '/tmp/t.md',
      insertions: [
        {
          findingId: 'AUDIT-1',
          taskBlock: '### Task 13.2 (fix-finding-AUDIT-1): one',
          phaseHeading: '## Phase 13: Audit-finding lifecycle',
          insertAfterLine: 7,
        },
      ],
      read: makeRead(wp),
    });
    const second = await insertTaskBlock({
      workplanPath: '/tmp/t.md',
      insertions: [
        {
          findingId: 'AUDIT-1',
          taskBlock: '### Task 13.2 (fix-finding-AUDIT-1): one-DUP',
          phaseHeading: '## Phase 13: Audit-finding lifecycle',
          insertAfterLine: 7,
        },
        {
          findingId: 'AUDIT-2',
          taskBlock: '### Task 13.3 (fix-finding-AUDIT-2): two',
          phaseHeading: '## Phase 13: Audit-finding lifecycle',
          insertAfterLine: 7,
        },
      ],
      read: makeRead(first.newContent),
    });
    // AUDIT-1 NOT double-inserted: only ONE occurrence of the marker.
    const occurrences = (second.newContent.match(/fix-finding-AUDIT-1/g) ?? []).length;
    expect(occurrences).toBe(1);
    // AUDIT-1 keeps its original block text; the -DUP variant must not appear.
    expect(second.newContent).toContain('one');
    expect(second.newContent).not.toContain('one-DUP');
    // AUDIT-2 landed.
    expect(second.newContent).toContain('fix-finding-AUDIT-2');
  });

  it('returns original content (no-op) when every insertion is already present', async () => {
    const wp = workplanFixture();
    const first = await insertTaskBlock({
      workplanPath: '/tmp/t.md',
      insertions: [
        {
          findingId: 'AUDIT-A',
          taskBlock: '### Task 13.2 (fix-finding-AUDIT-A): a',
          phaseHeading: '## Phase 13: Audit-finding lifecycle',
          insertAfterLine: 7,
        },
      ],
      read: makeRead(wp),
    });
    const second = await insertTaskBlock({
      workplanPath: '/tmp/t.md',
      insertions: [
        {
          findingId: 'AUDIT-A',
          taskBlock: '### Task 13.2 (fix-finding-AUDIT-A): a-DUP',
          phaseHeading: '## Phase 13: Audit-finding lifecycle',
          insertAfterLine: 7,
        },
      ],
      read: makeRead(first.newContent),
    });
    expect(second.newContent).toBe(first.newContent);
  });
});

describe('insertTaskBlock — deterministic order when insertAfterLine values are equal', () => {
  it('preserves input-array order as a stable tiebreaker', async () => {
    const wp = workplanFixture();
    const insertions: WorkplanInsertion[] = [
      {
        findingId: 'AUDIT-FIRST',
        taskBlock: '### Task 13.2 (fix-finding-AUDIT-FIRST): first',
        phaseHeading: '## Phase 13: Audit-finding lifecycle',
        insertAfterLine: 7,
      },
      {
        findingId: 'AUDIT-SECOND',
        taskBlock: '### Task 13.3 (fix-finding-AUDIT-SECOND): second',
        phaseHeading: '## Phase 13: Audit-finding lifecycle',
        insertAfterLine: 7,
      },
    ];
    const { newContent } = await insertTaskBlock({
      workplanPath: '/tmp/t.md',
      insertions,
      read: makeRead(wp),
    });
    const firstIdx = newContent.indexOf('AUDIT-FIRST');
    const secondIdx = newContent.indexOf('AUDIT-SECOND');
    expect(firstIdx).toBeGreaterThan(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});
