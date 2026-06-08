// stackctl dispatcher (T010).
//
// `bin/stackctl <verb> [flags]` → tsx src/cli.ts → dispatch on <verb>.
// Mirrors dw-lifecycle's cli.ts shape (relative ESM imports, in-tree, tsx-run).
// Per contracts/stackctl-cli.md § Dispatcher:
//   - unknown verb → exit 2 with a usage line listing known verbs
//   - no verb     → usage to stderr, exit 2
//   - --help/-h/help → usage to stdout, exit 0
//   - no flag silently ignored (each subcommand validates its own flags)

import { runVersion } from './subcommands/version.js';
import { runExecuteCheck } from './subcommands/execute-check.js';
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

type Subcommand = (args: string[]) => Promise<void>;

const SUBCOMMANDS: Record<string, Subcommand> = {
  version: runVersion,
  'execute-check': runExecuteCheck,
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

  await handler(args);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});

export { SUBCOMMANDS };
