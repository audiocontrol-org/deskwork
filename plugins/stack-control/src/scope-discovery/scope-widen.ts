/**
 * plugins/stack-control/src/scope-discovery/scope-widen.ts
 *
 * Library API + CLI shell for the `scope-widen` subcommand. The verb
 * takes a free-text operator complaint mid-implementation, re-runs the
 * four universal discovery agents against the augmented PRD (original
 * PRD body + complaint appended), compares the new manifest against the
 * prior one on disk, and surfaces additions (NEW surfaces the
 * operator's complaint exposed that the original inventory missed).
 *
 * Default behavior is DRY-RUN. The complaint is appended to the PRD
 * body as a synthetic `## Operator complaint (scope-widen)` section
 * (the on-disk PRD is never modified) so the PRD-themed pattern hunter
 * tokenizes the complaint alongside the PRD body — operator words
 * become themed keywords without bespoke parsing. Smarter complaint
 * parsing is deferred to the orchestrator loop's orchestrator-agent work; v1 is
 * plumbing. Evidence trail lands under `widen-runs/<stamp>-<runId>/`
 * (sibling to scope-inventory's `runs/`) and contains the complaint,
 * the augmented PRD, per-agent JSONs, the synthesizer notes, the
 * delta, the new manifest, and the CLI args.
 *
 * Pure delta-computation + merge logic lives in scope-widen-delta.ts;
 * this file owns the CLI parsing, agent fan-out, and disk I/O.
 *
 * See plugins/dw-lifecycle/skills/scope-widen/SKILL.md for the
 * operator-facing procedure, flags, error-handling, and when-to-use
 * narrative.
 *
 * Exit codes:
 *   0 — success (delta computed; manifest updated if --apply)
 *   1 — schema validation failure on the re-synthesized manifest
 *   2 — infra error (CLI parse, missing manifest/PRD, agent failure)
 */

import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { DEFAULT_BASELINE_REL } from './baseline-path.js';
import { install as installScopeDiscovery } from './install-scope-discovery.js';
import { resolveFeatureRoot } from './util/feature-root.js';
import { buildPatternMatrix } from './discovery-agents/pattern-matrix.js';
import { readCloneDetectorOutput } from './discovery-agents/clone-detector-reader.js';
import { huntPrdThemes } from './discovery-agents/prd-themed-pattern-hunter.js';
import { enumerateUiRoutes } from './discovery-agents/ui-route-enumerator.js';
import type {
  DiscoveryAgentFinding,
  DiscoveryAgentInput,
} from './discovery-agents/types.js';
import {
  compileManifestValidator,
  validateManifest,
} from './schema/manifest-validator.js';
import { type CliOptions, USAGE, parseCli } from './scope-widen-cli.js';
import {
  computeDelta,
  formatDelta,
  isScopeManifestShape,
  mergeDelta,
} from './scope-widen-delta.js';
import { synthesize } from './synthesis.js';
import { renderSynthesizerNotes } from './synthesis-cli.js';
import {
  renderCategorySummaryLine,
  renderFindingCategoryReport,
} from './synthesis-report.js';
import type { ScopeManifest } from './synthesis-types.js';
import { errorMessage } from './util/typeguards.js';

// Re-export the delta-side public surface so callers (tests, future
// orchestrators) can import everything from the canonical
// `scope-widen.ts` entry without learning the internal file split.
export { computeDelta, mergeDelta } from './scope-widen-delta.js';
export type { ScopeWidenDelta } from './scope-widen-delta.js';

/**
 * Compute the per-run evidence directory under `widen-runs/` (sibling
 * to scope-inventory's `runs/`), under the layout-resolved feature
 * root (specs/014 US7 — the gh-442 instance recreated a `docs/` tree
 * for evidence when the feature lived under `specs/`). Stamp is
 * ISO-8601 truncated to second + `Z`; runId is 6 hex chars so
 * concurrent runs don't collide.
 */
function makeRunDir(opts: { featureRoot: string }): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const runId = randomBytes(3).toString('hex');
  return resolve(
    opts.featureRoot,
    'scope-inventory',
    'widen-runs',
    `${now}-${runId}`,
  );
}

/**
 * Read + parse the prior manifest from disk. Throws a descriptive error
 * (no fallback) when the file is missing or malformed — scope-widen
 * cannot delta against an absent baseline.
 *
 * The parsed value is validated against the manifest schema before
 * being returned. Validation produces a typed `ScopeManifest` via the
 * structural typeguard — no `as` cast.
 */
