/**
 * plugins/dw-lifecycle/src/scope-discovery/synthesis-cli.ts
 *
 * CLI shell for the synthesis pass. Split out of synthesis.ts to keep
 * each file under the 300-500 line cap. The library API (`synthesize`)
 * lives in synthesis.ts; this module owns argv parsing, finding-from-
 * disk loading, notes-out markdown rendering, and the standalone `main`
 * that lets operators invoke `tsx synthesis-cli.ts ...` for diagnostics.
 *
 * Production path: the `scope-inventory` subcommand calls `synthesize()`
 * in-process; this CLI is for manual / smoke-test use only.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type {
  DiscoveryAgentFinding,
} from './discovery-agents/types.js';
import { isDiscoveryAgentFinding } from './discovery-agents/types.js';
import type { SynthesisOutput } from './synthesis-types.js';
import { synthesize } from './synthesis.js';
import {
  renderCategorySummaryLine,
  renderFindingCategoryReport,
} from './synthesis-report.js';
import { errorMessage } from './util/typeguards.js';

/**
 * Schema-aligned slug shape, kept literally in sync with the regex on
 * `feature_slug` in the manifest schema. Validating here, at CLI parse
 * time, surfaces a clear "bad input" error.
 */
const FEATURE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

const DEFAULT_MODULE_ROOT = 'src';

interface CliOptions {
  readonly featureSlug: string;
  readonly prdPath: string;
  readonly findingsPaths: ReadonlyArray<string>;
  readonly outPath: string | null;
  readonly notesOutPath: string | null;
  readonly repoRoot: string;
  readonly moduleRoot: string;
}

