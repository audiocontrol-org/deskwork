/**
 * @vitest-environment jsdom
 *
 * Phase 8 Step 8.3.1 — screenshot capture helper tests.
 *
 * Covers:
 *   - Suggested filename uses the entry-anchored form
 *     (`<commentId>-<timestamp>.png`) when a valid UUID commentId is
 *     passed.
 *   - Suggested filename uses the orphan form
 *     (`<timestamp>-<hash>.png`) when no commentId is passed.
 *   - Suggested filename uses the orphan form when a malformed
 *     commentId is passed (defence against path-traversal smuggling).
 *   - `html-to-image` returning `null` surfaces as a thrown error
 *     (per project rules: no silent fallback).
 *   - Filesystem-safe timestamp shape (`:` and `.` replaced with `-`).
 *   - `shortHashOfBlob` returns 8 hex chars over an arbitrary blob.
 *
 * `html-to-image` is mocked at the module boundary because jsdom's
 * canvas implementation can't serialise to a real PNG — the mock
 * returns a deterministic blob so the filename + persistence shape
 * can be asserted end-to-end without touching the real renderer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockToBlob } = vi.hoisted(() => ({ mockToBlob: vi.fn() }));

vi.mock('html-to-image', () => ({
  toBlob: mockToBlob,
}));

import {
  captureElementToPng,
  filesystemSafeIsoTimestamp,
  shortHashOfBlob,
} from '../../../../plugins/deskwork-studio/public/src/entry-review/screenshot-capture.ts';

const VALID_COMMENT_ID = '11111111-1111-4111-8111-111111111111';
const FIXED_NOW = new Date('2026-05-31T15:32:04.500Z');

describe('captureElementToPng', () => {
  beforeEach(() => {
    mockToBlob.mockReset();
  });

  it('uses the entry-anchored filename when a valid UUID commentId is supplied', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    mockToBlob.mockResolvedValue(blob);
    const el = document.createElement('div');
    const result = await captureElementToPng(el, {
      commentId: VALID_COMMENT_ID,
      now: () => FIXED_NOW,
    });
    expect(result.blob).toBe(blob);
    expect(result.suggestedFilename).toBe(
      `${VALID_COMMENT_ID}-2026-05-31T15-32-04-500Z.png`,
    );
  });

  it('uses the orphan filename when no commentId is supplied', async () => {
    const blob = new Blob([new Uint8Array([42, 43, 44, 45])], {
      type: 'image/png',
    });
    mockToBlob.mockResolvedValue(blob);
    const el = document.createElement('div');
    const result = await captureElementToPng(el, {
      now: () => FIXED_NOW,
    });
    // Orphan form: `<timestamp>-<hash>.png`. The exact hash depends on
    // the bytes but it must be 8 hex chars.
    expect(result.suggestedFilename).toMatch(
      /^2026-05-31T15-32-04-500Z-[0-9a-f]{8}\.png$/,
    );
  });

  it('uses the orphan filename when commentId is malformed (anti path-traversal)', async () => {
    const blob = new Blob([new Uint8Array([9])], { type: 'image/png' });
    mockToBlob.mockResolvedValue(blob);
    const el = document.createElement('div');
    const result = await captureElementToPng(el, {
      commentId: '../etc/passwd',
      now: () => FIXED_NOW,
    });
    // Malformed commentId must NOT appear in the filename.
    expect(result.suggestedFilename).not.toContain('etc');
    expect(result.suggestedFilename).toMatch(
      /^2026-05-31T15-32-04-500Z-[0-9a-f]{8}\.png$/,
    );
  });

  it('throws when html-to-image returns null', async () => {
    mockToBlob.mockResolvedValue(null);
    const el = document.createElement('div');
    await expect(captureElementToPng(el, { now: () => FIXED_NOW })).rejects.toThrow(
      /html-to-image returned null/,
    );
  });

  it('forwards pixelRatio when supplied', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    mockToBlob.mockResolvedValue(blob);
    const el = document.createElement('div');
    await captureElementToPng(el, {
      commentId: VALID_COMMENT_ID,
      now: () => FIXED_NOW,
      pixelRatio: 3,
    });
    expect(mockToBlob).toHaveBeenCalledWith(el, { pixelRatio: 3 });
  });

  it('passes an empty options object when pixelRatio is not supplied', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
    mockToBlob.mockResolvedValue(blob);
    const el = document.createElement('div');
    await captureElementToPng(el, {
      commentId: VALID_COMMENT_ID,
      now: () => FIXED_NOW,
    });
    expect(mockToBlob).toHaveBeenCalledWith(el, {});
  });
});

describe('filesystemSafeIsoTimestamp', () => {
  it('replaces colons and dots with hyphens', () => {
    expect(filesystemSafeIsoTimestamp(new Date('2026-05-31T15:32:04.500Z'))).toBe(
      '2026-05-31T15-32-04-500Z',
    );
  });

  it('preserves the trailing Z so the timestamp remains UTC-tagged', () => {
    expect(filesystemSafeIsoTimestamp(new Date('2026-01-01T00:00:00.000Z'))).toBe(
      '2026-01-01T00-00-00-000Z',
    );
  });
});

describe('shortHashOfBlob', () => {
  it('returns exactly 8 hex characters', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
    const hash = await shortHashOfBlob(blob);
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('is deterministic for identical bytes', async () => {
    const a = new Blob([new Uint8Array([7, 8, 9])]);
    const b = new Blob([new Uint8Array([7, 8, 9])]);
    expect(await shortHashOfBlob(a)).toBe(await shortHashOfBlob(b));
  });

  it('differs for different bytes', async () => {
    const a = new Blob([new Uint8Array([7, 8, 9])]);
    const b = new Blob([new Uint8Array([7, 8, 10])]);
    expect(await shortHashOfBlob(a)).not.toBe(await shortHashOfBlob(b));
  });
});
