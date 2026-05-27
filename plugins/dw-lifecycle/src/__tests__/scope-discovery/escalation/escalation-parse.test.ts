/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/escalation/escalation-parse.test.ts
 *
 * Phase 11 Task 9 — Parser tests. Exercises malformed-input shapes
 * directly so the queue tests can focus on the disk-level lifecycle.
 *
 * Each test verifies one parse-error path; the parser is the seam any
 * future reader (doctor rule, studio surface) would dispatch through,
 * so its surface contract deserves explicit coverage.
 */

import { describe, expect, it } from 'vitest';
import { parseEscalation } from '../../../scope-discovery/escalation/escalation-parse.js';

function valid(): Record<string, unknown> {
  return {
    version: 1,
    id: 'esc-1',
    queuedAt: '2026-05-26T12:00:00Z',
    actionProposed: 'do the thing',
    evidence: {
      summary: 'because reasons',
      links: ['a/b.md'],
      excerpts: ['some code'],
    },
    reasoning: 'because the auditor disagrees',
    question: 'safe to proceed?',
    options: [{ id: 'yes', summary: 'do it' }],
    resolution: null,
  };
}

describe('parseEscalation', () => {
  it('round-trips a valid JSON document', () => {
    const out = parseEscalation(JSON.stringify(valid()), 'ctx');
    expect(out.id).toBe('esc-1');
    expect(out.options).toEqual([{ id: 'yes', summary: 'do it' }]);
    expect(out.resolution).toBeNull();
  });

  it('round-trips an option with detail', () => {
    const raw = valid();
    raw['options'] = [{ id: 'yes', summary: 'do it', detail: 'really do it' }];
    const out = parseEscalation(JSON.stringify(raw), 'ctx');
    expect(out.options[0]).toEqual({
      id: 'yes',
      summary: 'do it',
      detail: 'really do it',
    });
  });

  it('round-trips a resolved escalation', () => {
    const raw = valid();
    raw['resolution'] = {
      resolvedAt: '2026-05-26T14:00:00Z',
      selectedOptionId: 'yes',
      decisionTaken: 'go for it',
    };
    const out = parseEscalation(JSON.stringify(raw), 'ctx');
    expect(out.resolution).toEqual({
      resolvedAt: '2026-05-26T14:00:00Z',
      selectedOptionId: 'yes',
      decisionTaken: 'go for it',
    });
  });

  it('round-trips a resolved escalation with null selectedOptionId', () => {
    const raw = valid();
    raw['resolution'] = {
      resolvedAt: '2026-05-26T14:00:00Z',
      selectedOptionId: null,
      decisionTaken: 'free-form decision',
    };
    const out = parseEscalation(JSON.stringify(raw), 'ctx');
    expect(out.resolution?.selectedOptionId).toBeNull();
  });

  it('throws on malformed JSON', () => {
    expect(() => parseEscalation('{not-json', 'ctx')).toThrow(/cannot parse/);
  });

  it('throws when the top-level is not an object', () => {
    expect(() => parseEscalation('[1, 2, 3]', 'ctx')).toThrow(
      /did not parse to an object/,
    );
  });

  it('throws on unsupported version', () => {
    const raw = valid();
    raw['version'] = 99;
    expect(() => parseEscalation(JSON.stringify(raw), 'ctx')).toThrow(
      /unsupported version 99/,
    );
  });

  it('throws when actionProposed is missing', () => {
    const raw = valid();
    delete raw['actionProposed'];
    expect(() => parseEscalation(JSON.stringify(raw), 'ctx')).toThrow(
      /`actionProposed` must be a non-empty string/,
    );
  });

  it('throws when evidence.links is not an array', () => {
    const raw = valid();
    raw['evidence'] = { summary: 's', links: 'nope', excerpts: [] };
    expect(() => parseEscalation(JSON.stringify(raw), 'ctx')).toThrow(
      /`links` must be an array/,
    );
  });

  it('throws when a link is an empty string', () => {
    const raw = valid();
    raw['evidence'] = { summary: 's', links: [''], excerpts: [] };
    expect(() => parseEscalation(JSON.stringify(raw), 'ctx')).toThrow(
      /links\[0\] must be a non-empty string/,
    );
  });

  it('throws when options array is empty', () => {
    const raw = valid();
    raw['options'] = [];
    expect(() => parseEscalation(JSON.stringify(raw), 'ctx')).toThrow(
      /at least one option/,
    );
  });

  it('throws when an option detail is an empty string', () => {
    const raw = valid();
    raw['options'] = [{ id: 'a', summary: 'a', detail: '' }];
    expect(() => parseEscalation(JSON.stringify(raw), 'ctx')).toThrow(
      /`detail` must be a non-empty string when set/,
    );
  });

  it('throws when resolution.selectedOptionId is an empty string', () => {
    const raw = valid();
    raw['resolution'] = {
      resolvedAt: '2026-05-26T14:00:00Z',
      selectedOptionId: '',
      decisionTaken: 'x',
    };
    expect(() => parseEscalation(JSON.stringify(raw), 'ctx')).toThrow(
      /`selectedOptionId` must be a non-empty string or null/,
    );
  });

  it('treats a missing resolution field as null', () => {
    const raw = valid();
    delete raw['resolution'];
    const out = parseEscalation(JSON.stringify(raw), 'ctx');
    expect(out.resolution).toBeNull();
  });
});
