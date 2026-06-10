/**
 * plugins/stack-control/src/scope-discovery/dispatch-wrapper-cli.ts
 *
 * CLI bridge between the orchestrating Claude session and the
 * dispatch-wrapper engine. The TF-005 friction (logged in the
 * scope-discovery canary's tooling-feedback.md) named the failure:
 * `wrap()` takes a `dispatchFn` callback, but the orchestrator's only
 * dispatch primitive is Claude Code's Agent tool — a runtime tool-use,
 * not a TypeScript callable. There is no way for the orchestrator to
 * "supply a real `dispatchFn`" from inside `wrap()`.
 *
 * This module factors the prompt-augmentation half (refactor-marker
 * detection, project-override loading, GRAMMAR_INSTRUCTION append,
 * REFACTOR_PRECONDITIONS_CHECKLIST prelude) and the response-validation
 * half (parseReturn + validateParsed) out of the in-band `wrap()` flow,
 * so the orchestrator can engage them in two Bash invocations:
 *
 *   1. `stackctl wrap-prompt --agent-type <t> --prompt-file <p>`
 *      — stdout is the augmented prompt the agent pastes into the Agent
 *      tool's prompt parameter.
 *
 *   2. `stackctl validate-return --agent-type <t> --response-file <r>`
 *      — exit 0 on valid; 1 on rejection. Stdout is JSON; stderr a
 *      one-line summary.
 *
 * The in-band `wrap()` API in `dispatch-wrapper.ts` stays functional for
 * any internal TS callers — both paths share the same library functions
 * for marker detection, override loading, grammar instruction, and
 * parser/validator. YAML override loaders live in
 * `dispatch-wrapper-overrides.ts` to keep this module under the file cap.
 */

import {
  DispatchRejected,
  FORBIDDEN_DEFERRAL_PHRASES,
  FORBIDDEN_DEFERRAL_REGEXES,
  findForbiddenPhraseIn,
  parseReturn,
  validateParsed,
  type MissingBlock,
} from './dispatch-grammar.js';
import {
  REFACTOR_PRECONDITIONS_CHECKLIST,
  isRefactorContextPromptWith,
} from './refactor-preconditions-prompt.js';
import {
  GRAMMAR_INSTRUCTION,
  buildGrammarInstruction,
} from './dispatch-wrapper.js';
import { resolveCliConfig } from './dispatch-wrapper-overrides.js';

// ---------------------------------------------------------------------------
// wrapPromptForCli — emit the augmented prompt as plain text
// ---------------------------------------------------------------------------

export interface WrapPromptCliArgs {
  readonly agentType: string;
  readonly taskPrompt: string;
  readonly repoRoot: string;
}

export interface WrapPromptCliResult {
  readonly augmentedPrompt: string;
  readonly refactorMarkerMatched: boolean;
  readonly projectOverrideForbiddenLoaded: boolean;
  readonly projectOverrideMarkersLoaded: boolean;
  readonly summary: string;
}

export async function wrapPromptForCli(
  args: WrapPromptCliArgs,
): Promise<WrapPromptCliResult> {
  const config = await resolveCliConfig(args.repoRoot);
  const refactorMatched = isRefactorContextPromptWith(
    args.taskPrompt,
    config.markers,
  );
  // Mirror dispatch-wrapper.ts wrap(): use the cached GRAMMAR_INSTRUCTION
  // constant when the active lists are the defaults; otherwise rebuild
  // so the prompt names the override-active phrase/regex lists.
  const grammarInstruction =
    config.phrases === FORBIDDEN_DEFERRAL_PHRASES &&
    config.regexes === FORBIDDEN_DEFERRAL_REGEXES
      ? GRAMMAR_INSTRUCTION
      : buildGrammarInstruction(config.phrases, config.regexes);
  const refactorPrelude = refactorMatched ? REFACTOR_PRECONDITIONS_CHECKLIST : '';
  const augmentedPrompt = args.taskPrompt + grammarInstruction + refactorPrelude;

  const lineCount = augmentedPrompt.split(/\r?\n/).length;
  const summary =
    `wrap-prompt: augmented ${lineCount}-line prompt for agent-type=${args.agentType} ` +
    `(refactor-marker: ${refactorMatched ? 'yes' : 'no'}; ` +
    `project override: ${config.phrasesFromOverride || config.markersFromOverride ? 'yes' : 'no'})`;

  return {
    augmentedPrompt,
    refactorMarkerMatched: refactorMatched,
    projectOverrideForbiddenLoaded: config.phrasesFromOverride,
    projectOverrideMarkersLoaded: config.markersFromOverride,
    summary,
  };
}

