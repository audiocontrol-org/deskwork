// specs/036-fleet-control-plane — T107 (RED), Phase 7-adjacent uplink work.
//
// Pins the SSE RECONNECT backoff described in
// contracts/sidecar-plane-protocol.md § C4 (line ~43):
//
//   "Reconnect policy: full jitter, base 1s (reseeded by the server's
//   `retry:` field), ×2, cap 30s, reset after 60s healthy. Retry forever,
//   except: terminal-fail states, 401, 403."
//
// THIS IS A DIFFERENT BACKOFF from src/sidecar/spool/drain.ts's
// `BackoffSchedule` / `computeBackoffDelayMs`. That module backs the spool
// drain/transmit retry loop (FR-017's overflow-drain path); this one backs
// the SSE stream's own reconnect loop (§ C4 / FR-019-020). Both happen to
// share the same numeric policy shape (full jitter, base 1s, ×2, cap 30s,
// reset after 60s healthy) by design — one pinned policy, applied at two
// deliberately decoupled call sites, per drain.ts's own header note
// ("src/sidecar/uplink/transport.ts's future reconnect.ts... same shape by
// design... deliberately decoupled (no shared mutable state)"). This suite
// does NOT import drain.ts's `BackoffSchedule` — that class's public shape
// (stateful `nextDelayMs()` with an internal auto-incrementing counter,
// `markHealthy(nowMs)` driven by a real/injected clock) does not match the
// reconnect-specific API this task assumes (an explicit `attempt` argument
// per call, and `noteHealthyFor(elapsedMs)` taking an already-computed
// elapsed-healthy duration rather than a clock timestamp). A future
// implementation of `src/sidecar/uplink/reconnect.ts` MAY internally reuse
// `computeBackoffDelayMs`'s pure math if it chooses to — that is an
// implementation-detail decision for T113, not asserted here.
//
// TARGET IMPL (does not exist yet — T113; correct for RED): a new module
// `src/sidecar/uplink/reconnect.ts` exporting:
//
//   export interface ReconnectBackoffOptions {
//     readonly baseMs?: number;         // default 1000
//     readonly capMs?: number;          // default 30000
//     readonly healthyResetMs?: number; // default 60000
//     readonly random?: () => number;   // injectable [0,1) full-jitter source; default Math.random
//   }
//   export class ReconnectBackoff {
//     constructor(opts?: ReconnectBackoffOptions);
//     nextDelayMs(attempt: number): number;              // full jitter over [0, min(cap, base*2^attempt))
//     reseedBaseFromServerRetry(retryMs: number): void;   // server `retry:` frame reseeds the base
//     noteHealthyFor(elapsedMs: number): void;            // >= healthyResetMs reverts the reseeded base to the original
//   }
//
// Repo convention: relative `.js` imports under node16 resolution (no `@/`
// alias). No `any`, no `as`, no `@ts-ignore` (Principle VI). Randomness is
// injected via `random`, never asserted against real `Math.random()`.

import { describe, expect, it } from 'vitest';
import type { ReconnectBackoffOptions } from '../../src/sidecar/uplink/reconnect.js';
import { ReconnectBackoff } from '../../src/sidecar/uplink/reconnect.js';

describe('ReconnectBackoff — SSE reconnect policy (contracts/sidecar-plane-protocol.md § C4)', () => {
  it('is full jitter: random()=>1 (max) yields exactly the base at attempt 0', () => {
    const backoff = new ReconnectBackoff({ baseMs: 1000, capMs: 30_000, random: () => 1 });
    expect(backoff.nextDelayMs(0)).toBe(1000);
  });

  it('is full jitter: random()=>0 (min) yields exactly 0 at attempt 0', () => {
    const backoff = new ReconnectBackoff({ baseMs: 1000, capMs: 30_000, random: () => 0 });
    expect(backoff.nextDelayMs(0)).toBe(0);
  });

  it('never exceeds min(cap, base*2^attempt) — the full-jitter sampling window', () => {
    const opts: ReconnectBackoffOptions = { baseMs: 1000, capMs: 30_000, random: () => 0.999999 };
    const boundedGrowth = Math.min(30_000, 1000 * 2 ** 3); // 8000, well under cap
    const backoff = new ReconnectBackoff(opts);
    const delay = backoff.nextDelayMs(3);
    expect(delay).toBeLessThan(boundedGrowth);
    expect(delay).toBeGreaterThan(boundedGrowth * 0.99);
  });

  it('grows ×2 per attempt until the cap is reached, then holds at the cap (30s)', () => {
    const backoff = new ReconnectBackoff({ baseMs: 1000, capMs: 30_000, random: () => 1 });
    expect(backoff.nextDelayMs(0)).toBe(1000); // 1000 * 2^0
    expect(backoff.nextDelayMs(1)).toBe(2000); // 1000 * 2^1
    expect(backoff.nextDelayMs(2)).toBe(4000); // 1000 * 2^2
    expect(backoff.nextDelayMs(4)).toBe(16_000); // 1000 * 2^4
    expect(backoff.nextDelayMs(5)).toBe(30_000); // 1000 * 2^5 = 32000, capped to 30000
    expect(backoff.nextDelayMs(20)).toBe(30_000); // stays capped for any larger attempt
  });

  it('reseedBaseFromServerRetry replaces the base used by every subsequent nextDelayMs call', () => {
    const backoff = new ReconnectBackoff({ baseMs: 1000, capMs: 30_000, random: () => 1 });
    backoff.reseedBaseFromServerRetry(5000);
    expect(backoff.nextDelayMs(0)).toBe(5000); // reseeded base, not the constructor default
    expect(backoff.nextDelayMs(1)).toBe(10_000); // growth still ×2 from the reseeded base
  });

  it('noteHealthyFor(>= healthyResetMs) reverts a reseeded base back to the original', () => {
    const backoff = new ReconnectBackoff({
      baseMs: 1000,
      capMs: 30_000,
      healthyResetMs: 60_000,
      random: () => 1,
    });
    backoff.reseedBaseFromServerRetry(5000);
    expect(backoff.nextDelayMs(0)).toBe(5000);

    backoff.noteHealthyFor(60_000); // exactly the healthy-reset threshold
    expect(backoff.nextDelayMs(0)).toBe(1000); // back to the original constructor base
  });

  it('noteHealthyFor(< healthyResetMs) does NOT revert a reseeded base', () => {
    const backoff = new ReconnectBackoff({
      baseMs: 1000,
      capMs: 30_000,
      healthyResetMs: 60_000,
      random: () => 1,
    });
    backoff.reseedBaseFromServerRetry(5000);
    backoff.noteHealthyFor(59_999); // just under the threshold
    expect(backoff.nextDelayMs(0)).toBe(5000); // still reseeded, unchanged
  });

  it('applies documented defaults (base 1s, cap 30s, healthyResetMs 60s) when opts are omitted', () => {
    const backoff = new ReconnectBackoff({ random: () => 1 });
    expect(backoff.nextDelayMs(0)).toBe(1000); // default base
    expect(backoff.nextDelayMs(20)).toBe(30_000); // default cap

    backoff.reseedBaseFromServerRetry(9000);
    backoff.noteHealthyFor(60_000); // default healthyResetMs
    expect(backoff.nextDelayMs(0)).toBe(1000); // default base restored
  });
});
