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
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { enumerateUiRoutes } from './discovery-agents/ui-route-enumerator.js';
import { buildPatternMatrix } from './discovery-agents/pattern-matrix.js';
import { readCloneDetectorOutput } from './discovery-agents/clone-detector-reader.js';
import { huntPrdThemes } from './discovery-agents/prd-themed-pattern-hunter.js';
import { detectRegimeHoldouts } from './discovery-agents/regime-holdout-detector.js';
import { checkAdopterManifests } from './discovery-agents/adopter-manifest-checker.js';
import { computeMatrix } from './module-symmetry-matrix.js';
import { renderMatrix } from './module-symmetry-report.js';
import type {
  DiscoveryAgentFinding,
  DiscoveryAgentInput,
} from './discovery-agents/types.js';
import { synthesize } from './synthesis.js';
import { renderSynthesizerNotes } from './synthesis-cli.js';
import {
  renderCategorySummaryLine,
  renderFindingCategoryReport,
} from './synthesis-report.js';
import { errorMessage } from './util/typeguards.js';
import {
  extractAjvErrorsFromSynthesisMessage,
  isSchemaValidationError,
  wrapSchemaErrors,
} from './synthesis-error-hints.js';
import {
  parseCli,
  USAGE,
  type CliOptions,
} from './scope-inventory-cli.js';
import {
  emptyCatalogState as emptyLoopCatalogState,
  fireAuditForInventory,
  persistInventoryWatermark,
  readPendingAuditUpdatesForInventory,
} from './llm/inventory-integration.js';

/**
 * Config-activated agent gate files (Phase 4). The orchestrator
 * inspects these paths via `existsSync` at fan-out time; agents whose
 * activation file is missing are skipped entirely so a project that
 * hasn't authored a registry pays zero scan cost.
 */
const PHASE4_GATE_FILES = {
  antiPatterns: '.dw-lifecycle/scope-discovery/anti-patterns.yaml',
  adopterManifests: '.dw-lifecycle/scope-discovery/adopter-manifests.yaml',
  moduleSymmetryArtifact: '.dw-lifecycle/scope-discovery/editor-symmetry.md',
} as const;

// `CliOptions`, `parseCli`, `USAGE`, `FEATURE_SLUG_REGEX`, and
// `DEFAULT_MODULE_ROOT` live in `scope-inventory-cli.ts` so this
// orchestrator file stays under the 300–500 line cap after the Phase
// 11 Task 7 LLM-ensemble integration. The split is mechanical — the
// behavior, flag set, exit codes are unchanged.

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
 * Activation flags computed by `decideActivations` from on-disk gate
 * files. Each Phase 4 agent runs only when its activation criterion
 * is met; absent agents pay zero scan cost.
 */
interface Phase4Activations {
  readonly regimeHoldout: boolean;
  readonly moduleSymmetry: boolean;
  readonly adopterManifestChecker: boolean;
}

/**
 * Decide which Phase 4 agents activate for this run, based on the
 * presence of registry / artifact files under
 * `<repoRoot>/.dw-lifecycle/scope-discovery/`.
 *
 * Activation uses `existsSync` rather than registry-content checks
 * (Model 1 per the Phase 4 pilot map): a project that ships an empty
 * registry stub means "we INTEND to track this; no entries yet" and
 * the agent should still run. The pilot's scanners already tolerate
 * empty registries by returning 0 findings — the activation gate
 * only spares the cost on projects that haven't authored a registry
 * at all.
 *
 * Note: `editor-symmetry.md` is the OUTPUT of the module-symmetry
 * scanner (the artifact filename stays as `editor-symmetry.md` per
 * the wire-format note in check-module-symmetry.ts:14-18; the verb
 * name was renamed in Phase 25 Task 5). The scanner reads
 * `adopter-manifests.yaml`
 * (the input) and produces the .md (the output). Activation is gated
 * on the input file's presence per the Phase 4 pilot map (workplan's
 * phrasing was a mis-description of the input/output relationship).
 */