export function parseCli(argv: ReadonlyArray<string>): CliOptions {
  const scalars = new Map<string, string>();
  const findingsPaths: string[] = [];
  let mode: 'scalar' | 'findings' = 'scalar';
  const SCALAR_FLAGS = new Set([
    '--feature',
    '--prd-path',
    '--out',
    '--notes-out',
    '--repo-root',
    '--module-root',
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') throw new Error('HELP');
    if (a === '--findings') {
      mode = 'findings';
      continue;
    }
    if (a !== undefined && SCALAR_FLAGS.has(a)) {
      mode = 'scalar';
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} requires a value`);
      scalars.set(a, v);
      continue;
    }
    if (mode === 'findings' && a !== undefined && !a.startsWith('--')) {
      findingsPaths.push(a);
      continue;
    }
    throw new Error(`unknown or misplaced arg: ${a}`);
  }
  const featureSlug = scalars.get('--feature');
  const prdPath = scalars.get('--prd-path');
  if (featureSlug === undefined) throw new Error('--feature is required');
  if (!FEATURE_SLUG_REGEX.test(featureSlug)) {
    throw new Error(
      `--feature '${featureSlug}' is not a valid feature slug ` +
        '(must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ — lowercase alphanumeric ' +
        '+ dashes, no leading/trailing dash, min 2 chars)',
    );
  }
  if (prdPath === undefined) throw new Error('--prd-path is required');
  if (findingsPaths.length === 0) throw new Error('--findings requires at least one path');
  const root = resolve(scalars.get('--repo-root') ?? process.cwd());
  return {
    featureSlug,
    prdPath: isAbsolute(prdPath) ? prdPath : resolve(root, prdPath),
    findingsPaths,
    outPath: scalars.get('--out') ?? null,
    notesOutPath: scalars.get('--notes-out') ?? null,
    repoRoot: root,
    moduleRoot: scalars.get('--module-root') ?? DEFAULT_MODULE_ROOT,
  };
}

/**
 * Render the synthesizer's warnings as a markdown fragment whose
 * top-level heading matches the section name the scope-inventory
 * subcommand splices into `synthesis.md`. When `warnings` is empty,
 * the fragment STILL emits the heading with a "clean — no notes"
 * single-line body so the section's presence is invariant.
 */
export function renderSynthesizerNotes(warnings: ReadonlyArray<string>): string {
  const lines: string[] = ['## Synthesizer notes', ''];
  if (warnings.length === 0) {
    lines.push('clean — no notes from this run.');
  } else {
    // Multi-line warnings need continuation-line indentation so the
    // whole block renders as a single markdown bullet rather than
    // fragmenting. First line gets `- `; subsequent lines get two-space
    // indent; intentional blank lines inside the warning are preserved
    // without indent (so embedded markdown fences still parse).
    for (const w of warnings) {
      const wLines = w.split('\n');
      const [first, ...rest] = wLines;
      lines.push(`- ${first ?? ''}`);
      for (const cont of rest) {
        lines.push(cont === '' ? '' : `  ${cont}`);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

export async function loadFinding(path: string): Promise<DiscoveryAgentFinding> {
  const text = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (!isDiscoveryAgentFinding(parsed)) {
    throw new Error(`${path}: not a DiscoveryAgentFinding (missing/unknown agent tag)`);
  }
  return parsed;
}

const USAGE =
  'Usage: tsx plugins/dw-lifecycle/src/scope-discovery/synthesis-cli.ts \\\n' +
  '    --feature <slug> --prd-path <path-to-prd.md> \\\n' +
  '    --findings <path1> <path2> ... \\\n' +
  '    [--out <path>] [--notes-out <path>] \\\n' +
  '    [--repo-root <path>] [--module-root <path>]\n';

export async function main(argv: ReadonlyArray<string>): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    const msg = errorMessage(err);
    if (msg === 'HELP') {
      process.stderr.write(USAGE);
      return 0;
    }
    process.stderr.write(`synthesis: ${msg}\n${USAGE}`);
    return 2;
  }
  const findings: DiscoveryAgentFinding[] = [];
  for (const p of opts.findingsPaths) {
    try {
      findings.push(await loadFinding(p));
    } catch (err) {
      process.stderr.write(`synthesis: ${errorMessage(err)}\n`);
      return 1;
    }
  }
  let output: SynthesisOutput;
  try {
    output = await synthesize({
      featureSlug: opts.featureSlug,
      findings,
      prdPath: opts.prdPath,
      prdRelPath: relative(opts.repoRoot, opts.prdPath),
      moduleRoot: opts.moduleRoot,
    });
  } catch (err) {
    process.stderr.write(`synthesis: ${errorMessage(err)}\n`);
    return 1;
  }
  const yamlText = stringifyYaml(output.manifest);
  if (opts.outPath === null) {
    process.stdout.write(yamlText);
    return 0;
  }
  const abs = isAbsolute(opts.outPath) ? opts.outPath : resolve(opts.repoRoot, opts.outPath);
  try {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, yamlText, 'utf8');
  } catch (err) {
    process.stderr.write(`synthesis: write failed: ${errorMessage(err)}\n`);
    return 2;
  }
  process.stderr.write(
    `synthesis: wrote ${abs} (kind=${output.manifest.kind}, ` +
      `agents=${output.metadata.agentsConsumed.join('+')}, ` +
      `findings=${output.metadata.findingsCount}, ` +
      `dedup-savings=${output.metadata.dedupCount})\n`,
  );
  // surface the inventory-vs-discovery category
  // summary alongside the existing "wrote ..." line so the standalone
  // CLI matches the orchestrating scope-inventory subcommand's stderr
  // contract. The full breakdown lives in --notes-out.
  process.stderr.write(
    `synthesis: ${renderCategorySummaryLine(output.manifest)}\n`,
  );
  for (const w of output.metadata.warnings) {
    process.stderr.write(`synthesis: note: ${w}\n`);
  }
  if (opts.notesOutPath !== null) {
    const notesAbs = isAbsolute(opts.notesOutPath)
      ? opts.notesOutPath
      : resolve(opts.repoRoot, opts.notesOutPath);
    try {
      await mkdir(dirname(notesAbs), { recursive: true });
      // splice the inventory-vs-discovery category
      // report BEFORE the synthesizer notes so the operator's first read
      // of the notes file sees the category distinction.
      const categoryReport = renderFindingCategoryReport(output.manifest);
      const synthesizerNotes = renderSynthesizerNotes(output.metadata.warnings);
      await writeFile(
        notesAbs,
        `${categoryReport}\n${synthesizerNotes}`,
        'utf8',
      );
    } catch (err) {
      process.stderr.write(`synthesis: notes write failed: ${errorMessage(err)}\n`);
      return 2;
    }
  }
  return 0;
}

// CLI entry — fires when invoked directly via `tsx synthesis-cli.ts`.
if (
  process.argv[1] !== undefined &&
  process.argv[1].endsWith('synthesis-cli.ts')
) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`synthesis: unexpected failure: ${errorMessage(err)}\n`);
      process.exit(2);
    },
  );
}
