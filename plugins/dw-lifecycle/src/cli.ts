import { install } from './subcommands/install.js';
import { installShortcuts } from './subcommands/install-shortcuts.js';
import { uninstallShortcuts } from './subcommands/uninstall-shortcuts.js';
import { setup } from './subcommands/setup.js';
import { doctor } from './subcommands/doctor.js';
import { journalAppend } from './subcommands/journal-append.js';
import { transition } from './subcommands/transition.js';
import { issues } from './subcommands/issues.js';
import { customize } from './subcommands/customize.js';
import { checkClones } from './subcommands/check-clones.js';
import { checkAntiPatterns } from './subcommands/check-anti-patterns.js';
import { checkAdopters } from './subcommands/check-adopters.js';
import { checkEditorSymmetry } from './subcommands/check-editor-symmetry.js';
import { checkRefactorPreconditions } from './subcommands/check-refactor-preconditions.js';
import { scopeInventory } from './subcommands/scope-inventory.js';
import { scopeWiden } from './subcommands/scope-widen.js';
import { batchDispose } from './subcommands/batch-dispose.js';
import { checkDispositionSurvivor } from './subcommands/check-disposition-survivor.js';
import { scopeSummary } from './subcommands/scope-summary.js';
import { checkDeprecations } from './subcommands/check-deprecations.js';
import { validateScopeDiscovery } from './subcommands/validate-scope-discovery.js';
import { scopeExport } from './subcommands/scope-export.js';
import { refreshClonesBaseline } from './subcommands/refresh-clones-baseline.js';
import { disposeClone } from './subcommands/dispose-clone.js';
import { installScopeDiscovery } from './subcommands/install-scope-discovery.js';
import { installScopeDiscoveryHooks } from './subcommands/install-scope-discovery-hooks.js';
import { installAgentPrompts } from './subcommands/install-agent-prompts.js';
import { migrateFromPilot } from './subcommands/migrate-from-pilot.js';
import { uninstallScopeDiscoveryHooks } from './subcommands/uninstall-scope-discovery-hooks.js';
import { orchestratorTurn } from './subcommands/orchestrator-turn.js';
import { wrapPrompt } from './subcommands/wrap-prompt.js';
import { validateReturn } from './subcommands/validate-return.js';
import { debtReport } from './subcommands/debt-report.js';
import { triageIssues } from './subcommands/triage-issues.js';
import { promoteDeferrals } from './subcommands/promote-deferrals.js';
import { archiveBranch } from './subcommands/archive-branch.js';
import { closeShipped } from './subcommands/close-shipped.js';

const subcommand = process.argv[2];
const args = process.argv.slice(3);

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
  'install-shortcuts': installShortcuts,
  'uninstall-shortcuts': uninstallShortcuts,
  setup,
  issues,
  transition,
  'journal-append': journalAppend,
  doctor,
  customize,
  // `check-clones` is the canonical name (workplan Phase 6 Task 2). The
  // legacy `detect-clones` is preserved as a back-compat alias so
  // adopter projects whose `install-scope-discovery-hooks` ran against
  // earlier versions of the plugin keep working without re-installing
  // their pre-commit hook. New code, new docs, new hook chains emit
  // `check-clones`. The alias has no scheduled removal.
  'check-clones': checkClones,
  'detect-clones': checkClones,
  'check-anti-patterns': checkAntiPatterns,
  'check-adopters': checkAdopters,
  'check-editor-symmetry': checkEditorSymmetry,
  'check-refactor-preconditions': checkRefactorPreconditions,
  'scope-inventory': scopeInventory,
  'scope-widen': scopeWiden,
  'batch-dispose': batchDispose,
  'check-disposition-survivor': checkDispositionSurvivor,
  'scope-summary': scopeSummary,
  'check-deprecations': checkDeprecations,
  'validate-scope-discovery': validateScopeDiscovery,
  'scope-export': scopeExport,
  'refresh-clones-baseline': refreshClonesBaseline,
  'dispose-clone': disposeClone,
  'install-scope-discovery': installScopeDiscovery,
  'install-scope-discovery-hooks': installScopeDiscoveryHooks,
  'install-agent-prompts': installAgentPrompts,
  'migrate-from-pilot': migrateFromPilot,
  'uninstall-scope-discovery-hooks': uninstallScopeDiscoveryHooks,
  'orchestrator-turn': orchestratorTurn,
  'wrap-prompt': wrapPrompt,
  'validate-return': validateReturn,
  'debt-report': debtReport,
  'triage-issues': triageIssues,
  'promote-deferrals': promoteDeferrals,
  'archive-branch': archiveBranch,
  'close-shipped': closeShipped,
};

// Deprecation hints printed alongside the subcommand list in `--help`.
// Each entry maps the alias subcommand name to a one-line note telling
// the operator which canonical verb to migrate to. The alias still works
// (registered in SUBCOMMANDS above); the hint is informational only.
const DEPRECATED_ALIASES: Record<string, string> = {
  'detect-clones': 'alias for `check-clones` (preferred name; alias kept for back-compat)',
};

function printUsage(stream: NodeJS.WriteStream): void {
  stream.write('Usage: dw-lifecycle <subcommand> [args...]\n');
  stream.write(`Subcommands: ${Object.keys(SUBCOMMANDS).join(', ')}\n`);
  for (const [alias, hint] of Object.entries(DEPRECATED_ALIASES)) {
    stream.write(`  (${alias}: ${hint})\n`);
  }
}

async function main() {
  // Help is a top-level concern: explicit `--help`/`-h`/`help` prints the
  // usage banner to stdout and exits 0. Bare invocation (no subcommand)
  // is an error — usage to stderr, exit 1. The smoke at
  // scripts/smoke-marketplace.sh runs `bin/<bin> --help` to assert the
  // bin shim resolves and dispatches; without this branch, dw-lifecycle
  // would exit 1 there even though the install path is healthy.
  if (subcommand === '--help' || subcommand === '-h' || subcommand === 'help') {
    printUsage(process.stdout);
    process.exit(0);
  }
  if (!subcommand) {
    printUsage(process.stderr);
    process.exit(1);
  }

  const handler = SUBCOMMANDS[subcommand];
  if (!handler) {
    console.error(`Unknown subcommand: ${subcommand}`);
    process.exit(1);
  }

  await handler(args);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

export { SUBCOMMANDS, args };
