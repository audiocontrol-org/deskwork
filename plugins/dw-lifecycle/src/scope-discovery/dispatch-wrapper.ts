/**
 * plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper.ts
 *
 * Sub-agent dispatch wrapper for the scope-discovery protocol. Passive
 * directives ("write a Searched/Included/Excluded block in your return")
 * get systematically ignored, so the wrapper replaces the directive with
 * code. The sub-agent's response is parsed for the required grammar and
 * structurally rejected when the audit was skipped or the exclusion
 * reasons contain a deferral phrase.
 *
 * Library-only — no CLI subcommand. Consumed in TypeScript by other
 * dw-lifecycle skills or by external orchestrators that import
 * `@deskwork/plugin-dw-lifecycle`.
 *
 * Required return grammar:
 *
 *     Searched: <pattern> — <N matches>
 *     Included: <file:line>, <file:line>, ...
 *     Excluded: <file:line> — <one-line reason that is not a deferral>
 *                [, <file:line> — <reason>, ...]
 *
 * Architecture: Claude Code's Agent tool is a runtime primitive only the
 * orchestrating Claude session can invoke. Callers pass a `dispatchFn`
 * callback — the orchestrator supplies a real dispatcher; the adversarial
 * harness passes synthetic responses.
 *
 * Parser + validator + forbidden-phrase list live in
 * `dispatch-grammar.ts` so this file stays under the 500-line cap.
 *
 * Project overrides:
 *   - `.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml`
 *     replaces FORBIDDEN_DEFERRAL_PHRASES + FORBIDDEN_DEFERRAL_REGEXES
 *     (no merge — the project owns the full list).
 *   - `.dw-lifecycle/scope-discovery/refactor-markers.yaml` replaces
 *     REFACTOR_CONTEXT_MARKERS (no merge — same convention).
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  DispatchRejected,
  FORBIDDEN_DEFERRAL_PHRASES,
  FORBIDDEN_DEFERRAL_REGEXES,
  parseReturn,
  validateParsed,
  type ParsedDispatchReturn,
  type ValidateOptions,
} from './dispatch-grammar.js';
import {
  REFACTOR_CONTEXT_MARKERS,
  REFACTOR_PRECONDITIONS_CHECKLIST,
  isRefactorContextPrompt,
  isRefactorContextPromptWith,
} from './refactor-preconditions-prompt.js';
import { errorMessage, isEnoent, isPlainObject } from './util/typeguards.js';

// Re-export the grammar + prelude API so callers import a single module.
export {
  DispatchRejected,
  parseReturn,
  validateParsed,
  FORBIDDEN_DEFERRAL_PHRASES,
  FORBIDDEN_DEFERRAL_REGEXES,
} from './dispatch-grammar.js';
export {
  isRefactorContextPrompt,
  REFACTOR_PRECONDITIONS_CHECKLIST,
  REFACTOR_CONTEXT_MARKERS,
  CANONICAL_SIDE_BRANCH_NAMES,
} from './refactor-preconditions-prompt.js';
export type {
  ExcludedEntry,
  FileLine,
  MissingBlock,
  ParsedDispatchReturn,
  SearchedBlock,
  ValidateOptions,
} from './dispatch-grammar.js';

// ---------------------------------------------------------------------------
// Public dispatch types
// ---------------------------------------------------------------------------

export type DispatchFn = (params: {
  agentType: string;
  prompt: string;
}) => Promise<string>;

export interface WrapOptions {
  readonly dispatchFn: DispatchFn;
  /**
   * Project root to resolve `.dw-lifecycle/scope-discovery/*.yaml`
   * override files against. Defaults to `process.cwd()`.
   */
  readonly repoRoot?: string;
  /**
   * Override the forbidden-deferral phrase list directly (bypassing
   * any on-disk override file). Test entry point.
   */
  readonly forbiddenPhrases?: ReadonlyArray<string>;
  /**
   * Override the forbidden-deferral regex list directly (bypassing
   * any on-disk override file). Test entry point.
   */
  readonly forbiddenRegexes?: ReadonlyArray<RegExp>;
  /**
   * Override the refactor-marker regex list directly (bypassing any
   * on-disk override file). Test entry point.
   */
  readonly refactorMarkers?: ReadonlyArray<RegExp>;
}

