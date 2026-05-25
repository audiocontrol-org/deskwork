/**
 * plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-matrix.ts
 *
 * Discovery Agent 2 — pattern matrix builder.
 *
 * Renamed from `ast-grep-matrix.ts` (the pilot's name) because the
 * agent does NOT shell out to the `ast-grep` binary — it uses pure-JS
 * line-grep with carefully-tuned regexes. The misleading file name has
 * been fixed; the runtime discriminator stays `'ast-grep-matrix'` for
 * JSON wire-format stability.
 *
 * What it does: walks the configured module-root for `.ts`/`.tsx`
 * files and produces a matrix of `{ pattern, file:line }` for a
 * curated set of cross-cutting CLAUDE.md violations:
 *
 *   - as-type-cast            — `as <TypeName>` casts
 *   - any-annotation          — `: any` type annotations
 *   - ts-ignore-pragma        — `@ts-ignore` / `@ts-expect-error`
 *   - magic-number            — inline numeric literals not bound to const/named (heuristic)
 *
 * The audiocontrol-specific `ac-class-consumer` pattern has been
 * dropped (it's a `className="ac-*"` consumer scan tied to one
 * project's CSS prefix).
 *
 * Project override: when
 * `.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml` exists,
 * its `patterns:` list REPLACES the built-in catalog (no merge — the
 * project owns the catalog). The schema is documented at
 * `plugins/dw-lifecycle/src/scope-discovery/schema/pattern-matrix-patterns.yaml.schema.json`.
 *
 * Engine choice: line-grep with carefully-tuned regexes. A true AST
 * walk (via the `typescript` compiler API or `ts-morph`) would catch
 * fewer false-positives on the `magic-number` rule, but the cost is a
 * new dependency, ~10× the wall-clock, and significantly more code.
 * Line-grep produces usable signal at low cost — the synthesis layer +
 * operator curation prunes false positives.
 *
 * CLI:
 *   tsx plugins/dw-lifecycle/src/scope-discovery/discovery-agents/pattern-matrix.ts \
 *     --feature <slug> --prd-path <path> [--repo-root <path>] [--module-root <path>]
 */

import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type {
  AstGrepMatrixFindings,
  DiscoveryAgentInput,
  PatternFinding,
  PatternHit,
} from './types.js';
import {
  type SourceFileView,
  getModuleRoot,
  isDirectory,
  modulesInScopeForFeature,
  readSourceFile,
  repoAbs,
  runIfMain,
  walkSourceFiles,
} from './shared.js';
import { errorMessage, isEnoent, isPlainObject } from '../util/typeguards.js';

/**
 * Built-in pattern catalog. Each entry has a stable kebab-case `id`
 * surfaced verbatim in the agent's output so the synthesis layer can
 * address patterns by identity.
 *
 * The regexes are intentionally conservative — the synthesis layer
 * deduplicates and ranks; false positives at this layer are cheaper
 * than false negatives.
 */
interface PatternDef {
  readonly id: string;
  readonly description: string;
  readonly regex: RegExp;
  readonly extensions?: ReadonlyArray<string>;
}

const BUILTIN_PATTERNS: ReadonlyArray<PatternDef> = [
  {
    id: 'as-type-cast',
    description: '`as <TypeName>` cast (banned per CLAUDE.md "never bypass typing")',
    // Match `as <PascalCase>` not followed by a comparison/word char.
    // Excludes `as const` (legal narrowing) and `as unknown` (allowed bridge).
    regex: /\bas\s+(?!const\b|unknown\b)[A-Z][A-Za-z0-9_]*/g,
  },
  {
    id: 'any-annotation',
    description: '`: any` type annotation (banned per CLAUDE.md)',
    // Match `: any` followed by terminator. Tolerates `Array<any>` etc.
    regex: /:\s*any\b(?![A-Za-z0-9_])/g,
  },
  {
    id: 'ts-ignore-pragma',
    description: '`@ts-ignore` or `@ts-expect-error` (banned per CLAUDE.md)',
    regex: /@ts-(?:ignore|expect-error)\b/g,
  },
  {
    id: 'magic-number',
    description:
      'Inline numeric literal >= 10 not bound to a const/named identifier (heuristic — synthesis layer + operator curate)',
    // Match a numeric literal that is NOT preceded by `=` (i.e., NOT a
    // binding). We can't robustly detect strings/comments without an AST,
    // so this regex surfaces candidates and the operator prunes. We
    // require >= 2 digits to skip the noisiest cases.
    regex: /(?<![A-Za-z0-9_.=])\d{2,}\b/g,
  },
];

const OVERRIDE_PATH = '.dw-lifecycle/scope-discovery/pattern-matrix-patterns.yaml';

/**
 * Load the project-supplied override list when present. Returns null
 * when the override file doesn't exist (use built-ins). Throws on
 * malformed override files — no silent fallback.
 */
