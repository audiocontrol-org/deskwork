// specs/036-fleet-control-plane — T077 (RED), Phase 6 / US4. Pairs with T082
// impl (src/sidecar/liveness.ts).
//
// FR-006 (local-socket-protocol.md C1, last row): "Sidecar dies mid-run ⇒
// run continues executing... Reports as temporarily uncommandable, never
// healthy." A connection lost WHILE a run is executing means the operator
// cannot act on the run RIGHT NOW — but the run is neither healthy (you'd
// think you could command it) nor dead (it is still executing). The verdict
// must be its OWN distinct state: `temporarily-uncommandable`.
//
// This test pins that the commandability verdict for a mid-run connection
// loss is `temporarily-uncommandable`, and that the verdict vocabulary
// deliberately EXCLUDES 'healthy' and 'dead' — a lost-connection run can be
// labeled neither.
//
// RED: src/sidecar/liveness.ts does not exist yet — the VALUE import below
// fails at module-load, the correct failing-first signal.
//
// Relative `.js` imports (node16). No `any`, no `as`, no `@ts-ignore`.

import { describe, expect, it } from 'vitest';
import {
  interpretCommandability,
  COMMANDABILITY_VERDICTS,
} from '../../src/sidecar/liveness.js';
import type { StatusAxes } from '../../src/fleet/status.js';

describe('temporarily-uncommandable (T077, FR-006 — connection lost mid-run is never healthy, never dead)', () => {
  it('connection lost while a run is EXECUTING ⇒ temporarily-uncommandable', () => {
    // The socket dropped abnormally and the sidecar is not answering, but the
    // run itself is still running — execution did not stop just because we
    // lost the ability to talk to it.
    const midRunConnectionLoss: StatusAxes = {
      connectionStatus: 'abnormally-disconnected',
      livenessStatus: 'unresponsive',
      executionStatus: 'running',
    };
    expect(interpretCommandability(midRunConnectionLoss)).toBe('temporarily-uncommandable');
  });

  it('temporarily-uncommandable is NEVER reported as healthy', () => {
    const midRunConnectionLoss: StatusAxes = {
      connectionStatus: 'abnormally-disconnected',
      livenessStatus: 'unresponsive',
      executionStatus: 'running',
    };
    const verdict = interpretCommandability(midRunConnectionLoss);
    expect(verdict).not.toBe('healthy');
    expect(verdict).not.toBe('commandable');
  });

  it('the uncommandable state is DISTINCT from healthy and from dead (its own verdict)', () => {
    const verdict = interpretCommandability({
      connectionStatus: 'abnormally-disconnected',
      livenessStatus: 'unresponsive',
      executionStatus: 'running',
    });
    // Distinct from a "you can act on it" verdict AND from any death verdict.
    expect(verdict).not.toBe('healthy');
    expect(verdict).not.toBe('dead');
    expect(verdict).not.toBe('crashed');
    expect(verdict).not.toBe('failed');
    expect(verdict).toBe('temporarily-uncommandable');
  });

  it('the commandability vocabulary excludes healthy and dead by construction', () => {
    // The enum deliberately has no 'healthy'/'dead' member — a mid-run
    // connection loss cannot be coerced into either label.
    const values: readonly string[] = COMMANDABILITY_VERDICTS;
    expect(values).not.toContain('healthy');
    expect(values).not.toContain('dead');
    expect(values).not.toContain('crashed');
    expect(values).toContain('temporarily-uncommandable');
  });

  it('a fully attached, live, running run IS commandable — distinct from the uncommandable verdict', () => {
    const healthyRun: StatusAxes = {
      connectionStatus: 'attached',
      livenessStatus: 'live',
      executionStatus: 'running',
    };
    const commandable = interpretCommandability(healthyRun);
    expect(commandable).toBe('commandable');
    expect(commandable).not.toBe(
      interpretCommandability({
        connectionStatus: 'abnormally-disconnected',
        livenessStatus: 'unresponsive',
        executionStatus: 'running',
      }),
    );
  });
});