async function loadPriorManifest(path: string): Promise<ScopeManifest> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (err) {
    throw new Error(
      `cannot read prior manifest at ${path}: ${errorMessage(err)}\n` +
        'Run `stackctl scope-inventory --slug <slug>` first to ' +
        'produce a baseline manifest, then re-run scope-widen.',
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `failed to parse prior manifest YAML at ${path}: ${errorMessage(err)}`,
    );
  }
  const validator = await compileManifestValidator();
  const result = validateManifest(parsed, validator);
  if (!result.ok) {
    throw new Error(
      `prior manifest at ${path} fails the manifest schema:\n  - ` +
        result.errors.join('\n  - '),
    );
  }
  if (!isScopeManifestShape(parsed)) {
    // Defense in depth — schema validation should already guarantee the
    // shape, but the typeguard makes the TS narrowing explicit + audits
    // any fields the schema asserts but the typeguard misses (which
    // would surface as a runtime error, not silent acceptance).
    throw new Error(
      `prior manifest at ${path} passed schema validation but failed ` +
        'the structural typeguard (schema/typeguard drift — please file a bug)',
    );
  }
  return parsed;
}

/**
 * Write the augmented PRD (original + complaint section) to the per-
 * run evidence directory. Returns the absolute path so the agents can
 * read it. The original PRD on disk is never modified.
 */
async function writeAugmentedPrd(args: {
  readonly runDir: string;
  readonly prdPath: string;
  readonly complaint: string;
}): Promise<string> {
  let prdText: string;
  try {
    prdText = await readFile(args.prdPath, 'utf8');
  } catch (err) {
    throw new Error(`cannot read PRD at ${args.prdPath}: ${errorMessage(err)}`);
  }
  const trimmed = prdText.endsWith('\n') ? prdText : prdText + '\n';
  const augmented =
    trimmed +
    '\n## Operator complaint (scope-widen)\n\n' +
    args.complaint.trim() +
    '\n';
  await mkdir(args.runDir, { recursive: true });
  const out = resolve(args.runDir, 'augmented-prd.md');
  await writeFile(out, augmented, 'utf8');
  return out;
}

interface AgentRun {
  readonly name: string;
  readonly finding: DiscoveryAgentFinding;
}

/**
 * Re-run the four universal discovery agents against the augmented
 * PRD. Phase 4 config-activated agents are intentionally NOT re-run by
 * scope-widen in v1 — they read registries on disk, not the PRD, so
 * the operator's complaint can't sharpen their signal. (When v1.1
 * lands richer complaint parsing, we'll revisit.)
 */
async function runUniversalAgents(
  input: DiscoveryAgentInput,
): Promise<ReadonlyArray<AgentRun>> {
  const ui = enumerateUiRoutes(input).then((f) => ({
    name: 'ui-route-enumerator',
    finding: f,
  }));
  const matrix = buildPatternMatrix(input).then((f) => ({
    name: 'pattern-matrix',
    finding: f,
  }));
  const clones = readCloneDetectorOutput(input)
    .catch((err: unknown) => {
      throw new Error(
        `clone-detector-reader failed: ${errorMessage(err)}\n` +
          'Generate the baseline first: stackctl check-clones --refresh-baseline',
      );
    })
    .then((f) => ({ name: 'clone-detector-reader', finding: f }));
  const themes = huntPrdThemes(input).then((f) => ({
    name: 'prd-themed-pattern-hunter',
    finding: f,
  }));
  return Promise.all([ui, matrix, clones, themes]);
}

interface RunArtifacts {
  readonly runDir: string;
  readonly augmentedPrdPath: string;
  readonly agents: ReadonlyArray<AgentRun>;
}

/**
 * Stage the per-run evidence directory: create the dir, write the
 * augmented PRD, run the four universal agents in parallel. Returns
 * the absolute run-dir + the agent results so the orchestrator can
 * proceed to synthesis + delta + write.
 */
async function stageRun(
  opts: CliOptions,
  prdPath: string,
  featureRoot: string,
): Promise<RunArtifacts> {
  const runDir = makeRunDir({ featureRoot });
  const augmentedPrdPath = await writeAugmentedPrd({
    runDir,
    prdPath,
    complaint: opts.complaint,
  });
  const input: DiscoveryAgentInput = {
    featureSlug: opts.featureSlug,
    prdPath: augmentedPrdPath,
    repoRoot: opts.repoRoot,
    moduleRoot: opts.moduleRoot,
  };
  const agents = await runUniversalAgents(input);
  return { runDir, augmentedPrdPath, agents };
}

