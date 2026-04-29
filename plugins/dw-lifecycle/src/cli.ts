import { install } from './subcommands/install.js';
import { setup } from './subcommands/setup.js';
import { doctor } from './subcommands/doctor.js';
import { journalAppend } from './subcommands/journal-append.js';

const subcommand = process.argv[2];
const args = process.argv.slice(3);

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
  setup,
  doctor,
  'journal-append': journalAppend,
};

async function main() {
  if (!subcommand) {
    console.error('Usage: dw-lifecycle <subcommand> [args...]');
    console.error(`Subcommands: ${Object.keys(SUBCOMMANDS).join(', ')}`);
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
