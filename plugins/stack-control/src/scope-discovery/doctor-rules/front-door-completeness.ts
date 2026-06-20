/**
 * plugins/stack-control/src/scope-discovery/doctor-rules/front-door-completeness.ts
 *
 * Doctor rule (028 US4 T111; FR-032): wrap `check-front-door` so its four-assertion
 * guard surfaces as scope-doctor findings. Each gap check-front-door reports (a deleted
 * skill, a broken --help, an unfronted mutating verb, a skill↔verb parity break) becomes
 * one error-severity finding — so a PR-readiness `scope-doctor` pass also catches a
 * silently-regressing front door.
 *
 * The rule reuses the EXACT production check (`runLiveCheckFrontDoor`) — there is no
 * second copy of the assertion logic. The injectable `runCheck` seam keeps the rule
 * unit-testable without spawning the CLI surface.
 */

import { runLiveCheckFrontDoor, type CheckFrontDoorResult } from '../../subcommands/check-front-door.js';
import type { DoctorRuleCheck, DoctorRuleOptions, ScopeDoctorFinding } from './types.js';

const RULE_ID = 'front-door-completeness';

/** The rule's options, extended with an injectable check runner for testing. */
export interface FrontDoorCompletenessOptions extends DoctorRuleOptions {
  /** Inject the check result (tests); defaults to the live check-front-door run. */
  readonly runCheck?: () => CheckFrontDoorResult;
}

/** The testable core: run check-front-door (live or injected) and lift each gap into a
 *  finding. A clean surface yields no findings. */
export async function runFrontDoorCompleteness(
  opts: FrontDoorCompletenessOptions,
): Promise<readonly ScopeDoctorFinding[]> {
  const result = (opts.runCheck ?? runLiveCheckFrontDoor)();
  if (result.ok) return [];
  return result.gaps.map((gap) => ({
    rule: RULE_ID,
    severity: 'error' as const,
    message: `front door has regressed: ${gap}`,
  }));
}

/** The DoctorRuleCheck the index registers. */
export const check: DoctorRuleCheck = async (
  opts: DoctorRuleOptions,
): Promise<readonly ScopeDoctorFinding[]> => runFrontDoorCompleteness(opts);
