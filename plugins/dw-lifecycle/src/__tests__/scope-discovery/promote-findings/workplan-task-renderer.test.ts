import { describe, it, expect } from 'vitest';
import { renderFixTaskBlock } from '../../../scope-discovery/promote-findings/workplan-task-renderer.js';
import type { OpenFinding } from '../../../scope-discovery/promote-findings/types.js';

function finding(overrides: Partial<OpenFinding> = {}): OpenFinding {
  const base: OpenFinding = {
    findingId: 'AUDIT-20260529-42',
    heading: 'Validator misses negative balance edge case',
    severity: 'high',
    surface: 'src/balance.ts:42',
    body: 'Body text.',
    lineNumber: 100,
    auditLogPath: '/repo/docs/audit-log.md',
  };
  return { ...base, ...overrides };
}

describe('renderFixTaskBlock — TDD-first task shape', () => {
  it('renders the canonical task block for a typical finding', () => {
    const block = renderFixTaskBlock(finding(), { taskNumber: '13.7' });
    expect(block).toContain(
      '### Task 13.7 (fix-finding-AUDIT-20260529-42): Validator misses negative balance edge case',
    );
    expect(block).toContain('Closes AUDIT-20260529-42.');
    expect(block).toContain('Surface: src/balance.ts:42.');
    expect(block).toContain('Step 1: write failing test');
    expect(block).toContain('Step 2: confirm test fails');
    expect(block).toContain('Step 3: implement the fix');
    expect(block).toContain('Step 4: confirm test passes');
    expect(block).toContain('Step 5: commit with `Closes AUDIT-20260529-42`');
    expect(block).toContain('**Acceptance Criteria:**');
    expect(block).toContain('(to be filled in by Step 1 implementer)');
    expect(block).toContain('npx vitest run');
    expect(block).toContain('fixed-<sha>');
  });

  it('falls back to "(no surface specified)" when surface is missing', () => {
    const block = renderFixTaskBlock(
      finding({ surface: undefined }),
      { taskNumber: '13.8' },
    );
    expect(block).toContain('Surface: (no surface specified).');
  });

  it('clips a long heading to 80 chars with ellipsis', () => {
    const longHeading =
      'A very long heading that goes on and on and on past the eighty character clip threshold defined in the renderer.';
    const block = renderFixTaskBlock(
      finding({ heading: longHeading }),
      { taskNumber: '13.9' },
    );
    // The clipped title should appear on the heading line, ending in '…'.
    const firstLine = block.split('\n')[0];
    if (!firstLine) throw new Error('expected at least one line in block');
    expect(firstLine).toMatch(/…\)$|…:|…$/);
    // The exact 80-char body inside the parens-style title is what we
    // care about — extract the title portion after the `: ` delimiter.
    const titleMatch = /:\s+(.+)$/.exec(firstLine);
    if (titleMatch === null) throw new Error('expected title after `:`');
    const title = titleMatch[1] ?? '';
    expect(title.length).toBeLessThanOrEqual(81); // 80 + ellipsis allowance
  });

  it('does not clip a heading at exactly 80 chars', () => {
    const eighty = 'a'.repeat(80);
    const block = renderFixTaskBlock(
      finding({ heading: eighty }),
      { taskNumber: '13.10' },
    );
    expect(block).toContain(eighty);
    expect(block).not.toContain(`${eighty}…`);
  });

  it('does not clip a 79-char heading', () => {
    const seventyNine = 'b'.repeat(79);
    const block = renderFixTaskBlock(
      finding({ heading: seventyNine }),
      { taskNumber: '13.11' },
    );
    expect(block).toContain(seventyNine);
  });

  it('trims whitespace in the heading before clipping', () => {
    const block = renderFixTaskBlock(
      finding({ heading: '   Padded heading   ' }),
      { taskNumber: '13.12' },
    );
    expect(block).toContain('Padded heading');
    expect(block).not.toContain('   Padded heading');
  });

  it('substitutes taskNumber and findingId in all required positions', () => {
    const block = renderFixTaskBlock(
      finding({ findingId: 'AUDIT-20260530-99' }),
      { taskNumber: '14.3' },
    );
    expect(block).toContain('Task 14.3');
    expect(block).toContain('fix-finding-AUDIT-20260530-99');
    expect(block).toContain('Closes AUDIT-20260530-99');
  });
});