/**
 * Public entry point. Returns the numeric exit code; subcommand shim
 * translates to process.exit.
 */
export async function scopeWidenMain(
  argv: ReadonlyArray<string>,
): Promise<number> {
  let opts: CliOptions;
  try {
    opts = parseCli(argv);
  } catch (err) {
    const msg = errorMessage(err);
    if (msg === 'HELP') {
      process.stdout.write(USAGE);
      return 0;
    }
    process.stderr.write(`scope-widen: ${msg}\n${USAGE}`);
    return 2;
  }

  // specs/014 US7: resolve the feature root layout-aware (specs/NNN-slug
  // or legacy docs) — it anchors the default --manifest/--prd-path AND
  // the widen-run evidence dirs, even when explicit paths were given
  // (the gh-442 instance recreated a docs/ tree for evidence).
  let featureRoot: string;
  try {
    const resolved = await resolveFeatureRoot({
      repoRoot: opts.repoRoot,
      slug: opts.featureSlug,
    });
    if (resolved.root === undefined) {
      process.stderr.write(
        `scope-widen: FATAL — feature '${opts.featureSlug}' not found under ` +
          `${resolve(opts.repoRoot, 'specs')}/<NNN>-${opts.featureSlug} (speckit) or ` +
          `${resolve(opts.repoRoot, 'docs')}/*/001-IN-PROGRESS/${opts.featureSlug} (legacy-docs).\n`,
      );
      return 2;
    }
    featureRoot = resolved.root;
  } catch (err) {
    process.stderr.write(`scope-widen: ${errorMessage(err)}\n`);
    return 2;
  }
  const manifestPath =
    opts.manifestPath ?? resolve(featureRoot, 'scope-manifest.yaml');
  const prdPath = opts.prdPath ?? resolve(featureRoot, 'prd.md');

  let prior: ScopeManifest;
  try {
    prior = await loadPriorManifest(manifestPath);
  } catch (err) {
    process.stderr.write(`scope-widen: ${errorMessage(err)}\n`);
    return 2;
  }

  // specs/014 US6 (FR-009, Clarification 2026-06-11): a missing clone
  // baseline must not hard-abort the widen — the complaint-driven arms
  // need no baseline at all. Auto-seed the missing scope-discovery
  // state via the install-scope-discovery primitive (ANNOUNCED — this
  // is state creation, not a silent fallback); the seeded clones.yaml
  // is a legitimate empty baseline, so the clone arm's "no registered
  // clones" over it is a true result. Post-seed genuine clone failures
  // keep clone-detector-reader's own loud remediation.
  if (!existsSync(resolve(opts.repoRoot, DEFAULT_BASELINE_REL))) {
    process.stderr.write(
      'scope-widen: scope-discovery state absent — seeding .stack-control/scope-discovery/ (first use)\n',
    );
    try {
      installScopeDiscovery({
        startDir: opts.repoRoot,
        at: opts.repoRoot,
        force: false,
        dryRun: false,
      });
    } catch (err) {
      process.stderr.write(
        `scope-widen: auto-seed of scope-discovery state failed: ${errorMessage(err)}\n`,
      );
      return 2;
    }
  }

  let staged: RunArtifacts;
  try {
    staged = await stageRun(opts, prdPath, featureRoot);
  } catch (err) {
    process.stderr.write(`scope-widen: ${errorMessage(err)}\n`);
    return 2;
  }

  let nextManifest: ScopeManifest;
  let synthesisWarnings: ReadonlyArray<string>;
  try {
    const out = await synthesize({
      featureSlug: opts.featureSlug,
      findings: staged.agents.map((a) => a.finding),
      prdPath: staged.augmentedPrdPath,
      prdRelPath: relative(opts.repoRoot, staged.augmentedPrdPath),
      moduleRoot: opts.moduleRoot,
      repoRoot: opts.repoRoot,
    });
    nextManifest = out.manifest;
    synthesisWarnings = out.metadata.warnings;
  } catch (err) {
    const msg = errorMessage(err);
    if (msg.includes('fails the manifest schema')) {
      process.stderr.write(`scope-widen: ${msg}\n`);
      return 1;
    }
    process.stderr.write(`scope-widen: ${msg}\n`);
    return 2;
  }

  const delta = computeDelta(prior, nextManifest);

  try {
    await persistEvidence({
      opts,
      runDir: staged.runDir,
      agents: staged.agents,
      synthesisWarnings,
      delta,
      nextManifest,
    });
  } catch (err) {
    process.stderr.write(
      `scope-widen: evidence-trail write failed: ${errorMessage(err)}\n`,
    );
    return 2;
  }

  if (!opts.quiet) {
    process.stderr.write(formatDelta(delta) + '\n');
    // surface the inventory-vs-discovery category
    // summary for the re-synthesized manifest. The full category
    // breakdown lives in the per-run synthesis.md.
    process.stderr.write(
      `scope-widen: next-manifest ${renderCategorySummaryLine(nextManifest)}\n`,
    );
    process.stderr.write(
      `scope-widen: evidence at ${relative(opts.repoRoot, staged.runDir)}/\n`,
    );
  }

  if (opts.apply) {
    return applyMergedManifest(opts, manifestPath, prior, delta);
  }
  if (!opts.quiet && delta.total > 0) {
    process.stderr.write(
      'scope-widen: dry-run (manifest unchanged); pass --apply to merge.\n',
    );
  }
  return 0;
}

