// Typed parser-adapter boundary (027 T002; research Decision 1; Constitution
// Principle VI — strict typing, zero `as`/`any`/`@ts-ignore`).
//
// `commander` types parsed flags as `OptionValues` (`{ [k: string]: any }`).
// That `any` is the ONE place untyped data crosses into the verb layer. This
// module is the single audited place that seal is opened: `rawOpts()` widens
// commander's `any` into `unknown` (a widening that needs NO cast), and every
// field is then narrowed through a typed `OptionReader`. A shape mismatch FAILS
// LOUD with no silent coercion (Principle V); the ONE intentional default is
// `booleanOption` mapping an absent flag to `false` (commander's boolean
// convention) — documented on the reader, not a hidden fallback. A verb reads
// its parsed flags through these scalar readers into its own typed options
// object, so handler code never touches `any`.
//
// Scope: this scaffold provides the seal + the claim-free scalar readers whose
// behavior is verifiable in isolation. List/comma-split readers are flag-specific
// (`--depends-on` keeps empty tokens today; `--into` drops them — they do NOT
// share splitting semantics) and are introduced alongside the actual flag wiring
// (027 US1/US2), where each flag's behavior can be preserved exactly (FR-006) and
// tested against the real roadmap surface. They are deliberately NOT pre-built
// here. No verb consumes this module yet.

import type { Command } from 'commander';

/** Raised when a parsed option value does not match the reader's expected shape. */
export class CommandAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandAdapterError';
  }
}

/**
 * Read a commander `Command`'s parsed options as `Record<string, unknown>`.
 *
 * This is THE seal: `optsWithGlobals()` is typed `OptionValues` (`{ [k]: any }`);
 * assigning it to `Record<string, unknown>` widens `any`→`unknown` and requires
 * no cast. Every caller narrows the result through the readers below — nothing
 * downstream ever touches `any`.
 *
 * `optsWithGlobals()` (not `opts()`) so a parent/global flag — e.g. a universal
 * `--doc` a verb exposes on its parent command — is included in the full parsed
 * set rather than silently dropped as absent (AUDIT-BARRAGE-codex-02). For a
 * command with no parent globals it is identical to `opts()`.
 */
export function rawOpts(command: Command): Record<string, unknown> {
  const opts: Record<string, unknown> = command.optsWithGlobals();
  return opts;
}

/** Narrows one raw option value (typed `unknown` at this boundary) to `T`. */
export type OptionReader<T> = (raw: unknown, flagName: string) => T;

function describe(raw: unknown): string {
  if (raw === null) return 'null';
  if (Array.isArray(raw)) return 'array';
  return typeof raw;
}

/**
 * A required string flag. Fails loud when absent, non-string, or empty/whitespace
 * — an empty required value is a usage error, never a silently-accepted "present"
 * (the fail-loud, no-coercion contract; Principle V).
 *
 * Two deliberate policy notes for the verb-wiring author (US1/US2):
 * - Non-empty is the policy for the REQUIRED scalar reader. A flag that
 *   legitimately permits an empty value introduces its own reader when wired —
 *   the same per-flag deferral applied to list readers above; emptiness is not
 *   baked in for every future flag, it is this reader's contract.
 * - Validation is presence-and-non-empty, NOT normalization: the value is
 *   returned VERBATIM (leading/trailing whitespace preserved). A flag that needs
 *   trimming/casefolding does it at the verb, so identity comparisons stay
 *   explicit at the call site.
 */
export const stringOption: OptionReader<string> = (raw, flagName) => {
  if (typeof raw !== 'string') {
    throw new CommandAdapterError(`--${flagName} expects a string value (got ${describe(raw)})`);
  }
  if (raw.trim().length === 0) {
    throw new CommandAdapterError(`--${flagName} expects a non-empty string value (got empty)`);
  }
  return raw;
};

/**
 * A boolean flag. commander leaves an unset boolean `undefined` and sets a
 * present one to `true`; both map to a `boolean` here. Any other shape fails loud.
 */
export const booleanOption: OptionReader<boolean> = (raw, flagName) => {
  if (raw === undefined) return false;
  if (typeof raw !== 'boolean') {
    throw new CommandAdapterError(`--${flagName} is a boolean flag (got ${describe(raw)})`);
  }
  return raw;
};

/** An optional string flag: `undefined` when unset, else a validated string. */
export const optionalStringOption: OptionReader<string | undefined> = (raw, flagName) =>
  raw === undefined ? undefined : stringOption(raw, flagName);
