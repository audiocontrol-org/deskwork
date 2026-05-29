/**
 * Phase 5 Task 5.4 — `computeReorder` pure-function unit tests.
 *
 * Originally part of `dashboard-swimlane-drag-client.test.ts`; split
 * out per AUDIT-20260528-14 to satisfy the project's 300-500 line
 * file-size cap. The pure function has no DOM dependency, so this
 * file ships with the default node test environment (no jsdom).
 */

import { describe, it, expect } from 'vitest';
import { computeReorder } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-drag';

describe('computeReorder pure function — Task 5.4', () => {
  it('returns the input unchanged when source === target', () => {
    const result = computeReorder(['a', 'b', 'c'], 'b', 'b', 'above');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('drops source ABOVE target — moves source up', () => {
    const result = computeReorder(['a', 'b', 'c', 'd'], 'd', 'b', 'above');
    expect(result).toEqual(['a', 'd', 'b', 'c']);
  });

  it('drops source BELOW target — moves source down', () => {
    const result = computeReorder(['a', 'b', 'c', 'd'], 'a', 'c', 'below');
    expect(result).toEqual(['b', 'c', 'a', 'd']);
  });

  it('handles same-position drop as a no-op (above immediate neighbor)', () => {
    const result = computeReorder(['a', 'b', 'c'], 'a', 'b', 'above');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('returns unchanged order when target id is not in the list', () => {
    const result = computeReorder(['a', 'b'], 'a', 'z', 'above');
    expect(result).toEqual(['a', 'b']);
  });
});