async function loadOverridePatterns(
  repoRoot: string,
): Promise<ReadonlyArray<PatternDef> | null> {
  const absPath = resolve(repoRoot, OVERRIDE_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new Error(`pattern-matrix: cannot read override ${absPath}: ${errorMessage(err)}`);
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(`pattern-matrix: cannot parse override ${absPath}: ${errorMessage(err)}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`pattern-matrix: override ${absPath} did not parse to a YAML object`);
  }
  const patterns = parsed['patterns'];
  if (!Array.isArray(patterns)) {
    throw new Error(`pattern-matrix: override ${absPath} missing required 'patterns:' list`);
  }
  const out: PatternDef[] = [];
  patterns.forEach((raw: unknown, idx: number) => {
    if (!isPlainObject(raw)) {
      throw new Error(`pattern-matrix: override ${absPath} patterns[${idx}] is not an object`);
    }
    const id = raw['id'];
    const description = raw['description'];
    const regexSrc = raw['regex'];
    const extensions = raw['extensions'];
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(`pattern-matrix: override ${absPath} patterns[${idx}].id missing or non-string`);
    }
    if (typeof description !== 'string' || description.length === 0) {
      throw new Error(`pattern-matrix: override ${absPath} patterns[${idx}].description missing or non-string`);
    }
    if (typeof regexSrc !== 'string' || regexSrc.length === 0) {
      throw new Error(`pattern-matrix: override ${absPath} patterns[${idx}].regex missing or non-string`);
    }
    let regex: RegExp;
    try {
      regex = new RegExp(regexSrc, 'g');
    } catch (err) {
      throw new Error(
        `pattern-matrix: override ${absPath} patterns[${idx}].regex is not a valid RegExp: ${errorMessage(err)}`,
      );
    }
    const extArr =
      extensions === undefined
        ? undefined
        : Array.isArray(extensions)
          ? extensions.map((e: unknown, ei: number) => {
              if (typeof e !== 'string' || !e.startsWith('.')) {
                throw new Error(
                  `pattern-matrix: override ${absPath} patterns[${idx}].extensions[${ei}] must be a dot-prefixed string`,
                );
              }
              return e;
            })
          : (() => {
              throw new Error(
                `pattern-matrix: override ${absPath} patterns[${idx}].extensions must be an array when set`,
              );
            })();
    out.push({
      id,
      description,
      regex,
      ...(extArr !== undefined ? { extensions: extArr } : {}),
    });
  });
  if (out.length === 0) {
    throw new Error(`pattern-matrix: override ${absPath} produced zero patterns (must have at least one)`);
  }
  return out;
}

const SNIPPET_MAX_LEN = 200;

function snippet(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= SNIPPET_MAX_LEN) return trimmed;
  return `${trimmed.slice(0, SNIPPET_MAX_LEN - 3)}...`;
}

function applyPattern(args: {
  readonly pattern: PatternDef;
  readonly scans: ReadonlyArray<SourceFileView>;
}): PatternFinding {
  const hits: PatternHit[] = [];
  for (const scan of args.scans) {
    if (
      args.pattern.extensions !== undefined &&
      !args.pattern.extensions.some((e) => scan.file.toLowerCase().endsWith(e))
    ) {
      continue;
    }
    for (let i = 0; i < scan.lines.length; i += 1) {
      const line = scan.lines[i];
      if (line === undefined) continue;
      const re = new RegExp(args.pattern.regex.source, args.pattern.regex.flags);
      if (re.test(line)) {
        hits.push({
          file: scan.file,
          line: i + 1,
          snippet: snippet(line),
        });
      }
    }
  }
  return {
    id: args.pattern.id,
    description: args.pattern.description,
    regex: args.pattern.regex.source,
    hits,
  };
}

async function gatherInScopeFiles(
  input: DiscoveryAgentInput,
): Promise<ReadonlyArray<string>> {
  const modulesInScope = await modulesInScopeForFeature(input);
  const collected: string[] = [];
  for (const module of modulesInScope) {
    // Single-package degradation: walk the module-root directly when
    // the module marker is '.'.
    const modSrc =
      module === '.'
        ? getModuleRoot(input)
        : repoAbs(input.repoRoot, join(input.moduleRoot, module));
    if (!(await isDirectory(modSrc))) continue;
    const files = await walkSourceFiles({
      rootAbs: modSrc,
      repoRoot: input.repoRoot,
    });
    for (const f of files) collected.push(f);
  }
  return collected.sort();
}

/**
 * Public agent entrypoint. Imported by the synthesis layer + the
 * `scope-inventory` subcommand.
 */
export async function buildPatternMatrix(
  input: DiscoveryAgentInput,
): Promise<AstGrepMatrixFindings> {
  const override = await loadOverridePatterns(input.repoRoot);
  const patterns: ReadonlyArray<PatternDef> = override ?? BUILTIN_PATTERNS;
  const files = await gatherInScopeFiles(input);
  const scans: SourceFileView[] = [];
  for (const f of files) {
    scans.push(await readSourceFile({ repoRoot: input.repoRoot, relFile: f }));
  }
  const findings: PatternFinding[] = [];
  for (const pat of patterns) {
    findings.push(applyPattern({ pattern: pat, scans }));
  }
  return {
    // Discriminator kept verbatim for JSON wire-format stability with
    // the pilot — the file was renamed but the runtime tag is invariant.
    agent: 'ast-grep-matrix',
    featureSlug: input.featureSlug,
    patterns: findings,
  };
}

runIfMain({
  importMetaUrl: import.meta.url,
  agentName: 'pattern-matrix',
  run: async (input) => {
    try {
      return await buildPatternMatrix(input);
    } catch (err) {
      throw new Error(`pattern-matrix failed: ${errorMessage(err)}`);
    }
  },
});
