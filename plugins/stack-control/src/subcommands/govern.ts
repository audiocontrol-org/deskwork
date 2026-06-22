/**
 * plugins/stack-control/src/subcommands/govern.ts
 *
 * `stackctl govern --mode <implement|spec>` — the single-sourced audit-protocol
 * orchestration. Consolidates the two divergent bash scripts
 * (deskwork-governance/govern.sh + spec-governance/govern-spec.sh) into one
 * TS command; the bash shims now exec `stackctl govern --mode …`.
 *
 * The per-stage difference is ONLY the payload (mode strategy). The common
 * render → barrage → lift → slush → gate chain lives in src/govern/protocol.ts.
 *
 * 030 T086 (FR-022 / SC-007) decomposed this command under the 500-line cap:
 *   - the flag grammar + env/flag helpers + BarrageVars builders → govern/govern-vars.ts
 *   - the three arm bodies (override short-circuit / implement / spec) → govern/govern-arms.ts
 * This file keeps `runGovern` — the preamble, feature-slug resolution, the shared
 * context assembly, and the dispatch to the arms inside one try/catch.
 *
 * Env parity (preserved for the shims; flags win over env when both are set):
 *   GOVERN_FEATURE_SLUG, GOVERN_DIFF_BASE, GOVERN_SPEC_PATH, GOVERN_PLAN_PATH,
 *   GOVERN_CHECKPOINT, GOVERN_CEILING, GOVERN_OVERRIDE, GOVERN_MODELS,
 *   GOVERN_BARRAGE_BIN (test stub), GOVERN_NO_SLUSH, GOVERN_PAYLOAD_BUDGET,
 *   GOVERN_FLEET_AVAILABLE (test stub: bypass the real `which` lane-availability
 *   probe so a CLI-less environment can exercise downstream govern behavior).
 *   GOVERN_REPO_ROOT is RETIRED (specs/installation-isolation R2): setting it
 *   is a loud FATAL naming the --at replacement — never a silent no-op.
 *
 * Exit codes: govern relays the gate's single decision (#432) — 0 when the gate
 * is OPEN (may graduate), 1 when the gate is BLOCKED (graduation refused), 2
 * fatal (usage error / capability or payload FATAL). govern does NOT re-derive
 * policy; it obeys the boolean the gate prints on stdout.
 *
 * Implement-mode also runs the per-codebase clone-detection step (US7 / FR-032):
 * it surfaces NEW intra-codebase duplication introduced by the governed change,
 * advisory alongside the convergence-gate verdict. See govern/clone-step.ts.
 */

import { join } from 'node:path';
import {
  GovernProtocolError,
  assertBarrageBinPresent,
  currentBranch,
  loadLaneCapabilitiesGoverned,
} from '../govern/protocol.js';
import {
  branchDerivedSlug,
  readActiveFeatureSlug,
  resolveFeatureFromItem,
  resolveFeatureSlug,
} from '../govern/feature-resolution.js';
import { GovernPayloadError } from '../govern/payload-spec.js';
import { resolveImplementDiffBase } from '../govern/payload-diff-scope.js';
import {
  discoverFeatureRoots,
  resolveFeatureRoot,
} from '../scope-discovery/util/feature-root.js';
import { resolveInstallation } from '../config/installation.js';
import type { Installation } from '../config/types.js';
import { checkLifecyclePrecondition } from '../lifecycle-precondition.js';
import { errorMessage } from '../scope-discovery/util/typeguards.js';
import {
  PLUGIN_ROOT,
  USAGE,
  parseFlags,
  pick,
  preflightNegotiatedFleet,
  resolveAuditLogExcerpt,
  resolveBarrageBin,
  resolveGovernExcludePaths,
} from '../govern/govern-vars.js';
import {
  emitTerminalOutcome,
  maybeOverrideGraduate,
  runImplementArm,
  runSpecArm,
  type GovernRunContext,
} from '../govern/govern-arms.js';

