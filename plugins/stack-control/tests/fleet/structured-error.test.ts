// specs/036-fleet-control-plane — T055 (RED), pairs with impl.
//
// data-model.md § Structured error (FR-046) pins the bounded shape:
//   { code, message, task, timestamp, recoverable }
// NOT an unbounded generic field; details fetched on demand, never
// carried in the fleet payload.
//
// This test asserts:
//   1. A well-formed StructuredError validates and round-trips its five fields.
//   2. Each missing/wrong-typed field is rejected with a descriptive error.
//   3. The type carries NO unbounded/generic details field (structurally —
//      the bounded shape is the contract).
//
// This repo's convention is relative `.js` imports under node16 module
// resolution (no `@/` alias configured).

import { describe, expect, it } from 'vitest';
import {
  validateStructuredError,
  type StructuredError,
} from '../../src/fleet/types.js';

function wellFormedError(): Record<string, unknown> {
  return {
    code: 'TASK_PARSE_ERROR',
    message: 'Failed to parse task definition',
    task: 'impl/document-primitives',
    timestamp: new Date().toISOString(),
    recoverable: false,
  };
}

describe('StructuredError (T055, data-model § Structured error FR-046)', () => {
  it('accepts a well-formed structured error and returns it typed', () => {
    const literal = wellFormedError();
    const error = validateStructuredError(literal);
    expect(error.code).toBe(literal.code);
    expect(error.message).toBe(literal.message);
    expect(error.task).toBe(literal.task);
    expect(error.timestamp).toBe(literal.timestamp);
    expect(error.recoverable).toBe(false);
  });

  it('round-trips all five fields: code, message, task, timestamp, recoverable', () => {
    const original: StructuredError = {
      code: 'COMMAND_REJECTED',
      message: 'Command superseded by a newer request',
      task: 'multi/feature-x',
      timestamp: '2026-07-17T12:34:56.789Z',
      recoverable: true,
    };
    const validated = validateStructuredError(original);
    expect(validated.code).toBe(original.code);
    expect(validated.message).toBe(original.message);
    expect(validated.task).toBe(original.task);
    expect(validated.timestamp).toBe(original.timestamp);
    expect(validated.recoverable).toBe(original.recoverable);
  });

  it('rejects a non-object value', () => {
    expect(() => validateStructuredError(null)).toThrow();
    expect(() => validateStructuredError('error')).toThrow();
    expect(() => validateStructuredError(42)).toThrow();
    expect(() => validateStructuredError(undefined)).toThrow();
  });

  it('rejects a missing code field', () => {
    const literal = wellFormedError();
    delete literal.code;
    expect(() => validateStructuredError(literal)).toThrow(/code/);
  });

  it('rejects a non-string code', () => {
    const literal = wellFormedError();
    literal.code = 123;
    expect(() => validateStructuredError(literal)).toThrow(/code/);
  });

  it('rejects an empty string code', () => {
    const literal = wellFormedError();
    literal.code = '';
    expect(() => validateStructuredError(literal)).toThrow(/code/);
  });

  it('rejects a missing message field', () => {
    const literal = wellFormedError();
    delete literal.message;
    expect(() => validateStructuredError(literal)).toThrow(/message/);
  });

  it('rejects a non-string message', () => {
    const literal = wellFormedError();
    literal.message = { text: 'error' };
    expect(() => validateStructuredError(literal)).toThrow(/message/);
  });

  it('rejects an empty string message', () => {
    const literal = wellFormedError();
    literal.message = '';
    expect(() => validateStructuredError(literal)).toThrow(/message/);
  });

  it('rejects a missing task field', () => {
    const literal = wellFormedError();
    delete literal.task;
    expect(() => validateStructuredError(literal)).toThrow(/task/);
  });

  it('rejects a non-string task', () => {
    const literal = wellFormedError();
    literal.task = null;
    expect(() => validateStructuredError(literal)).toThrow(/task/);
  });

  it('rejects an empty string task', () => {
    const literal = wellFormedError();
    literal.task = '';
    expect(() => validateStructuredError(literal)).toThrow(/task/);
  });

  it('rejects a missing timestamp field', () => {
    const literal = wellFormedError();
    delete literal.timestamp;
    expect(() => validateStructuredError(literal)).toThrow(/timestamp/);
  });

  it('rejects a non-string timestamp', () => {
    const literal = wellFormedError();
    literal.timestamp = 1234567890;
    expect(() => validateStructuredError(literal)).toThrow(/timestamp/);
  });

  it('rejects an empty string timestamp', () => {
    const literal = wellFormedError();
    literal.timestamp = '';
    expect(() => validateStructuredError(literal)).toThrow(/timestamp/);
  });

  it('rejects an invalid ISO-8601 timestamp', () => {
    const literal = wellFormedError();
    literal.timestamp = 'not-a-timestamp';
    expect(() => validateStructuredError(literal)).toThrow(/timestamp/);
  });

  it('rejects a missing recoverable field', () => {
    const literal = wellFormedError();
    delete literal.recoverable;
    expect(() => validateStructuredError(literal)).toThrow(/recoverable/);
  });

  it('rejects a non-boolean recoverable (accepts true)', () => {
    const literal = wellFormedError();
    literal.recoverable = 'yes';
    expect(() => validateStructuredError(literal)).toThrow(/recoverable/);
  });

  it('rejects a non-boolean recoverable (accepts false)', () => {
    const literal = wellFormedError();
    literal.recoverable = 1;
    expect(() => validateStructuredError(literal)).toThrow(/recoverable/);
  });

  it('does NOT carry unbounded/generic details field (bounded shape contract)', () => {
    // The type MUST NOT have an open `details: Record<string, unknown>`
    // or any similar unbounded field. This is structurally asserted: if
    // the type has such a field, this assignment will not type-check.
    const _: StructuredError = {
      code: 'X',
      message: 'Y',
      task: 'Z',
      timestamp: new Date().toISOString(),
      recoverable: false,
    };
    // If the type had an unbounded field, adding it would be required
    // by TypeScript to satisfy the interface, but it should NOT be.
    expect(_).toBeDefined();
  });

  it('strips extra fields that are not part of the bounded shape (AUDIT-20260718-01)', () => {
    // Per FR-046: details are fetched on demand, never inline. The
    // validator accepts an input carrying an extra `details` key (objects
    // can have extra keys), but MUST NOT let it leak into the returned
    // object — the bounded shape is the contract. This runtime assertion
    // is the actual regression guard: a validator that returns the input
    // by reference (or spreads unknown keys through) would leak `details`
    // into the fleet payload, which is exactly the FR-046 regression this
    // test exists to catch.
    const literal = wellFormedError() as Record<string, unknown>;
    literal.details = { nested: 'error info' };
    const error = validateStructuredError(literal);

    expect(Object.prototype.hasOwnProperty.call(error, 'details')).toBe(false);
    expect(Object.keys(error).sort()).toEqual(
      ['code', 'message', 'recoverable', 'task', 'timestamp'].sort(),
    );

    // TypeScript narrowing check: if `details` were part of the static
    // type, this assignment would fail to compile.
    const _: StructuredError = error;
    expect(_ satisfies StructuredError).toBeDefined();
  });
});
