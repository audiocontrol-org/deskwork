/**
 * Doctor — public surface.
 *
 * Re-exports the rule registry, runner, types, and the schema-patch
 * helper. Callers (the CLI command, the studio in a future phase, and
 * tests) only import from here.
 */

export type {
  DoctorContext,
  DoctorInteraction,
  DoctorReport,
  DoctorRule,
  Finding,
  FindingSeverity,
  RepairChoice,
  RepairPlan,
  RepairResult,
} from './types.ts';

export {
  RULES,
  parseFixArgument,
  runAudit,
  runRepair,
  yesInteraction,
  declineInteraction,
  type DoctorRunOptions,
} from './runner.ts';

export { printSchemaPatchInstructions } from './schema-patch.ts';
