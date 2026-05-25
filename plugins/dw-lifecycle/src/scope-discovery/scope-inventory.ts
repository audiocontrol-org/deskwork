/**
 * plugins/dw-lifecycle/src/scope-discovery/scope-inventory.ts
 *
 * Library API for the `scope-inventory` subcommand. Fans the four
 * discovery agents in parallel, calls the synthesis pass in-process,
 * validates the strawman manifest against the schema, writes it to
 * disk plus per-agent JSON evidence files, and prints a summary.
 *
 * The subcommand entry (plugins/dw-lifecycle/src/subcommands/scope-inventory.ts)
 * is a thin shim that calls `scopeInventoryMain(argv)`.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { enumerateUiRoutes } from './discovery-agents/ui-route-enumerator.js';
import { buildPatternMatrix } from './discovery-agents/pattern-matrix.js';
import { readCloneDetectorOutput } from './discovery-agents/clone-detector-reader.js';
import { huntPrdThemes } from './discovery-agents/prd-themed-pattern-hunter.js';
import type {
  DiscoveryAgentFinding,
  DiscoveryAgentInput,
} from './discovery-agents/types.js';
import { synthesize } from './synthesis.js';
import { renderSynthesizerNotes } from './synthesis-cli.js';
import { errorMessage } from './util/typeguards.js';

const FEATURE_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const DEFAULT_MODULE_ROOT = 'src';

interface CliOptions {
  readonly featureSlug: string;
  readonly prdPath: string;
  readonly outPath: string;
  readonly repoRoot: string;
  readonly moduleRoot: string;
  readonly evidenceTrail: boolean;
  readonly quiet: boolean;
}

function parseCli(argv: ReadonlyArray<string>): CliOptions {
  const scalars = new Map<string, string>();
  const SCALAR_FLAGS = new Set([
    '--slug',
    '--out',
    '--prd-path',
    '--repo-root',
    '--module-root',
    '--evidence-trail',
  ]);
  let quiet = false;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') throw new Error('HELP');
    if (a === '--quiet') {
      quiet = true;
      continue;
    }
    if (a !== undefined && SCALAR_FLAGS.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} requires a value`);
      scalars.set(a, v);
      continue;
    }
    throw new Error(`unknown arg: ${a}`);
  }
  const slug = scalars.get('--slug');
  if (slug === undefined) throw new Error('--slug is required');
  if (!FEATURE_SLUG_REGEX.test(slug)) {
    throw new Error(
      `--slug '${slug}' is not a valid feature slug ` +
        '(must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ — lowercase alphanumeric ' +
        '+ dashes, no leading/trailing dash, min 2 chars)',
    );
  }
  const root = resolve(scalars.get('--repo-root') ?? process.cwd());
  const prdPathRaw =
    scalars.get('--prd-path') ?? `docs/1.0/001-IN-PROGRESS/${slug}/prd.md`;
  const prdPath = isAbsolute(prdPathRaw) ? prdPathRaw : resolve(root, prdPathRaw);
  const outPathRaw =
    scalars.get('--out') ?? `docs/1.0/001-IN-PROGRESS/${slug}/scope-manifest.yaml`;
  const outPath = isAbsolute(outPathRaw) ? outPathRaw : resolve(root, outPathRaw);
  const evidenceFlag = scalars.get('--evidence-trail') ?? 'on';
  if (evidenceFlag !== 'on' && evidenceFlag !== 'off') {
    throw new Error(`--evidence-trail must be 'on' or 'off' (got '${evidenceFlag}')`);
  }
  return {
    featureSlug: slug,
    prdPath,
    outPath,
    repoRoot: root,
    moduleRoot: scalars.get('--module-root') ?? DEFAULT_MODULE_ROOT,
    evidenceTrail: evidenceFlag === 'on',
    quiet,
  };
}

const USAGE =
  'Usage: dw-lifecycle scope-inventory \\\n' +
  '    --slug <feature-slug> \\\n' +
  '    [--out <manifest-path>] \\\n' +
  '    [--prd-path <prd-path>] \\\n' +
  '    [--repo-root <repo-root>] \\\n' +
  '    [--module-root <module-root>] \\\n' +
  '    [--evidence-trail on|off] \\\n' +
  '    [--quiet]\n';

/**
 * Allocate a per-run evidence directory at
 *   docs/<v>/001-IN-PROGRESS/<slug>/scope-inventory/runs/<stamp>-<runId>/
 *
 * Stamp is ISO-8601 truncated to second + `Z`; runId is 6 hex chars
 * (3 random bytes) so concurrent runs don't collide on the same
 * stamp.
 */
function makeRunDir(opts: { repoRoot: string; featureSlug: string }): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const runId = randomBytes(3).toString('hex');
  return resolve(
    opts.repoRoot,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    opts.featureSlug,
    'scope-inventory',
    'runs',
    `${now}-${runId}`,
  );
}

interface AgentRun {
  readonly name: string;
  readonly finding: DiscoveryAgentFinding;
}

/**
 * Fan the four discovery agents in parallel against the shared input
 * contract. Each agent's result is collected as `{ name, finding }`
 * so the caller can write per-agent JSON to the evidence trail with
 * a stable filename.
 */
