/**
 * Phase 8 Step 8.1.2 (Part 2) — `AddressAnnotation` schema tightening.
 *
 * The PRD acceptance criterion ("required free-text disposition reason
 * captured at iterate time") tightens `reason` to REQUIRED non-empty on
 * every `address` annotation whose `disposition === 'addressed'`. The
 * contract is scoped to `addressed` — `deferred` and `wontfix` continue
 * to accept an optional `reason`.
 *
 * These tests assert the contract end-to-end against `DraftAnnotationSchema`
 * (the schema's top-level `.superRefine` is where the conditional
 * required-ness is enforced — see the docblock on the schema for why a
 * nested discriminated-union shape was infeasible).
 *
 * Negative cases (parse MUST fail):
 *   - `addressed` with `reason` field missing
 *   - `addressed` with `reason: ''` (empty string)
 *
 * Positive cases (parse MUST succeed):
 *   - `addressed` with non-empty `reason`
 *   - `deferred` with `reason` missing  (contract scoped to `addressed`)
 *   - `deferred` with non-empty `reason`
 *   - `wontfix` with `reason` missing   (contract scoped to `addressed`)
 *   - `wontfix` with non-empty `reason`
 */

import { describe, it, expect } from 'vitest';
import { DraftAnnotationSchema } from '@/schema/draft-annotation';

const BASE_ADDRESS = {
  type: 'address' as const,
  id: 'a_abc123',
  workflowId: 'wf_1',
  createdAt: '2026-05-31T10:00:00.000Z',
  commentId: 'cmt_target',
  version: 3,
};

describe('AddressAnnotation schema — Phase 8 Step 8.1.2 (Part 2) reason contract', () => {
  describe('negative cases — addressed without a non-empty reason', () => {
    it('rejects `addressed` with `reason` field missing', () => {
      const parsed = DraftAnnotationSchema.safeParse({
        ...BASE_ADDRESS,
        disposition: 'addressed',
        // no reason field
      });
      expect(parsed.success).toBe(false);
      if (parsed.success) return;
      // The superRefine surfaces a custom issue whose `path` points at
      // `reason` and whose `message` names the contract — operators
      // grepping for "reason" or "8.1.2" get a clear signal.
      const issuesAtReason = parsed.error.issues.filter(
        (i) => i.path.length === 1 && i.path[0] === 'reason',
      );
      expect(issuesAtReason.length).toBeGreaterThanOrEqual(1);
      expect(JSON.stringify(parsed.error.issues)).toContain('reason');
    });

    it('rejects `addressed` with `reason: ""` (empty string)', () => {
      const parsed = DraftAnnotationSchema.safeParse({
        ...BASE_ADDRESS,
        disposition: 'addressed',
        reason: '',
      });
      expect(parsed.success).toBe(false);
      if (parsed.success) return;
      const issuesAtReason = parsed.error.issues.filter(
        (i) => i.path.length === 1 && i.path[0] === 'reason',
      );
      expect(issuesAtReason.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('positive cases — addressed-with-reason and non-addressed variants', () => {
    it('accepts `addressed` with a non-empty `reason`', () => {
      const parsed = DraftAnnotationSchema.safeParse({
        ...BASE_ADDRESS,
        disposition: 'addressed',
        reason: 'addressed by adding section X at line 42',
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      if (parsed.data.type !== 'address') return;
      if (parsed.data.disposition !== 'addressed') return;
      expect(parsed.data.reason).toBe('addressed by adding section X at line 42');
    });

    it('accepts `deferred` with `reason` field missing (contract scoped to `addressed`)', () => {
      const parsed = DraftAnnotationSchema.safeParse({
        ...BASE_ADDRESS,
        disposition: 'deferred',
        // no reason field
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      if (parsed.data.type !== 'address') return;
      expect(parsed.data.disposition).toBe('deferred');
    });

    it('accepts `deferred` with a non-empty `reason`', () => {
      const parsed = DraftAnnotationSchema.safeParse({
        ...BASE_ADDRESS,
        disposition: 'deferred',
        reason: 'deferred to Phase 9',
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts `wontfix` with `reason` field missing (contract scoped to `addressed`)', () => {
      const parsed = DraftAnnotationSchema.safeParse({
        ...BASE_ADDRESS,
        disposition: 'wontfix',
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      if (parsed.data.type !== 'address') return;
      expect(parsed.data.disposition).toBe('wontfix');
    });

    it('accepts `wontfix` with a non-empty `reason`', () => {
      const parsed = DraftAnnotationSchema.safeParse({
        ...BASE_ADDRESS,
        disposition: 'wontfix',
        reason: 'out of scope per operator decision',
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('TS narrowing — addressed variant exposes `reason` as a required string', () => {
    it('exposes `reason` as a present string on the parsed addressed variant', () => {
      const parsed = DraftAnnotationSchema.safeParse({
        ...BASE_ADDRESS,
        disposition: 'addressed',
        reason: 'addressed by adding receipts',
      });
      expect(parsed.success).toBe(true);
      if (!parsed.success) return;
      if (parsed.data.type !== 'address') return;
      if (parsed.data.disposition !== 'addressed') return;
      // After narrowing to the `addressed` variant, `reason` is a
      // required `string` — the type system + the runtime parse both
      // guarantee it's a non-empty string.
      const reason: string = parsed.data.reason;
      expect(reason.length).toBeGreaterThan(0);
    });
  });
});
