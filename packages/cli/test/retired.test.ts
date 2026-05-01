/**
 * Unit tests for the retired-verb gate. Covers the membership predicate
 * for both the retired set (9 verbs) and the still-supported verbs.
 *
 * The error-printing function is not unit-tested directly — it calls
 * process.exit(), which would terminate the test runner. The dispatcher
 * smoke (manual: `deskwork plan foo`) covers the print + exit path.
 */

import { describe, it, expect } from 'vitest';
import { isRetired } from '../src/commands/retired.ts';

describe('isRetired', () => {
  it.each([
    'plan',
    'outline',
    'draft',
    'pause',
    'resume',
    'review-start',
    'review-cancel',
    'review-help',
    'review-report',
  ])('marks %s as retired', (cmd) => {
    expect(isRetired(cmd)).toBe(true);
  });

  it.each([
    'iterate',
    'approve',
    'block',
    'cancel',
    'induct',
    'publish',
    'status',
    'doctor',
    'add',
    'ingest',
  ])('does not mark %s as retired', (cmd) => {
    expect(isRetired(cmd)).toBe(false);
  });
});
