// Dispatch shim — see scope-discovery/check-deprecations.ts for the flag
// + exit-code contract. Routes the `dw-lifecycle check-deprecations`
// subcommand to the scanner's `main(argv)` and bridges its numeric return
// code into a process.exit so the dispatcher's contract (handlers exit
// the process) matches the other subcommands. The deprecation-scan port
// landed in commit 4da4660 (closes #287); the underlying main() walks
// `.ts`/`.tsx` for `@deprecated` JSDoc tags + `// DEPRECATED:` line
// comments within the first 20 lines and resolves importers via the
// configurable `@/` alias + basename-relative path forms.

import { main } from '../scope-discovery/check-deprecations.js';

export async function checkDeprecations(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}
