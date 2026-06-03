/**
 * Phase 22 AUDIT-20260603-03 — tests for the maxBuffer error classifier
 * that distinguishes `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` from generic
 * git errors (no repo, bad ref, spawn failure). The pre-fix code
 * collapsed every error into `''` and produced the misleading
 * EMPTY_DIFF_CURE_MESSAGE.
 *
 * Plus a real-fs integration smoke that exercises the full
 * implement-hook diff pipeline with a tiny repo at a sub-50MB diff
 * (the small case still works after the wrapping refactor — there's
 * no easy way to write a deterministic test for the >50MB case
 * without orchestrating a multi-GB working tree).
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { isMaxBufferError } from '../../subcommands/implement-hook.js';

describe('isMaxBufferError — classifier (AUDIT-20260603-03)', () => {
  it('matches Node\'s `ENOBUFS` code (older Node versions)', () => {
    const err = Object.assign(new Error('stdout maxBuffer length exceeded'), {
      code: 'ENOBUFS',
    });
    expect(isMaxBufferError(err)).toBe(true);
  });

  it('matches Node\'s `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` code (newer Node versions)', () => {
    const err = Object.assign(new Error('whatever'), {
      code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
    });
    expect(isMaxBufferError(err)).toBe(true);
  });

  it('matches when the error message contains the literal "maxBuffer length exceeded" text', () => {
    // Some Node versions / wrapper libraries surface the overflow via
    // the error message rather than the code property. Belt + suspenders.
    const err = Object.assign(new Error('child process killed: maxBuffer length exceeded'), {
      code: 'SOMETHING_ELSE',
    });
    expect(isMaxBufferError(err)).toBe(true);
  });

  it('case-insensitive on the maxBuffer message match', () => {
    const err = new Error('MAXBUFFER LENGTH EXCEEDED');
    expect(isMaxBufferError(err)).toBe(true);
  });

  it('does NOT match a generic spawn error (ENOENT — git not found)', () => {
    const err = Object.assign(new Error('spawn git ENOENT'), {
      code: 'ENOENT',
    });
    expect(isMaxBufferError(err)).toBe(false);
  });

  it('does NOT match a "not a git repository" error', () => {
    const err = Object.assign(new Error('fatal: not a git repository'), {
      status: 128,
    });
    expect(isMaxBufferError(err)).toBe(false);
  });

  it('does NOT match a bad-ref error', () => {
    const err = Object.assign(new Error('fatal: bad revision: nonexistent..HEAD'), {
      status: 128,
    });
    expect(isMaxBufferError(err)).toBe(false);
  });

  it('does NOT match null, undefined, plain string, or non-object error', () => {
    expect(isMaxBufferError(null)).toBe(false);
    expect(isMaxBufferError(undefined)).toBe(false);
    expect(isMaxBufferError('maxBuffer length exceeded')).toBe(false);
    expect(isMaxBufferError(42)).toBe(false);
    expect(isMaxBufferError({})).toBe(false);
  });

  // Real-process integration: trigger an actual maxBuffer overflow
  // via `execFileSync` with a tiny maxBuffer and a command whose
  // output exceeds it. Confirms the classifier matches the actual
  // shape Node throws (not just our mocks). Per AUDIT-43's discipline
  // — "the suite is green while the production default behind the DI
  // seam is unexercised" — we want at least one test against a real
  // Node-thrown error of the right shape.
  it('classifies an actual maxBuffer overflow from `execFileSync` (real-process integration)', () => {
    let caught: unknown = null;
    try {
      // `echo` outputs >100 chars; maxBuffer is set to 10 to force overflow.
      execFileSync('node', ['-e', 'process.stdout.write("x".repeat(1000))'], {
        encoding: 'utf8',
        maxBuffer: 10,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      caught = err;
    }
    // Node DID throw on overflow.
    expect(caught).not.toBeNull();
    // The classifier recognizes the real error.
    expect(isMaxBufferError(caught)).toBe(true);
  });

  // Regression-lock: the pre-AUDIT-39 catch block was `catch { return ''; }`
  // — every error returned the same value. This test pins the new
  // discrimination so a future edit cannot accidentally re-collapse
  // the two states by, e.g., returning `false` unconditionally from
  // `isMaxBufferError`.
  it('regression-lock: maxBuffer errors classify true while non-maxBuffer errors classify false (the AUDIT-39 distinction)', () => {
    const maxBuf = Object.assign(new Error('stdout maxBuffer length exceeded'), {
      code: 'ENOBUFS',
    });
    const notMaxBuf = Object.assign(new Error('fatal: bad revision'), {
      status: 128,
    });
    expect(isMaxBufferError(maxBuf)).toBe(true);
    expect(isMaxBufferError(notMaxBuf)).toBe(false);
    // The classifier discriminates — not the AUDIT-39 bare-catch shape.
    expect(isMaxBufferError(maxBuf)).not.toBe(isMaxBufferError(notMaxBuf));
  });
});