async function runAgents(input: DiscoveryAgentInput): Promise<ReadonlyArray<AgentRun>> {
  const [ui, patterns, clones, themes] = await Promise.all([
    enumerateUiRoutes(input),
    buildPatternMatrix(input),
    readCloneDetectorOutput(input).catch((err: unknown) => {
      // Clone-detector reader fails LOUD when the baseline is missing.
      // For a first-time `scope-inventory` run on a project that hasn't
      // produced a clones.yaml yet, that's expected — surface the failure
      // mode at the orchestrator level with an actionable hint rather
      // than swallowing it (which would mask packaging defects per
      // Audit-2026-05-25 Finding 02).
      throw new Error(
        `clone-detector-reader failed: ${errorMessage(err)}\n` +
          'Generate the baseline first: dw-lifecycle detect-clones --refresh-baseline',
      );
    }),
    huntPrdThemes(input),
  ]);
  return [
    { name: 'ui-route-enumerator', finding: ui },
    { name: 'pattern-matrix', finding: patterns },
    { name: 'clone-detector-reader', finding: clones },
    { name: 'prd-themed-pattern-hunter', finding: themes },
  ];
}

async function writeEvidenceTrail(args: {
  readonly runDir: string;
  readonly agents: ReadonlyArray<AgentRun>;
  readonly notes: string;
  readonly args: CliOptions;
}): Promise<void> {
  await mkdir(args.runDir, { recursive: true });
  for (const run of args.agents) {
    const p = resolve(args.runDir, `${run.name}.json`);
    await writeFile(p, `${JSON.stringify(run.finding, null, 2)}\n`, 'utf8');
  }
  // Synthesizer notes per the audit-log convention.
  await writeFile(resolve(args.runDir, 'synthesis.md'), args.notes, 'utf8');
  // Reproducibility record: the CLI args that produced this run.
  await writeFile(
    resolve(args.runDir, 'args.json'),
    `${JSON.stringify(args.args, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Public entry point. Returns the numeric exit code; callers
 * (subcommand shim) translate to `process.exit`.
 *
 * Exit codes:
 *   0 — success (manifest written + validated)
 *   1 — manifest fails schema (existing manifest validation failure)
 *   2 — infra error (CLI parse, write, agent invocation, missing PRD)
 */
export async function scopeInventoryMain(
  argv: ReadonlyArray<string>,
): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    const msg = errorMessage(err);
    if (msg === 'HELP') {
      process.stderr.write(USAGE);
      return 0;
    }
    process.stderr.write(`scope-inventory: ${msg}\n${USAGE}`);
    return 2;
  }

  const input: DiscoveryAgentInput = {
    featureSlug: opts.featureSlug,
    prdPath: opts.prdPath,
    repoRoot: opts.repoRoot,
    moduleRoot: opts.moduleRoot,
  };

  let agents: ReadonlyArray<AgentRun>;
  try {
    agents = await runAgents(input);
  } catch (err) {
    process.stderr.write(`scope-inventory: ${errorMessage(err)}\n`);
    return 2;
  }

  try {
    const output = await synthesize({
      featureSlug: opts.featureSlug,
      findings: agents.map((a) => a.finding),
      prdPath: opts.prdPath,
      prdRelPath: relative(opts.repoRoot, opts.prdPath),
      moduleRoot: opts.moduleRoot,
    });
    // Validation happened inside synthesize(); if we got here, the
    // manifest is schema-valid. Write the YAML to --out.
    const yamlText = stringifyYaml(output.manifest);
    await mkdir(dirname(opts.outPath), { recursive: true });
    await writeFile(opts.outPath, yamlText, 'utf8');

    // Evidence trail (optional).
    if (opts.evidenceTrail) {
      const runDir = makeRunDir({
        repoRoot: opts.repoRoot,
        featureSlug: opts.featureSlug,
      });
      const notes = renderSynthesizerNotes(output.metadata.warnings);
      await writeEvidenceTrail({ runDir, agents, notes, args: opts });
      if (!opts.quiet) {
        process.stderr.write(
          `scope-inventory: evidence trail at ${relative(opts.repoRoot, runDir)}/\n`,
        );
      }
    }

    if (!opts.quiet) {
      process.stderr.write(
        `scope-inventory: wrote ${relative(opts.repoRoot, opts.outPath)} ` +
          `(kind=${output.manifest.kind}, agents=${agents.length}, ` +
          `findings=${output.metadata.findingsCount}, ` +
          `warnings=${output.metadata.warnings.length})\n`,
      );
      for (const w of output.metadata.warnings) {
        process.stderr.write(`scope-inventory: note: ${w}\n`);
      }
    }
    return 0;
  } catch (err) {
    const msg = errorMessage(err);
    // Schema validation failures are signaled by the synthesis layer
    // throwing with a "fails the manifest schema" prefix; map to exit 1
    // (vs. infra failure exit 2) so the caller can distinguish them.
    if (msg.includes('fails the manifest schema')) {
      process.stderr.write(`scope-inventory: ${msg}\n`);
      return 1;
    }
    process.stderr.write(`scope-inventory: ${msg}\n`);
    return 2;
  }
}