// ---------------------------------------------------------------------------
// Override-loader paths
// ---------------------------------------------------------------------------

const FORBIDDEN_OVERRIDE_PATH =
  '.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml';
const REFACTOR_MARKERS_OVERRIDE_PATH =
  '.dw-lifecycle/scope-discovery/refactor-markers.yaml';

interface ForbiddenOverride {
  readonly phrases: ReadonlyArray<string>;
  readonly regexes: ReadonlyArray<RegExp>;
}

async function loadForbiddenOverride(
  repoRoot: string,
): Promise<ForbiddenOverride | null> {
  const absPath = resolve(repoRoot, FORBIDDEN_OVERRIDE_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new Error(
      `dispatch-wrapper: cannot read override ${absPath}: ${errorMessage(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `dispatch-wrapper: cannot parse override ${absPath}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `dispatch-wrapper: override ${absPath} did not parse to a YAML object`,
    );
  }
  const phrasesRaw = parsed['phrases'];
  const regexesRaw = parsed['regexes'];
  const phrases: string[] = [];
  if (phrasesRaw !== undefined) {
    if (!Array.isArray(phrasesRaw)) {
      throw new Error(
        `dispatch-wrapper: override ${absPath} 'phrases' must be a list when set`,
      );
    }
    phrasesRaw.forEach((p: unknown, i: number) => {
      if (typeof p !== 'string' || p.length === 0) {
        throw new Error(
          `dispatch-wrapper: override ${absPath} phrases[${i}] must be a non-empty string`,
        );
      }
      phrases.push(p);
    });
  }
  const regexes: RegExp[] = [];
  if (regexesRaw !== undefined) {
    if (!Array.isArray(regexesRaw)) {
      throw new Error(
        `dispatch-wrapper: override ${absPath} 'regexes' must be a list when set`,
      );
    }
    regexesRaw.forEach((r: unknown, i: number) => {
      if (typeof r !== 'string' || r.length === 0) {
        throw new Error(
          `dispatch-wrapper: override ${absPath} regexes[${i}] must be a non-empty string`,
        );
      }
      try {
        regexes.push(new RegExp(r, 'i'));
      } catch (err) {
        throw new Error(
          `dispatch-wrapper: override ${absPath} regexes[${i}] is not a valid RegExp: ${errorMessage(err)}`,
        );
      }
    });
  }
  if (phrases.length === 0 && regexes.length === 0) {
    throw new Error(
      `dispatch-wrapper: override ${absPath} produced zero phrases AND zero regexes ` +
        `(operator must supply at least one when overriding the built-in list)`,
    );
  }
  return { phrases, regexes };
}

async function loadRefactorMarkersOverride(
  repoRoot: string,
): Promise<ReadonlyArray<RegExp> | null> {
  const absPath = resolve(repoRoot, REFACTOR_MARKERS_OVERRIDE_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new Error(
      `dispatch-wrapper: cannot read override ${absPath}: ${errorMessage(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `dispatch-wrapper: cannot parse override ${absPath}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `dispatch-wrapper: override ${absPath} did not parse to a YAML object`,
    );
  }
  const markersRaw = parsed['markers'];
  if (!Array.isArray(markersRaw)) {
    throw new Error(
      `dispatch-wrapper: override ${absPath} missing required 'markers:' list`,
    );
  }
  const markers: RegExp[] = [];
  markersRaw.forEach((m: unknown, i: number) => {
    if (typeof m !== 'string' || m.length === 0) {
      throw new Error(
        `dispatch-wrapper: override ${absPath} markers[${i}] must be a non-empty string`,
      );
    }
    try {
      markers.push(new RegExp(m, 'i'));
    } catch (err) {
      throw new Error(
        `dispatch-wrapper: override ${absPath} markers[${i}] is not a valid RegExp: ${errorMessage(err)}`,
      );
    }
  });
  if (markers.length === 0) {
    throw new Error(
      `dispatch-wrapper: override ${absPath} produced zero markers (must have at least one)`,
    );
  }
  return markers;
}

// ---------------------------------------------------------------------------
// Grammar instruction appended to every dispatched prompt
// ---------------------------------------------------------------------------

/** Render a regex source as a human-readable shape for the prompt. */
function regexToPromptShape(re: RegExp): string {
  return re.source
    .replace(/\\b/g, '')
    .replace(/\\s\+/g, ' ')
    .replace(/\\s/g, ' ')
    .replace(/\\d/g, '<digit>')
    .replace(/\\w/g, '<word>');
}

