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
  /**
   * Returns true when the project has at least one hook-run-log entry
   * (i.e., implement-hook has run at least once since opt-in). Used to
   * distinguish "boot case" (just opted in, no hook has ever run) from
   * "stale-state" (hook ran before but the marker was deleted).
   * Per AUDIT-20260531-17: without this distinction, a freshly-opted-
   * in project deadlocks — its first commit can't satisfy a missing
   * marker, but no commit can land to trigger the first hook run.
   */
  readonly hasAnyPriorHookRun: () => Promise<boolean>;
  /**
   * Phase 22 Task 3 (#399 Friction 1): returns true iff `tip` is an
   * ancestor of HEAD (the parent commit at gate-time). Used to distinguish
   * "marker stale on the same history line" (refuse — operator skipped
   * the hook between two commits) from "marker on a divergent history
   * line" (allow as boot case — the operator did `git reset --hard
   * origin/main`, marker came back tracked from main's tree, and points
   * at a commit no longer reachable from HEAD).
   *
   * Without this distinction, sync-from-main breaks every commit-msg
   * gate until manual marker hand-edit; with it, the gate self-recovers
   * because the diverged marker is recognized as "from another timeline."
   *
   * Default impl runs `git merge-base --is-ancestor <tip> HEAD` and maps
   * exit-0 → true, exit-anything-else → false.
   */
  readonly isAncestorOfHead: (tip: string) => Promise<boolean>;
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
      readonly kind: 'allow-marker-diverged-history';
      readonly markerTip: string;
      readonly head: string;
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
    // Distinguish boot case (never ran) from stale-state (deleted marker).
    // Per AUDIT-20260531-17: a freshly-opted-in project's first commit
    // must be allowed; otherwise the project deadlocks.
    const hasPriorRun = await args.hasAnyPriorHookRun();
    if (!hasPriorRun) {
      return {
        kind: 'allow-no-prior-run',
        reason:
          'No marker and no prior hook-run-log entries — project just opted into scope-discovery; ' +
          'allow first commit. The audit-barrage hook will engage on subsequent task-completion commits.',
      };
    }
    return {
      kind: 'refuse-marker-missing',
      head,
      cure:
        `Marker missing but hook-run-log has prior entries (marker was deleted or corrupted). ` +
        `Run \`${CURE_VERB}\` to re-fire the audit-barrage hook on the parent commit ` +
        `(${head.slice(0, 8)}) BEFORE retrying this commit.`,
    };
  }
  if (marker.tip === head) {
    return {
      kind: 'allow-marker-matches-head',
      markerTip: marker.tip,
      reason: `Audit-barrage hook ran since the parent commit (tip ${marker.tip.slice(0, 8)} matches HEAD).`,
    };
  }
  // Phase 22 Task 3 (#399 Friction 1): marker.tip !== HEAD has two
  // sub-cases. If marker.tip IS an ancestor of HEAD, the marker is
  // genuinely stale on the same history line — the operator landed a
  // commit between hook runs. If marker.tip is NOT an ancestor of HEAD,
  // history diverged via reset/rebase/sync; the marker came from
  // another timeline (the live repro: `git reset --hard origin/main`
  // brings back a tracked marker pointing at a commit no longer
  // reachable from the post-reset HEAD). Treat the diverged case as
  // boot — the operator's intent is clearly "start fresh from this tip,"
  // and any prior-hook-run record is moot.
  const onSameHistory = await args.isAncestorOfHead(marker.tip);
  if (!onSameHistory) {
    return {
      kind: 'allow-marker-diverged-history',
      markerTip: marker.tip,
      head,
      reason:
        `Marker tip ${marker.tip.slice(0, 8)} is not an ancestor of HEAD ${head.slice(0, 8)} — ` +
        `history diverged (likely via \`git reset --hard\` / rebase / sync). ` +
        `Treating as boot case per Phase 22 Task 3 (#399 Friction 1); ` +
        `the next implement-hook run will re-baseline the marker.`,
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
