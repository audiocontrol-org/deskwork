/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260530-49 (cross-model: AUDIT-BARRAGE-claude-P5-3) regression
 * — JSON storage helpers are consolidated into `swimlane-storage.ts`;
 * no controller re-implements the read/parse or write/swallow shape.
 *
 * Bug-shape (the DRY regression this test pins down):
 *
 *   - `swimlane-presets-store.ts` re-implemented `readStoredStringArray`
 *     under the name `readJsonArrayOfStrings` in the same changeset that
 *     extracted the canonical reader into `swimlane-storage.ts`.
 *   - The write-with-swallow shape repeated across `writePresets`,
 *     `writeJsonOrIgnore` (presets-store), and `writeStoredOrder`
 *     (drag/reorder). Per the audit finding, the next bug fix to the
 *     write path would have to land in three different files.
 *
 * The fix consolidates the read side onto `readStoredStringArray` and
 * factors the write-with-swallow shape into a shared `writeJsonOrIgnore`
 * export in `swimlane-storage.ts` that returns a boolean — `true` when
 * the underlying `setItem` landed, `false` when it threw and the catch
 * swallowed. The boolean preserves the AUDIT-44 success-signal contract
 * the `writePresets` write path already depends on.
 *
 * Surface under test:
 *   - `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts`
 *     (the new shared `writeJsonOrIgnore`; existing `readStoredStringArray`).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readStoredStringArray,
  writeJsonOrIgnore,
} from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-storage';

describe('AUDIT-20260530-49 — JSON storage helpers consolidated in swimlane-storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe('readStoredStringArray parity (replaces readJsonArrayOfStrings)', () => {
    it('returns the parsed string array for a well-formed value', () => {
      window.localStorage.setItem(
        'dw:test:array',
        JSON.stringify(['default', 'mockups', 'qa']),
      );
      const out = readStoredStringArray('dw:test:array');
      expect(out).toEqual(['default', 'mockups', 'qa']);
    });

    it('returns null on missing key (callers coerce to [] via `?? []`)', () => {
      const out = readStoredStringArray('dw:test:missing');
      expect(out).toBeNull();
    });

    it('returns null on malformed JSON', () => {
      window.localStorage.setItem('dw:test:bad', '{not-json');
      const out = readStoredStringArray('dw:test:bad');
      expect(out).toBeNull();
    });

    it('returns null on wrong root shape (object instead of array)', () => {
      window.localStorage.setItem(
        'dw:test:obj',
        JSON.stringify({ default: true }),
      );
      const out = readStoredStringArray('dw:test:obj');
      expect(out).toBeNull();
    });

    it('drops non-string array elements (matches old readJsonArrayOfStrings)', () => {
      window.localStorage.setItem(
        'dw:test:mixed',
        JSON.stringify(['a', 42, null, 'b', true, 'c']),
      );
      const out = readStoredStringArray('dw:test:mixed');
      expect(out).toEqual(['a', 'b', 'c']);
    });
  });

  describe('writeJsonOrIgnore — success signal preserved (AUDIT-44 contract)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns true and persists the JSON-serialised value on success', () => {
      const ok = writeJsonOrIgnore('dw:test:write', { a: 1, b: ['c'] });
      expect(ok).toBe(true);
      expect(window.localStorage.getItem('dw:test:write')).toBe(
        JSON.stringify({ a: 1, b: ['c'] }),
      );
    });

    it('returns true for an array value (write-side mirror of read parity)', () => {
      const ok = writeJsonOrIgnore('dw:test:arr', ['x', 'y']);
      expect(ok).toBe(true);
      expect(window.localStorage.getItem('dw:test:arr')).toBe(
        JSON.stringify(['x', 'y']),
      );
    });

    it('returns false when setItem throws (QuotaExceededError shape)', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        const e = new Error('QuotaExceededError');
        e.name = 'QuotaExceededError';
        throw e;
      });
      const ok = writeJsonOrIgnore('dw:test:fail', { foo: 'bar' });
      expect(ok).toBe(false);
    });

    it('does not propagate the underlying setItem exception', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      // The whole point of the swallow contract: callers must be able
      // to invoke the helper without try/catch and trust the boolean.
      expect(() => writeJsonOrIgnore('dw:test:fail', [1, 2, 3])).not.toThrow();
    });
  });
});
