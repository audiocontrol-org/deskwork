/**
 * @vitest-environment jsdom
 *
 * AUDIT-20260530-53 (cross-model: AUDIT-BARRAGE-codex-P5-3) regression
 * — `readStoredStringArray` MUST dedupe its returned array to preserve
 * the permutation invariant the lane-order surface depends on.
 *
 * Bug-shape (the invariant violation this test pins down):
 *
 *   - `readStoredStringArray` previously preserved duplicate strings
 *     verbatim. A corrupted or hand-edited localStorage value like
 *     `["qa","qa","default"]` passed validation, became `state.order`
 *     in the reorder controller, and was written back after the next
 *     real reorder.
 *   - `reconcileOrder` (`swimlane-drag.ts:72-89,371-392`) only checked
 *     each stored id existed in the live lane set — uniqueness was not
 *     part of its contract. The reorder controller's "order is a
 *     permutation of the live lane set" model silently degraded.
 *
 * Fix shape (operator-perceivable invariant):
 *
 *   The helper IS the boundary that enforces the array-of-unique-
 *   strings invariant. Dedup preserves first-occurrence order so the
 *   positional reorder surface keeps the operator's intended order;
 *   set-shaped callers (`readStoredSet`, the `new Set(...)` wraps in
 *   `swimlane-presets-store.ts`) are no-op-affected because they
 *   already dedupe at projection.
 *
 * Surface under test:
 *   - `plugins/deskwork-studio/public/src/dashboard/swimlane-storage.ts`
 *     (`readStoredStringArray` — the dedup contract).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readStoredStringArray } from '../../../plugins/deskwork-studio/public/src/dashboard/swimlane-storage';

describe('AUDIT-20260530-53 — readStoredStringArray dedupes (permutation invariant)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('dedupes adjacent duplicates preserving first-occurrence order', () => {
    // Canonical reproduction from the audit finding: corrupted lane-
    // order value with a duplicated id. Pre-fix this returned the
    // array verbatim and poisoned the reorder controller's state.order.
    window.localStorage.setItem(
      'dw:test:order',
      JSON.stringify(['qa', 'qa', 'default']),
    );
    const out = readStoredStringArray('dw:test:order');
    expect(out).toEqual(['qa', 'default']);
  });

  it('dedupes non-adjacent duplicates preserving first-occurrence order', () => {
    window.localStorage.setItem(
      'dw:test:order',
      JSON.stringify(['default', 'mockups', 'qa', 'default', 'mockups']),
    );
    const out = readStoredStringArray('dw:test:order');
    expect(out).toEqual(['default', 'mockups', 'qa']);
  });

  it('returns a unique array when input already had no duplicates', () => {
    // The dedup pass must be a no-op for already-clean values — the
    // common case must not see semantic change.
    window.localStorage.setItem(
      'dw:test:order',
      JSON.stringify(['default', 'mockups', 'qa']),
    );
    const out = readStoredStringArray('dw:test:order');
    expect(out).toEqual(['default', 'mockups', 'qa']);
  });

  it('dedupes after dropping non-string elements (mixed-type input)', () => {
    // Compose with the existing "drop non-strings" pass: duplicates
    // hidden behind type-invalid elements must still collapse.
    window.localStorage.setItem(
      'dw:test:mixed',
      JSON.stringify(['a', 42, 'a', null, 'b', true, 'a']),
    );
    const out = readStoredStringArray('dw:test:mixed');
    expect(out).toEqual(['a', 'b']);
  });

  it('returns an empty array when every element is a duplicate of the first', () => {
    window.localStorage.setItem(
      'dw:test:all-dup',
      JSON.stringify(['x', 'x', 'x', 'x']),
    );
    const out = readStoredStringArray('dw:test:all-dup');
    expect(out).toEqual(['x']);
  });

  it('preserves the null contract on missing keys (dedup does not change miss semantics)', () => {
    const out = readStoredStringArray('dw:test:missing');
    expect(out).toBeNull();
  });
});
