/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/check-implement-hook-ran.ts
 *
 * Phase 17 Task 4 — commit-msg gate (Layer 2 of three-layer mechanization).
 *
 * Refuses commits when the audit-barrage hook hasn't run since the
 * parent commit. The teeth that close the agent-discretion loophole
 * exposed during this session (the c9849b6 + dde415a missed-hook
 * commits during Phase 16 implementation).
 *
 * Operator's directive (2026-05-31): *"when to run the barrage should
 * not be a matter of policy and the agent should have no discretion.
 * It must be mechanized with teeth."*
 *
 * Mechanism: at commit-msg time (BEFORE the new commit lands), HEAD
 * points at the PARENT commit. The gate reads the marker and compares
 * `marker.tip === HEAD`. Match → the agent ran the hook on the parent
 * commit's diff → allow. Mismatch (or missing marker) → refuse with
 * a cure message naming the exact verb invocation.
 *
 * Pure-fn with injected marker reader + git HEAD resolver + opt-in
 * detector so the library is unit-testable without a real
 * `.dw-lifecycle/` tree or git repo.
 */

import type { HookRunMarker } from './hook-run-marker.js';

export interface CheckImplementHookRanArgs {
  /** Repo root for the gate's scope-discovery opt-in check. */
  readonly repoRoot: string;
  /** Injected; default resolves marker from .dw-lifecycle/scope-discovery/. */
  readonly readMarker: () => Promise<HookRunMarker | null>;
  /** Injected; default = `git rev-parse HEAD`. */
  readonly gitHeadResolver: () => Promise<string>;
  /**
   * Injected; default checks `.dw-lifecycle/scope-discovery/` exists.
   * False = project not opted into scope-discovery → gate is moot.
   */
  readonly isScopeDiscoveryOptedIn: () => Promise<boolean>;
}

export type CheckImplementHookRanResult =
  | {
      readonly kind: 'allow-not-opted-in';
      readonly reason: string;
    }
  | {
      readonly kind: 'allow-no-prior-run';
      readonly reason: string;
    }
  | {
      readonly kind: 'allow-marker-matches-head';
      readonly markerTip: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'refuse-marker-missing';
      readonly head: string;
      readonly cure: string;
    }
  | {
      readonly kind: 'refuse-marker-stale';
      readonly markerTip: string;
      readonly head: string;
      readonly cure: string;
    };

const CURE_VERB = 'dw-lifecycle implement-hook --feature <slug>';

export async function checkImplementHookRan(
  args: CheckImplementHookRanArgs,
): Promise<CheckImplementHookRanResult> {
  const optedIn = await args.isScopeDiscoveryOptedIn();
  if (!optedIn) {
    return {
      kind: 'allow-not-opted-in',
      reason:
        'Project has not opted into scope-discovery (.dw-lifecycle/scope-discovery/ absent); gate is moot.',
    };
  }
  const marker = await args.readMarker();
  const head = await args.gitHeadResolver();
  if (marker === null) {
    return {
      kind: 'refuse-marker-missing',
      head,
      cure:
        `No hook-run marker found. Run \`${CURE_VERB}\` to fire the audit-barrage hook ` +
        `on the parent commit (${head.slice(0, 8)}) BEFORE retrying this commit.`,
    };
  }
  if (marker.tip === head) {
    return {
      kind: 'allow-marker-matches-head',
      markerTip: marker.tip,
      reason: `Audit-barrage hook ran since the parent commit (tip ${marker.tip.slice(0, 8)} matches HEAD).`,
    };
  }
  return {
    kind: 'refuse-marker-stale',
    markerTip: marker.tip,
    head,
    cure:
      `Hook-run marker is stale: marker.tip=${marker.tip.slice(0, 8)} but HEAD=${head.slice(0, 8)}. ` +
      `A commit landed since the last hook run. Run \`${CURE_VERB}\` to audit the new diff BEFORE retrying this commit.`,
  };
}
