import { install } from './subcommands/install.js';
import { setup } from './subcommands/setup.js';
import { doctor } from './subcommands/doctor.js';
import { journalAppend } from './subcommands/journal-append.js';
import { transition } from './subcommands/transition.js';
import { issues } from './subcommands/issues.js';

const subcommand = process.argv[2];
const args = process.argv.slice(3);

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
  setup,
  issues,
  transition,
  'journal-append': journalAppend,
  doctor,
};

function printUsage(stream: NodeJS.WriteStream): void {
  stream.write('Usage: dw-lifecycle <subcommand> [args...]\n');
  stream.write(`Subcommands: ${Object.keys(SUBCOMMANDS).join(', ')}\n`);
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
