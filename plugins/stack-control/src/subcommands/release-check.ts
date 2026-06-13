import { collectPortableReleaseState } from '../release/portable.js';

function failUsage(message: string): never {
  process.stderr.write(`stackctl release-check: ${message}\n`);
  process.exit(2);
}

export async function runReleaseCheck(args: string[]): Promise<void> {
  let json = false;
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    failUsage(`unknown flag '${arg}'`);
  }

  const state = collectPortableReleaseState();
  if (json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }

  process.stdout.write(`portable release: lockstep version ${state.canonicalVersion}\n`);
  process.stdout.write(`portable release: checked ${state.artifacts.length} artifacts\n`);
  process.stdout.write(
    'portable release: stack-control distribution channels ' +
      `claude-plugin=${state.stackControlDistributions.claudePluginVersion}, ` +
      `codex-plugin=${state.stackControlDistributions.codexPluginVersion}, ` +
      `claude-marketplace=${state.stackControlDistributions.claudeMarketplaceVersion}, ` +
      `codex-marketplace=${state.stackControlDistributions.codexMarketplaceName}\n`,
  );
}
