// Dispatch shim — see scope-discovery/install-agent-prompts.ts for the
// flag + exit-code contract. Routes the `dw-lifecycle
// install-agent-prompts` subcommand to the library API.

import { main } from '../scope-discovery/install-agent-prompts.js';

export async function installAgentPrompts(args: string[]): Promise<void> {
  const result = await main(args);
  process.exit(result.code);
}