function decideActivations(repoRoot: string): Phase4Activations {
  const haveAntiPatterns = existsSync(resolve(repoRoot, PHASE4_GATE_FILES.antiPatterns));
  const haveAdopterManifests = existsSync(
    resolve(repoRoot, PHASE4_GATE_FILES.adopterManifests),
  );
  const haveModuleSymmetryArtifact = existsSync(
    resolve(repoRoot, PHASE4_GATE_FILES.moduleSymmetryArtifact),
  );
  return {
    regimeHoldout:
      haveAntiPatterns || haveAdopterManifests || haveModuleSymmetryArtifact,
    moduleSymmetry: haveAdopterManifests,
    adopterManifestChecker: haveAdopterManifests,
  };
}

/**
 * Fan the discovery agents in parallel against the shared input
 * contract. The four "always-on" Phase 3 agents always run; Phase 4
 * config-activated agents (regime-holdout-detector + Family C
 * integration in subsequent commits) run only when their gate files
 * are present.
 *
 * Each agent's result is collected as `{ name, finding }` so the
 * caller can write per-agent JSON to the evidence trail with a
 * stable filename.
 */
async function runAgents(
  input: DiscoveryAgentInput,
  activations: Phase4Activations,
  emitNote: (msg: string) => void,
): Promise<ReadonlyArray<AgentRun>> {
  // Build the parallel-agent list with explicit `{ name, run }` tuples
  // so conditional inclusion preserves type narrowing at each step.
  const promises: Array<Promise<AgentRun>> = [
    enumerateUiRoutes(input).then((f) => ({ name: 'ui-route-enumerator', finding: f })),
    buildPatternMatrix(input).then((f) => ({ name: 'pattern-matrix', finding: f })),
    readCloneDetectorOutput(input)
      .catch((err: unknown) => {
        // Clone-detector reader fails LOUD when the baseline is missing.
        // For a first-time `scope-inventory` run on a project that hasn't
        // produced a clones.yaml yet, that's expected — surface the failure
        // mode at the orchestrator level with an actionable hint rather
        // than swallowing it (which would mask packaging defects per
        // Audit-2026-05-25 Finding 02).
        throw new Error(
          `clone-detector-reader failed: ${errorMessage(err)}\n` +
            'Generate the baseline first: dw-lifecycle check-clones --refresh-baseline',
        );
      })
      .then((f) => ({ name: 'clone-detector-reader', finding: f })),
    huntPrdThemes(input).then((f) => ({
      name: 'prd-themed-pattern-hunter',
      finding: f,
    })),
  ];
  if (activations.regimeHoldout) {
    promises.push(
      detectRegimeHoldouts(input).then((f) => ({
        name: 'regime-holdout-detector',
        finding: f,
      })),
    );
  } else {
    emitNote(
      'skipped regime-holdout-detector (no anti-patterns.yaml, ' +
        'adopter-manifests.yaml, or editor-symmetry.md found under ' +
        '.dw-lifecycle/scope-discovery/)',
    );
  }
  if (activations.adopterManifestChecker) {
    promises.push(
      checkAdopterManifests(input).then((f) => ({
        name: 'adopter-manifest-checker',
        finding: f,
      })),
    );
  } else {
    emitNote(
      'skipped adopter-manifest-checker (no adopter-manifests.yaml found ' +
        'under .dw-lifecycle/scope-discovery/)',
    );
  }
  return Promise.all(promises);
}

/**
 * Phase 4 Family B: when adopter-manifests.yaml is present, build the
 * cross-module symmetry matrix and write the markdown artifact to the
 * configured path (default: under the per-run evidence trail). The
 * agent does NOT emit a `DiscoveryAgentFinding` — its output is the
 * markdown file itself; the regime-holdout-detector already consumes
 * the matrix in-process for its `module-symmetry` source bucket.
 *
 * Returns the absolute path of the written artifact, or null when
 * skipped. Failures throw so the orchestrator surfaces them at exit
 * code 2 (matches the standalone `check-module-symmetry` semantics).
 */
