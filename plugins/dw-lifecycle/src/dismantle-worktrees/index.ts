export { propose, ProposalOutputExistsError } from './propose.js';
export type { ProposeArgs, ProposeResult } from './propose.js';
export { apply, ApplyValidationError } from './apply.js';
export type { ApplyArgs } from './apply.js';
export { dismantleWorktree } from './dismantle.js';
export type { DismantleArgs, DismantleResult } from './dismantle.js';
export { runPreflight, DismantleWorktreesPreflightError } from './preflight.js';
export type { PreflightProbeInput, ProbedState, PreflightKind } from './preflight.js';
export type {
  ProposalFile,
  ProposalItem,
  OperatorDecision,
  ApplyResult,
  PerItemResult,
  DismantleContext,
  DismantleOptions,
} from './types.js';