/**
 * Persist the per-run evidence. `complaint.txt` + `delta.json` +
 * `args.json` always land so the operator can re-trace which complaint
 * produced which delta even when they opted out of the full trail. The
 * per-agent JSONs + `synthesis.md` + `new-manifest.yaml` only land
 * when `--evidence-trail` is `on` (default).
 */
async function persistEvidence(args: {
  readonly opts: CliOptions;
  readonly runDir: string;
  readonly agents: ReadonlyArray<AgentRun>;
  readonly synthesisWarnings: ReadonlyArray<string>;
  readonly delta: ReturnType<typeof computeDelta>;
  readonly nextManifest: ScopeManifest;
}): Promise<void> {
  const { opts, runDir, agents, synthesisWarnings, delta, nextManifest } = args;
  await writeFile(
    resolve(runDir, 'complaint.txt'),
    opts.complaint + '\n',
    'utf8',
  );
  await writeFile(
    resolve(runDir, 'delta.json'),
    JSON.stringify(delta, null, 2) + '\n',
    'utf8',
  );
  await writeFile(
    resolve(runDir, 'args.json'),
    JSON.stringify(opts, null, 2) + '\n',
    'utf8',
  );
  if (!opts.evidenceTrail) return;
  for (const run of agents) {
    await writeFile(
      resolve(runDir, `${run.name}.json`),
      JSON.stringify(run.finding, null, 2) + '\n',
      'utf8',
    );
  }
  // splice the inventory-vs-discovery category
  // report BEFORE the synthesizer notes in scope-widen's per-run
  // synthesis.md so the operator's first read of the file sees the
  // category split BEFORE the synthesizer warnings.
  const categoryReport = renderFindingCategoryReport(nextManifest);
  const synthesizerNotes = renderSynthesizerNotes(synthesisWarnings);
  await writeFile(
    resolve(runDir, 'synthesis.md'),
    `${categoryReport}\n${synthesizerNotes}`,
    'utf8',
  );
  await writeFile(
    resolve(runDir, 'new-manifest.yaml'),
    stringifyYaml(nextManifest),
    'utf8',
  );
}

/**
 * Apply the delta by merging into the prior manifest and writing back
 * to disk. Returns the exit code for the caller.
 */
async function applyMergedManifest(
  opts: CliOptions,
  manifestPath: string,
  prior: ScopeManifest,
  delta: ReturnType<typeof computeDelta>,
): Promise<number> {
  if (delta.total === 0) {
    if (!opts.quiet) {
      process.stderr.write(
        'scope-widen: --apply requested but delta is empty; manifest unchanged.\n',
      );
    }
    return 0;
  }
  const merged = mergeDelta(prior, delta);
  try {
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, stringifyYaml(merged), 'utf8');
  } catch (err) {
    process.stderr.write(
      `scope-widen: manifest write failed: ${errorMessage(err)}\n`,
    );
    return 2;
  }
  if (!opts.quiet) {
    process.stderr.write(
      `scope-widen: merged delta into ${relative(opts.repoRoot, manifestPath)}\n`,
    );
  }
  return 0;
}