export async function runGovern(args: string[]): Promise<void> {
  const parsed = parseFlags(args);
  if (parsed.ok && parsed.flags.help) {
    // Usage-info early return — NOT a governed run, so no terminal-outcome by
    // design (the "every exit" contract is scoped to execution exits; locked by
    // the `--help emits no terminal-outcome` test).
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!parsed.ok) {
    process.stderr.write(`govern: ${parsed.error}\n${USAGE}\n`);
    emitTerminalOutcome('usage');
    process.exit(2);
  }
  const flags = parsed.flags;
  if (flags.mode === undefined) {
    process.stderr.write(`govern: --mode <implement|spec> is required\n${USAGE}\n`);
    emitTerminalOutcome('usage');
    process.exit(2);
  }

  // specs/014 US1 (Clarification 2026-06-11): govern-driven barrages default
  // to a fleet floor of 2 — the cross-model agreement signal is what protocol
  // runs exist for. --require-models overrides in either direction
  // (1 = lenient opt-out; >2 = stricter opt-in).
  let requireModels = 2;
  if (flags.requireModels !== undefined) {
    const n = Number(flags.requireModels);
    if (!Number.isInteger(n) || n < 1) {
      process.stderr.write(
        `govern: --require-models requires a positive integer, got '${flags.requireModels}'\n${USAGE}\n`,
      );
      emitTerminalOutcome('usage');
      process.exit(2);
    }
    requireModels = n;
  }

  // specs/installation-isolation R2: GOVERN_REPO_ROOT is retired. An
  // ignored variable would be a silent no-op, so a set variable is a
  // loud refusal naming the replacement.
  const legacyEnvRoot = process.env.GOVERN_REPO_ROOT;
  if (legacyEnvRoot !== undefined && legacyEnvRoot.length > 0) {
    process.stderr.write(
      'govern: FATAL — GOVERN_REPO_ROOT is retired (specs/installation-isolation R2); ' +
        'use --at <dir> to name the installation enclosing <dir> explicitly.\n',
    );
    emitTerminalOutcome('fatal');
    process.exit(2);
  }

  // 030 US9 (FR-029, clean break): the checkpoint selector is MODE-SCOPED. IMPLEMENT
  // mode has no per-phase checkpoint to select — the per-phase path is gone; it audits
  // the whole committed feature diff at end — so GOVERN_CHECKPOINT / --checkpoint are
  // rejected loud, like --phase. SPEC mode KEEPS its checkpoint label (a legitimate
  // spec-governance input), so the rejection never fires there.
  if (flags.mode === 'implement') {
    const checkpointEnv = process.env.GOVERN_CHECKPOINT;
    const checkpointSelected =
      (checkpointEnv !== undefined && checkpointEnv.length > 0) || flags.checkpoint !== undefined;
    if (checkpointSelected) {
      process.stderr.write(
        'govern: FATAL — GOVERN_CHECKPOINT is retired in implement mode (030 clean break: ' +
          'per-phase governance is gone; govern audits the whole committed feature diff at end). ' +
          'Unset it. Spec mode keeps its checkpoint label.\n',
      );
      emitTerminalOutcome('fatal');
      process.exit(2);
    }
  }

  // specs/installation-isolation US3 (R1): resolve the installation ONCE
  // at verb entry — the diff engine, run dirs, config reads, and the
  // bookkeeping exclusions all derive from this record. No enclosing
  // installation -> uniform loud refusal (US2).
  let installation: Installation;
  try {
    installation = resolveInstallation(flags.at ?? process.cwd());
  } catch (err) {
    process.stderr.write(`govern: FATAL — ${errorMessage(err)}\n`);
    emitTerminalOutcome('fatal');
    process.exit(2);
  }

  try {
    const repoRoot = installation.root;
    // 030 dogfood fix: implement-mode's whole-feature diff base defaults to the FEATURE
    // FORK POINT (merge-base with the repo default branch), not HEAD~1 (which audited
    // only the last commit). An explicit --diff-base / GOVERN_DIFF_BASE still wins; the
    // resolved base is threaded back into flags so every downstream site (the chunk
    // partitioner, the per-chunk payload) shares one base.
    if (flags.mode === 'implement') {
      flags.diffBase = resolveImplementDiffBase(
        repoRoot,
        flags.diffBase ?? pick(undefined, process.env.GOVERN_DIFF_BASE),
      );
    }
    // 024 FR-011: resolve the feature from an existing feature root — explicit,
    // then the branch slug (when it resolves), then the Spec Kit active-feature
    // marker — so govern runs on the session-pinned branch (where the branch slug
    // is NOT a feature slug). Pre-compute which candidate slugs have an existing
    // feature root (resolveFeatureRoot is async), then resolve synchronously.
    //
    // 024 codex-01 (HIGH): when an explicit `--item` is supplied (the authoritative
    // hook/operator path), resolve the feature from the item's spec pointer and use
    // it as the explicit slug — never guess from the incidental branch/marker.
    const itemSlug = flags.item !== undefined ? resolveFeatureFromItem(installation, flags.item) : undefined;
    // 024 codex-01 (HIGH): when an explicit item is named (the authoritative path), gate
    // govern through the compass — govern is a lifecycle surface and MUST NOT run on an item
    // whose phase is not ready for governing (a `--item` entry bypasses execute's precondition,
    // so the gate has to live here too). Refuse loud on a non-zero verdict, before any payload
    // assembly or barrage.
    if (flags.item !== undefined) {
      const pre = checkLifecyclePrecondition({ item: flags.item, intent: 'govern', cwd: installation.root });
      if (!pre.proceed) {
        process.stderr.write(
          `govern: REFUSED — compass verdict '${pre.verdict.outcome}' for '${flags.item}': ${pre.verdict.reason}\n`,
        );
        emitTerminalOutcome('fatal');
        // Propagate the compass exit code (ahead=3 / off-rail=4), not a flat usage 2 — preserve
        // the ahead/off-rail distinction the compass contract establishes (AUDIT-BARRAGE claude-03).
        process.exit(pre.verdict.exitCode || 1);
      }
    }
    const explicitSlug = itemSlug ?? pick(flags.feature, process.env.GOVERN_FEATURE_SLUG);
    const branchForSlug = currentBranch(repoRoot);
    // Only consult the active-feature marker when it is actually a resolution candidate —
    // i.e. when no explicit slug (--item/--feature/GOVERN_FEATURE_SLUG) already resolved the
    // feature (AUDIT-BARRAGE codex-02/claude-01). readActiveFeatureSlug fails loud on a
    // malformed marker (codex-03); reading it eagerly would FATAL the explicit-override path —
    // the very escape hatch for a broken marker. resolveFeatureSlug short-circuits on explicit,
    // so the marker is unused in that case anyway.
    const markerSlug = explicitSlug !== undefined ? null : readActiveFeatureSlug(repoRoot);
    const candidateSlugs = [branchDerivedSlug(branchForSlug), markerSlug].filter(
      (s): s is string => s !== null && s.length > 0,
    );
    const existingSlugs = new Set<string>();
    for (const candidate of candidateSlugs) {
      try {
        const { root } = await resolveFeatureRoot({ repoRoot, slug: candidate });
        if (root !== undefined) existingSlugs.add(candidate);
      } catch {
        // not found — not a candidate
      }
    }
    const slug = resolveFeatureSlug({
      explicit: explicitSlug,
      branch: branchForSlug,
      markerSlug,
      featureRootExists: (s) => existingSlugs.has(s),
    });

    // specs/029 US4 (FR-017/018): the `--override` SHORT-CIRCUIT — graduates THIS
    // invocation with ZERO render/barrage/lift/slush, BEFORE the barrage bin / fleet
    // preflight / payload / loop below. Returns (no override) → the normal barrage path.
    await maybeOverrideGraduate({ installation, repoRoot, flags, slug });

    const barrageBin = resolveBarrageBin();
    assertBarrageBinPresent(barrageBin);
    const stackctl = join(PLUGIN_ROOT, 'bin', 'stackctl');

    const requestedModels = pick(undefined, process.env.GOVERN_MODELS);
    const laneCapabilities =
      flags.mode === 'implement'
        ? preflightNegotiatedFleet(
            await loadLaneCapabilitiesGoverned(repoRoot),
            requestedModels,
            requireModels,
          )
        : undefined;

    // specs/014 US5: resolve the audit-log excerpt (spec mode), the feature root
    // and the full feature-root list (excludeRoots) so the implement payload is
    // self-reference-free + cross-feature-clean, plus the governance backlog store
    // (excludePaths). AUDIT-20260611-12: the resolver THROWS on an ambiguous Spec
    // Kit slug — translate into the same exit-2 FATAL channel as the
    // unresolvable-root refusal below (the outer catch only handles
    // GovernProtocolError/GovernPayloadError). specs/015 SC-005: implement mode
    // drops the excerpt from its OWN payload, but the excerpt is still resolved
    // here for spec mode + the root is still needed for the exclusions.
    let auditLogExcerpt: string;
    let featureRoot: string | undefined;
    let excludeRoots: readonly string[] | undefined;
    try {
      auditLogExcerpt = await resolveAuditLogExcerpt(repoRoot, slug);
      ({ root: featureRoot } = await resolveFeatureRoot({ repoRoot, slug }));
      excludeRoots =
        flags.mode === 'implement' && featureRoot !== undefined
          ? await discoverFeatureRoots(repoRoot)
          : undefined;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`govern: FATAL — ${msg}\n`);
      emitTerminalOutcome('fatal');
      process.exit(2);
    }
    // AUDIT-20260611-04: implement mode REFUSES to run without a resolved feature
    // root (an undefined root used to revert the assembler to the pre-014
    // self-referential repo-wide payload, silently). Fail loud at the decision site.
    if (flags.mode === 'implement' && featureRoot === undefined) {
      process.stderr.write(
        `govern: FATAL — feature '${slug}' not found under ${join(repoRoot, 'specs')}/<NNN>-${slug} (speckit) or ${join(repoRoot, 'docs')}/*/001-IN-PROGRESS/${slug} (legacy-docs).\n`,
      );
      emitTerminalOutcome('fatal');
      process.exit(2);
    }
    // AUDIT-20260611-08: thread the governance backlog store so its bookkeeping
    // commits/files are excluded from both payload arms.
    const excludePaths =
      flags.mode === 'implement' && featureRoot !== undefined
        ? resolveGovernExcludePaths(installation)
        : undefined;

    const ctx: GovernRunContext = {
      installation,
      repoRoot,
      flags,
      requireModels,
      slug,
      barrageBin,
      stackctl,
      requestedModels,
      laneCapabilities,
      auditLogExcerpt,
      featureRoot,
      excludeRoots,
      excludePaths,
    };

    // 030 US9 (FR-024): implement mode drives the end-govern pipeline as its SINGLE
    // execution path and exits; only spec mode reaches the convergence loop.
    if (flags.mode === 'implement') {
      await runImplementArm(ctx);
    }
    await runSpecArm(ctx);
  } catch (err) {
    if (err instanceof GovernProtocolError || err instanceof GovernPayloadError) {
      process.stderr.write(`${err.message}\n`);
      // T028 (US5): one machine-readable terminal tag per exit. A payload-spec
      // failure is its own kind; a protocol error carries the specific kind it
      // was thrown with (negotiation-failed / boundary-too-large / etc.).
      const kind = err instanceof GovernProtocolError ? err.terminalKind : 'payload-error';
      emitTerminalOutcome(kind);
      const code = err instanceof GovernProtocolError ? err.exitCode : 2;
      process.exit(code);
    }
    // AUDIT-BARRAGE-codex-01 (021 phase-2 HIGH): an UNEXPECTED exception (fs
    // failure, checkpoint-write failure, uncaught child error) is a govern FATAL.
    // Emit the `fatal` terminal AND exit 2 — rethrowing let the generic CLI
    // wrapper exit 1, contradicting the tag (machine-readable `fatal` vs a
    // non-fatal exit code). Print the message so the failure is still diagnosable.
    process.stderr.write(`govern: FATAL — ${errorMessage(err)}\n`);
    emitTerminalOutcome('fatal');
    process.exit(2);
  }
}