/** Build the grammar instruction text given the active phrase/regex lists. */
export function buildGrammarInstruction(
  phrases: ReadonlyArray<string>,
  regexes: ReadonlyArray<RegExp>,
): string {
  const phrasesPrompt = phrases.map((p) => `"${p}"`).join(', ');
  const regexesPrompt = regexes
    .map((re) => `/${regexToPromptShape(re)}/`)
    .join(', ');
  return `

---

## REQUIRED RETURN GRAMMAR — your response is structurally rejected if absent

Conclude your response with a block in this exact shape:

    Searched: <pattern> — <N matches>
    Included: <file:line>, <file:line>, ...
    Excluded: <file:line> — <one-line reason that is not a deferral>
              [, <file:line> — <reason>, ...]

  - **Searched:** the grep/search pattern that enumerates every instance
    of the class of thing you're fixing + total match count.
    Example: \`Searched: <pattern-name> — 7 matches\`
  - **Included:** file:line pairs your fix covers (comma-separated).
    Example: \`Included: src/foo.tsx:42, src/bar.tsx:117\`
  - **Excluded:** file:line pairs you intentionally did NOT cover, each
    with a one-line non-deferral reason.
    Example: \`Excluded: src/legacy.tsx:88 — different primitive (CodeMirror)\`

The wrapper rejects your return if:
  1. Any block is missing.
  2. Searched count > 1, Included covers exactly 1 match, Excluded empty
     (skipped same-class audit).
  3. Any Excluded reason contains a deferral phrase.

**FORBIDDEN deferral substrings in Excluded reasons** (case-insensitive):
${phrasesPrompt}.

**FORBIDDEN deferral regex shapes** (case-insensitive):
${regexesPrompt}.

"later" / "follow up" / "follow-up" as a deferral noun ("fix later",
"as a follow-up") are rejected; descriptive use ("later v2 of the API",
"a later-revision header") passes.

If you want to write "for now" or "TODO": STOP. Either include the
file:line in your fix, or write a permanent-exclusion reason (different
primitive, deprecated path being deleted, scoped differently, etc.).

### Gotchas — agent-natural writing vs. parser strictness

The parser has three known points where natural agent writing collides
with strict-format requirements. Read these before writing the block:

1. **Searched-count noun whitelist.** The count after the em-dash
   must end in one of: \`matches\`, \`match\`, \`hits\`, \`hit\`,
   \`occurrences\`, \`instances\`, \`sites\`, \`call sites\`,
   \`files\`, \`results\`, \`references\`, \`issues\`, \`bugs\`,
   \`findings\`, \`errors\`, \`warnings\`. Up to 3 modifier tokens
   are permitted before the head noun (e.g. \`2 source-emitter call
   sites\`, \`3 unique occurrences\`, \`5 issues found\`). Anything
   outside this set is rejected — \`7 places\`, \`4 spots\`,
   \`3 widgets\` all fail.

2. **Excluded entries require \`path:LINE\`.** Every Excluded
   citation must carry a line number. For whole-file exclusions
   (the exclusion is structural, not anchored to a specific line),
   use \`:1\` as the conventional sentinel and explain the whole-
   file nature in the reason:
       Excluded: test/dashboard.test.ts:1 — test-file references
       are assertions, not production code under review.
   Don't omit \`:LINE\`; the parser rejects.

3. **Forbidden-deferral phrase list — context-aware after Phase 14
   Task 2.** Ambiguous nouns (\`stub\`, \`placeholder\`, \`pending\`,
   \`temporary\`, \`hack\`, \`defer\`, \`deferred\`) NO LONGER trip on
   bare appearance — they require a deferral collocation:
   \`for now\`; \`until v#\` / \`until F#\` / \`until phase #\`;
   \`until we\` / \`until the next sprint|milestone|phase|release|
   version|cycle|iteration\`; \`in v#\` / \`in phase\` / \`in F#\` /
   \`in future\`; \`pending\`; \`later\`. Up to 2 modifier tokens may
   intervene between the noun and the collocation. The ALL-CAPS
   comment markers (\`TODO\`, \`FIXME\`, \`XXX\`) are case-sensitive
   — descriptive lowercase \`todo\` / \`fixme\` passes; the
   conventional comment-marker form still trips. The bare-defer
   verb (\`defer to\`) requires a version (\`v#\`), phase (\`F#\` /
   \`phase #\`), or \`the next <unit>\` target; \`defer to the
   operator\` / \`defer to the spec\` passes. Examples:
       PASS:  Excluded: src/input.tsx:42 — placeholder text shown
              until the user types in the input field
       PASS:  Excluded: src/swimlane-card.ts:330 — renderSwimStub
              is the focus-off compact button for filtered-out lanes
       PASS:  Excluded: src/util.ts:88 — architectural decision;
              defer to the spec for the canonical answer
       FAIL:  Excluded: src/input.tsx:42 — placeholder for now until
              the spec settles    ← contains the \`placeholder ... for now\` shape
       FAIL:  Excluded: src/util.ts:88 — defer to v2 release
                                       ← matches \`defer to v<digit>\`
   Bare deferral phrases (\`for now\`, \`will fix\`, etc.) still
   trip on substring; the relaxation is specifically for ambiguous
   nouns and the bare \`defer to\` verb.
`;
}

