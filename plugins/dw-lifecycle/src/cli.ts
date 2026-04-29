import { install } from './subcommands/install.js';

const subcommand = process.argv[2];
const args = process.argv.slice(3);

const SUBCOMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  install,
};

async function main() {
  if (!subcommand) {
    console.error('Usage: dw-lifecycle <subcommand> [args...]');
    console.error('Subcommands: install, setup, issues, transition, journal-append, doctor');
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