async function writeModuleSymmetryArtifact(args: {
  readonly repoRoot: string;
  readonly moduleRoot: string;
  readonly outPath: string;
}): Promise<string> {
  const matrix = await computeMatrix({
    registryPath: resolve(args.repoRoot, PHASE4_GATE_FILES.adopterManifests),
    scanRoot: args.repoRoot,
    moduleRoot: args.moduleRoot,
  });
  const rendered = renderMatrix(matrix);
  await mkdir(dirname(args.outPath), { recursive: true });
  await writeFile(args.outPath, rendered, 'utf8');
  return args.outPath;
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
 *   0 — success (manifest written + validated, OR no findings)
 *   1 — findings to act on (currently unused at this layer; reserved for
 *       a future surface that splits "manifest emitted with findings"
 *       from "manifest emitted clean")
 *   2 — infra error (CLI parse, write, agent invocation, missing PRD,
 *       AND schema-validation failure — the verb couldn't produce a
 *       manifest, so this is "didn't do the work" not "findings to
 *       triage"; see TF-014)
 *
 * TF-014 (dogfood) — prior to this change, schema-validation failures
 * exited 1, which adopter CI gates interpreted as "findings to triage"
 * (a still-actionable but not-blocking state). Schema-validation
 * failure is fundamentally different — the verb couldn't produce a
 * manifest at all — so exit 2 is the correct signal.
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

  const activations = decideActivations(opts.repoRoot);
  const skipNotes: string[] = [];
  const emitSkipNote = (msg: string): void => {
    skipNotes.push(msg);
    if (!opts.quiet) {
      process.stderr.write(`scope-inventory: ${msg}\n`);
    }
  };

  // read audit-log updates BEFORE the agent fan-out
  // so any auditor findings since the last run surface in the run's
  // notes. Silent-skip when scope-discovery isn't installed or when
  // the operator passed --no-audit-read.
  const auditLogPath = resolve(
    opts.repoRoot,
    'docs',
    '1.0',
    '001-IN-PROGRESS',
    opts.featureSlug,
    'audit-log.md',
  );
  const auditRead = await readPendingAuditUpdatesForInventory({
    repoRoot: opts.repoRoot,
    featureSlug: opts.featureSlug,
    options: {
      auditLogPath,
      skip: opts.noAuditRead,
      emitNote: emitSkipNote,
    },
  });
  for (const entry of auditRead.entries) {
    emitSkipNote(
      `audit-log update: ${entry.findingId} (status: ${entry.status})` +
        (entry.provenance !== undefined ? ` [${entry.provenance}]` : ''),
    );
  }

  let agents: ReadonlyArray<AgentRun>;
  try {
    agents = await runAgents(input, activations, emitSkipNote);
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
      repoRoot: opts.repoRoot,
    });
    // Validation happened inside synthesize(); if we got here, the
    // manifest is schema-valid. Write the YAML to --out.
    const yamlText = stringifyYaml(output.manifest);
    await mkdir(dirname(opts.outPath), { recursive: true });
    await writeFile(opts.outPath, yamlText, 'utf8');

    // TF-016 (dogfood) — surface a one-line advisory when the manifest
    // emitted an empty `modules:` array. Schema permits it (the TF-016a
    // relaxation set `minItems: 0`); the advisory just flags that the
    // discovery agents found AST/clone signal but couldn't attribute
    // any of it to a `<module-root>/<feature-slug>/`-shaped slug.
    // Suppress with `--no-require-modules` once the operator has
    // confirmed their repo's layout doesn't match.
    const manifestModules = output.manifest.modules;
    const modulesEmpty =
      manifestModules !== undefined && manifestModules.length === 0;
    if (modulesEmpty && !opts.noRequireModules && !opts.quiet) {
      process.stderr.write(
        'scope-inventory: zero modules detected — manifest emits ' +
          'empty modules: array. If your repo uses a ' +
          '`<module-root>/<feature-slug>/` layout, pass `--module-root` ' +
          'or check that the feature\'s siblings exist under it. Pass ' +
          '`--no-require-modules` to silence this advisory once ' +
          "confirmed (the manifest is valid either way).\n",
      );
    }

    // Module-symmetry artifact (Phase 4 Family B): activate when
    // adopter-manifests.yaml exists. Default output lives under the
    // per-run evidence trail; explicit --module-symmetry-out (with
    // back-compat alias `--editor-symmetry-out`) overrides. Failures
    // throw and exit code 2 (matches the standalone
    // check-module-symmetry's contract).
    let runDir: string | null = null;
    if (opts.evidenceTrail) {
      runDir = makeRunDir({
        repoRoot: opts.repoRoot,
        featureSlug: opts.featureSlug,
      });
    }
    if (activations.moduleSymmetry) {
      const defaultPath =
        runDir !== null
          ? resolve(runDir, 'editor-symmetry.md')
          : resolve(opts.repoRoot, PHASE4_GATE_FILES.moduleSymmetryArtifact);
      const symmetryOut = opts.moduleSymmetryOut ?? defaultPath;
      const written = await writeModuleSymmetryArtifact({
        repoRoot: opts.repoRoot,
        moduleRoot: opts.moduleRoot,
        outPath: symmetryOut,
      });
      if (!opts.quiet) {
        process.stderr.write(
          `scope-inventory: module-symmetry matrix at ${relative(opts.repoRoot, written)}\n`,
        );
      }
    } else {
      emitSkipNote(
        'skipped module-symmetry scanner (no adopter-manifests.yaml found ' +
          'under .dw-lifecycle/scope-discovery/)',
      );
    }

    // Evidence trail (optional). The synthesis.md fragment now leads
    // with the inventory-vs-discovery category breakdown (the orchestrator loop
    // Task 12 — surfaces registered-pattern matches vs. discovered
    // candidates vs. novel-shape candidates) so the operator's first
    // read of the file sees the category distinction BEFORE the
    // synthesizer notes. The categories close the operator-trust
    // failure mode the v1 dogfood-cycle finding named (a green
    // discovery report read as "no novel anti-patterns").
    if (opts.evidenceTrail && runDir !== null) {
      const allWarnings = [...skipNotes, ...output.metadata.warnings];
      const categoryReport = renderFindingCategoryReport(output.manifest);
      const synthesizerNotes = renderSynthesizerNotes(allWarnings);
      const notes = `${categoryReport}\n${synthesizerNotes}`;
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
      // surface the inventory-vs-discovery category
      // summary alongside the existing "wrote ..." line so the operator
      // sees the registered-pattern vs. candidate split at-a-glance
      // (the manifest YAML + synthesis.md carry the full breakdown).
      process.stderr.write(
        `scope-inventory: ${renderCategorySummaryLine(output.manifest)}\n`,
      );
      for (const w of output.metadata.warnings) {
        process.stderr.write(`scope-inventory: note: ${w}\n`);
      }
    }

    // fire the external audit AFTER synthesis. The
    // auditor process picks up the audit-request artifact + writes
    // findings back to the audit-log for the NEXT scope-inventory run.
    await fireAuditForInventory({
      repoRoot: opts.repoRoot,
      options: {
        skip: opts.noAuditFire,
        emitNote: emitSkipNote,
        catalogState: emptyLoopCatalogState(),
        featureSlug: opts.featureSlug,
      },
    });
    // Persist the watermark advanced by the pre-run audit read.
    await persistInventoryWatermark({
      repoRoot: opts.repoRoot,
      featureSlug: opts.featureSlug,
      newWatermark: auditRead.newWatermark,
    });
    return 0;
  } catch (err) {
    const msg = errorMessage(err);
    // Schema validation failures: re-format the raw ajv bullets through
    // the hint table (TF-015) so the operator sees an actionable
    // message rather than the bare `/modules: must NOT have fewer than
    // 1 items` text. Schema-validation failure means the verb COULDN'T
    // produce a manifest at all, so exit code 2 (TF-014) — adopter CI
    // gates would otherwise see exit 1 and treat it as "findings to
    // triage," which is the wrong signal.
    if (isSchemaValidationError(msg)) {
      const ajvBullets = extractAjvErrorsFromSynthesisMessage(msg);
      const wrapped = wrapSchemaErrors(ajvBullets);
      process.stderr.write(`${wrapped}\n`);
      return 2;
    }
    process.stderr.write(`scope-inventory: ${msg}\n`);
    return 2;
  }
}