/** Text appended to every dispatched prompt with the default phrase/regex lists. */
export const GRAMMAR_INSTRUCTION = buildGrammarInstruction(
  FORBIDDEN_DEFERRAL_PHRASES,
  FORBIDDEN_DEFERRAL_REGEXES,
);

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  readonly phrases: ReadonlyArray<string>;
  readonly regexes: ReadonlyArray<RegExp>;
  readonly markers: ReadonlyArray<RegExp>;
}

async function resolveConfig(options: WrapOptions): Promise<ResolvedConfig> {
  const repoRoot = options.repoRoot ?? process.cwd();
  let phrases: ReadonlyArray<string> | undefined = options.forbiddenPhrases;
  let regexes: ReadonlyArray<RegExp> | undefined = options.forbiddenRegexes;
  let markers: ReadonlyArray<RegExp> | undefined = options.refactorMarkers;

  if (phrases === undefined || regexes === undefined) {
    const fromDisk = await loadForbiddenOverride(repoRoot);
    if (fromDisk !== null) {
      if (phrases === undefined) phrases = fromDisk.phrases;
      if (regexes === undefined) regexes = fromDisk.regexes;
    }
  }
  if (markers === undefined) {
    const fromDisk = await loadRefactorMarkersOverride(repoRoot);
    if (fromDisk !== null) markers = fromDisk;
  }
  return {
    phrases: phrases ?? FORBIDDEN_DEFERRAL_PHRASES,
    regexes: regexes ?? FORBIDDEN_DEFERRAL_REGEXES,
    markers: markers ?? REFACTOR_CONTEXT_MARKERS,
  };
}

export async function wrap(
  agentType: string,
  taskPrompt: string,
  options: WrapOptions,
): Promise<ParsedDispatchReturn> {
  const config = await resolveConfig(options);

  // Refactor-context prelude is appended ONLY when the task prompt
  // carries a refactor marker. On non-refactor dispatches the wrapper
  // stays silent on Step 0 — adding the prelude unconditionally would
  // dilute the signal and balloon every dispatch's prompt.
  const refactorPrelude = isRefactorContextPromptWith(taskPrompt, config.markers)
    ? REFACTOR_PRECONDITIONS_CHECKLIST
    : '';

  // Build a grammar instruction that names the ACTIVE phrase/regex
  // lists so the sub-agent sees exactly what will be enforced.
  const grammarInstruction =
    config.phrases === FORBIDDEN_DEFERRAL_PHRASES &&
    config.regexes === FORBIDDEN_DEFERRAL_REGEXES
      ? GRAMMAR_INSTRUCTION
      : buildGrammarInstruction(config.phrases, config.regexes);

  const augmentedPrompt = taskPrompt + grammarInstruction + refactorPrelude;
  const responseText = await options.dispatchFn({
    agentType,
    prompt: augmentedPrompt,
  });
  const parsed = parseReturn(responseText);
  const validateOptions: ValidateOptions = {
    forbiddenPhrases: config.phrases,
    forbiddenRegexes: config.regexes,
  };
  validateParsed(parsed, validateOptions);
  return parsed;
}

// Suppress lint complaints from unused default-marker matcher import.
void isRefactorContextPrompt;