// ---------------------------------------------------------------------------
// validateReturnForCli — parse + validate; emit structured ValidationResult
// ---------------------------------------------------------------------------

export interface ForbiddenPhraseHit {
  readonly phrase: string;
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly foundBlocks: {
    readonly searched: boolean;
    readonly included: boolean;
    readonly excluded: boolean;
  };
  readonly missingBlocks: ReadonlyArray<MissingBlock>;
  readonly parseError: string | null;
  readonly forbiddenPhrases: ReadonlyArray<ForbiddenPhraseHit>;
  readonly refactorPreconditionViolations: ReadonlyArray<string>;
  readonly skippedAudit: string | null;
  readonly summary: string;
}

export interface ValidateReturnCliArgs {
  readonly response: string;
  readonly agentType: string;
  readonly repoRoot: string;
}

/**
 * Refactor-eligible agent types — the subset that actually carries
 * refactor dispatches. ui-engineer does design work and doesn't
 * currently receive refactor markers; reviewer + code-explorer are
 * read-only. The set mirrors the dispatch-wrapper engagement profile.
 */
const REFACTOR_ELIGIBLE_TYPES: ReadonlySet<string> = new Set([
  'implementer',
  'code-architect',
  'typescript-pro',
]);

/**
 * Check refactor preconditions on a sub-agent response. The dispatch
 * grammar's parser/validator covers grammar + forbidden phrases + the
 * skipped-audit shape. The refactor branch checks that the response
 * either (a) cites a canonical_side disposition AND tests_proof.sha, or
 * (b) makes no refactor claim at all. Returns a list of violation
 * descriptions; empty means no violation.
 *
 * Heuristic-based — the response is the sub-agent's prose, which may not
 * have machine-grade structure. We look for the canonical_side and
 * tests_proof cues in the response text; missing one or both when the
 * response itself claims a refactor (and the agent type is refactor-
 * eligible) triggers a violation surface.
 */
function refactorPreconditionViolations(
  response: string,
  agentType: string,
): ReadonlyArray<string> {
  const lower = response.toLowerCase();
  const claimsRefactor =
    lower.includes('refactor') ||
    lower.includes('extraction') ||
    lower.includes('clones.yaml') ||
    lower.includes('canonical_side');
  if (!claimsRefactor) return [];
  if (!REFACTOR_ELIGIBLE_TYPES.has(agentType)) return [];

  const violations: string[] = [];
  if (!lower.includes('canonical_side')) {
    violations.push(
      'response describes a refactor but does not cite `canonical_side` ' +
        '(per refactor-preconditions, the disposition entry must declare the ' +
        'canonical_side branch and the response must reflect which branch was verified)',
    );
  }
  if (!lower.includes('tests_proof')) {
    violations.push(
      'response describes a refactor but does not cite `tests_proof.sha` ' +
        '(per refactor-preconditions, the response must verify that the ' +
        'failing-test commit genuinely shows test failure on broken code)',
    );
  }
  return violations;
}

