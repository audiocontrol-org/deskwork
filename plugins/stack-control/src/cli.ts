// stackctl dispatcher (T010).
//
// `bin/stackctl <verb> [flags]` → tsx src/cli.ts → dispatch on <verb>.
// Mirrors dw-lifecycle's cli.ts shape (relative ESM imports, in-tree, tsx-run).
// Per contracts/stackctl-cli.md § Dispatcher:
//   - unknown verb → exit 2 with a usage line listing known verbs
//   - no verb     → usage to stderr, exit 2
//   - --help/-h/help → usage to stdout, exit 0
//   - no flag silently ignored (each subcommand validates its own flags)

import { setInstallationNoticeVerb } from './config/installation.js';
import { runVersion } from './subcommands/version.js';
import { runExecuteCheck } from './subcommands/execute-check.js';
import { runSpeckitGuard } from './subcommands/speckit-guard.js';
import { runNoShortcutsAudit } from './subcommands/no-shortcuts-audit.js';
import { runSpecCheck } from './subcommands/spec-check.js';
import { runSpecGovernanceGate } from './subcommands/spec-governance-gate.js';
import { runSlushFindings } from './subcommands/slush-findings.js';
import { auditBarrage } from './subcommands/audit-barrage.js';
import { auditBarrageRender } from './subcommands/audit-barrage-render.js';
import { auditBarrageLiftCli } from './subcommands/audit-barrage-lift.js';
import { runGovern } from './subcommands/govern.js';
import { runArchiveCli } from './subcommands/archive.js';
import { runUnarchiveCli } from './subcommands/unarchive.js';
import { runCurateCli } from './subcommands/curate.js';
import { runRoadmapCommand } from './subcommands/roadmap-command.js';
import { runWorkflowCli } from './subcommands/workflow.js';
import { runInboxCli } from './subcommands/inbox.js';
import { runBacklogCli } from './subcommands/backlog.js';
import { runSetupCli } from './subcommands/setup.js';
import { runCheckClones } from './subcommands/check-clones.js';
import { runDisposeClone } from './subcommands/dispose-clone.js';
import { runBatchDispose } from './subcommands/batch-dispose.js';
import { runRefreshClonesBaseline } from './subcommands/refresh-clones-baseline.js';
import { runCheckDispositionSurvivor } from './subcommands/check-disposition-survivor.js';
import { runCheckRefactorPreconditions } from './subcommands/check-refactor-preconditions.js';
import { wrapPrompt } from './subcommands/wrap-prompt.js';
import { validateReturn } from './subcommands/validate-return.js';
import { runValidateScopeDiscovery } from './subcommands/validate-scope-discovery.js';
import { runInstallDrift } from './subcommands/install-drift.js';
import { runCheckAntiPatterns } from './subcommands/check-anti-patterns.js';
import { runCheckAdopters } from './subcommands/check-adopters.js';
import { runCheckModuleSymmetry } from './subcommands/check-module-symmetry.js';
import { runCheckEditorSymmetry } from './subcommands/check-editor-symmetry.js';
import { runCheckDeprecations } from './subcommands/check-deprecations.js';
import { runInstallScopeDiscovery } from './subcommands/install-scope-discovery.js';
import { runScopeSummary } from './subcommands/scope-summary.js';
import { runScopeExport } from './subcommands/scope-export.js';
import { runScopeDoctor } from './subcommands/scope-doctor.js';
import { runCustomize } from './subcommands/customize.js';
import { runScopeInventory } from './subcommands/scope-inventory.js';
import { runScopeWiden } from './subcommands/scope-widen.js';
import { runSessionStartCli } from './subcommands/session-start.js';
import { runSessionEndCli } from './subcommands/session-end.js';
import { runReleaseCheck } from './subcommands/release-check.js';
import { runReleaseHelperCli } from './subcommands/release-helper.js';
import { runConfigDomainCli } from './subcommands/config-domain.js';
import { runMediateCheck } from './subcommands/mediate-check.js';
import { runFrontDoor } from './subcommands/front-door.js';
import { runIntercept } from './subcommands/intercept.js';
import { runCapabilityCli } from './subcommands/capability.js';
import { runReconcileCli } from './subcommands/capability-reconcile.js';

type Subcommand = (args: string[]) => Promise<void>;

const SUBCOMMANDS: Record<string, Subcommand> = {
  version: runVersion,
  'execute-check': runExecuteCheck,
  // Speckit wrapper refusal/redirect (025 US4) — portable, cross-vendor.
  'speckit-guard': runSpeckitGuard,
  // No agent-offered shortcuts audit (025 US5) — phrase scan over shipped prompt surfaces.
  'no-shortcuts-audit': runNoShortcutsAudit,
  'spec-check': runSpecCheck,
  'spec-governance-gate': runSpecGovernanceGate,
  'slush-findings': runSlushFindings,
  // Vendored from dw-lifecycle (multi/migrate-audit-barrage) — stack-control's
  // own audit-barrage; no dw-lifecycle dependency.
  'audit-barrage-render': auditBarrageRender,
  'audit-barrage': auditBarrage,
  'audit-barrage-lift': auditBarrageLiftCli,
  // Single-sourced audit-protocol orchestration (govern consolidation):
  // replaces the two divergent bash scripts; the shims exec this verb.
  govern: runGovern,
  // Document-handling primitives (design/document-primitives).
  archive: runArchiveCli,
  unarchive: runUnarchiveCli,
  curate: runCurateCli,
  // Roadmap protocol semantic layer (design/roadmap-protocol). First verb
  // mounted onto the commander parser library (027 T004); the un-migrated verbs
  // below stay on this flat dispatcher unchanged (FR-006 non-regression).
  roadmap: runRoadmapCommand,
  // Parseable lifecycle workflow engine (022 parseable-lifecycle-workflow).
  workflow: runWorkflowCli,
  // Low-friction insight capture (design/insight-capture).
  inbox: runInboxCli,
  // Backlog slush-pile surface — external-backend adapter verb (008).
  backlog: runBacklogCli,
  // Post-install project setup — create-side of the config + resolution port (009).
  setup: runSetupCli,
  // Scope-discovery: per-codebase clone detection (010 / US1).
  'check-clones': runCheckClones,
  // Scope-discovery: clone-disposition lifecycle (010 / US2).
  'dispose-clone': runDisposeClone,
  'batch-dispose': runBatchDispose,
  'refresh-clones-baseline': runRefreshClonesBaseline,
  'check-disposition-survivor': runCheckDispositionSurvivor,
  'check-refactor-preconditions': runCheckRefactorPreconditions,
  // Scope-discovery: sub-agent dispatch grammar gate (010 / US5).
  'wrap-prompt': wrapPrompt,
  'validate-return': validateReturn,
  'validate-scope-discovery': runValidateScopeDiscovery,
  // Scope-discovery: install-drift advisory (010 / US8).
  'install-drift': runInstallDrift,
  // Scope-discovery: registry-driven checks (010 / US4).
  'check-anti-patterns': runCheckAntiPatterns,
  'check-adopters': runCheckAdopters,
  'check-module-symmetry': runCheckModuleSymmetry,
  'check-editor-symmetry': runCheckEditorSymmetry, // deprecated alias → check-module-symmetry
  'check-deprecations': runCheckDeprecations,
  // Scope-discovery: install / customize / doctor / summary / export (010 / US6).
  'install-scope-discovery': runInstallScopeDiscovery,
  customize: runCustomize,
  'scope-doctor': runScopeDoctor,
  'scope-summary': runScopeSummary,
  'scope-export': runScopeExport,
  // Scope-discovery: upfront surface discovery + mid-impl widening (010 / US3).
  'scope-inventory': runScopeInventory,
  'scope-widen': runScopeWiden,
  // Native session lifecycle skills (011 / session-skills).
  'session-start': runSessionStartCli,
  'session-end': runSessionEndCli,
  'config-domain': runConfigDomainCli,
  // Portable release/update contract checks (017 / portability).
  'release-check': runReleaseCheck,
  'release-helper': runReleaseHelperCli,
  // Capability-interface mediation (026): the decision verb + the front-door marker writer
  // + the Claude PreToolUse adapter entry (bin/intercept dispatches here).
  'mediate-check': runMediateCheck,
  'front-door': runFrontDoor,
  intercept: runIntercept,
  // Agent-facing capability discovery (026 US2) + the US3 reconcile backstop. The
  // `reconcile` subaction dispatches to its own module so the US2 `capability list` verb
  // (capability.ts) stays list-only (its phase scope is not disturbed by US3).
  capability: async (args: string[]): Promise<void> =>
    args[0] === 'reconcile' ? runReconcileCli(args.slice(1)) : runCapabilityCli(args),
};

function printUsage(stream: NodeJS.WriteStream): void {
  stream.write('Usage: stackctl <verb> [flags...]\n');
  stream.write(`Verbs: ${Object.keys(SUBCOMMANDS).join(', ')}\n`);
}

async function main(): Promise<void> {
  const verb = process.argv[2];
  const args = process.argv.slice(3);

  if (verb === '--help' || verb === '-h' || verb === 'help') {
    printUsage(process.stdout);
    process.exit(0);
  }
  if (verb === undefined || verb === '') {
    printUsage(process.stderr);
    process.exit(2);
  }

  const handler = SUBCOMMANDS[verb];
  if (handler === undefined) {
    process.stderr.write(`stackctl: unknown verb '${verb}'\n`);
    printUsage(process.stderr);
    process.exit(2);
  }

  // The shared resolver's legacy half-installation notice carries the
  // dispatched verb as its prefix (specs/installation-isolation US5).
  setInstallationNoticeVerb(verb);
  await handler(args);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});

export { SUBCOMMANDS };