export async function validateReturnForCli(
  args: ValidateReturnCliArgs,
): Promise<ValidationResult> {
  const config = await resolveCliConfig(args.repoRoot);

  // Run the parser. parseReturn() throws DispatchRejected with the
  // missingBlocks list when one or more required blocks is absent.
  let parsed: ReturnType<typeof parseReturn> | null = null;
  let parseError: string | null = null;
  let missingBlocks: ReadonlyArray<MissingBlock> = [];
  try {
    parsed = parseReturn(args.response);
  } catch (err) {
    if (err instanceof DispatchRejected) {
      parseError = err.message;
      missingBlocks = err.missingBlocks;
    } else {
      throw err;
    }
  }

  const searchedFound =
    parsed !== null ||
    (parseError !== null && !missingBlocks.includes('Searched'));
  const includedFound =
    parsed !== null ||
    (parseError !== null && !missingBlocks.includes('Included'));
  const excludedFound =
    parsed !== null ||
    (parseError !== null && !missingBlocks.includes('Excluded'));

  const forbiddenHits: ForbiddenPhraseHit[] = [];
  let skippedAudit: string | null = null;

  if (parsed !== null) {
    // Validator (validateParsed) throws on the FIRST violation; we walk
    // each excluded entry ourselves so the result surfaces ALL hits
    // (the orchestrator's correction note benefits from seeing every
    // problem at once instead of round-tripping one at a time).
    for (const entry of parsed.excluded) {
      const hit = findForbiddenPhraseIn(
        entry.reason,
        config.phrases,
        config.regexes,
      );
      if (hit !== null) {
        forbiddenHits.push({
          phrase: hit.phrase,
          file: entry.file,
          line: entry.line,
          reason: entry.reason,
        });
      }
    }
    // Skipped-audit detector (Rule 1 of validateParsed).
    if (
      parsed.searched.count > 1 &&
      parsed.included.length === 1 &&
      parsed.excluded.length === 0
    ) {
      skippedAudit =
        `Searched reported ${parsed.searched.count} matches for ` +
        `"${parsed.searched.pattern}" but Included covers only 1 file:line ` +
        `and Excluded is empty — same-class audit skipped.`;
    }
    // Run validateParsed too as a teeth-check on the in-band validator
    // (any path we miss here should still trip via validateParsed). Catch
    // the throw — the structured result is the authoritative output.
    try {
      validateParsed(parsed, {
        forbiddenPhrases: config.phrases,
        forbiddenRegexes: config.regexes,
      });
    } catch (err) {
      if (!(err instanceof DispatchRejected)) throw err;
      // validateParsed surfaced something our walk above didn't.
      // Preserve the message in parseError so the operator sees it.
      if (parseError === null) parseError = err.message;
    }
  }

  const refactorViolations = refactorPreconditionViolations(
    args.response,
    args.agentType,
  );

  const valid =
    parseError === null &&
    forbiddenHits.length === 0 &&
    skippedAudit === null &&
    refactorViolations.length === 0;

  const summary = buildValidateSummary({
    valid,
    parseError,
    forbiddenHits,
    skippedAudit,
    refactorViolations,
    agentType: args.agentType,
  });

  return {
    valid,
    foundBlocks: {
      searched: searchedFound,
      included: includedFound,
      excluded: excludedFound,
    },
    missingBlocks,
    parseError,
    forbiddenPhrases: forbiddenHits,
    refactorPreconditionViolations: refactorViolations,
    skippedAudit,
    summary,
  };
}

interface ValidateSummaryInput {
  readonly valid: boolean;
  readonly parseError: string | null;
  readonly forbiddenHits: ReadonlyArray<ForbiddenPhraseHit>;
  readonly skippedAudit: string | null;
  readonly refactorViolations: ReadonlyArray<string>;
  readonly agentType: string;
}

function buildValidateSummary(input: ValidateSummaryInput): string {
  if (input.valid) {
    return `validate-return: response valid for agent-type=${input.agentType}`;
  }
  const reasons: string[] = [];
  if (input.parseError !== null) reasons.push(input.parseError);
  if (input.skippedAudit !== null) reasons.push('skipped-audit');
  if (input.forbiddenHits.length > 0) {
    const phrases = input.forbiddenHits
      .map((h) => `"${h.phrase}" at ${h.file}:${h.line}`)
      .join(', ');
    reasons.push(`forbidden-phrase: ${phrases}`);
  }
  if (input.refactorViolations.length > 0) {
    reasons.push(`refactor-preconditions: ${input.refactorViolations.length} violation(s)`);
  }
  return `validate-return: REJECTED (${reasons.join('; ')})`;
}
