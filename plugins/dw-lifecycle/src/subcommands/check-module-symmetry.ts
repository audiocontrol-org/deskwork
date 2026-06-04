// Dispatch shim — see scope-discovery/check-module-symmetry.ts for
// the flag + exit-code contract. Routes the canonical `dw-lifecycle
// check-module-symmetry` subcommand AND its deprecated alias `check-
// editor-symmetry` (kept for one release cycle per Phase 25 Task 5)
// into the scanner's `main(argv)`. The alias shim stderr-prints a
// deprecation warning before dispatching; the canonical handler is
// silent.

import { main } from '../scope-discovery/check-module-symmetry.js';

// Removal target for the legacy alias. Phase 25 ships at the next
// minor; the alias retires at the following minor. Adopters who run
// `dw-lifecycle check-editor-symmetry` see this version in the stderr
// hint, so the alias's lifetime is auditable from the warning alone.
const LEGACY_ALIAS_REMOVAL_VERSION = 'v0.37.0';

export async function checkModuleSymmetry(args: string[]): Promise<void> {
  const code = await main(args);
  process.exit(code);
}

export async function checkEditorSymmetryDeprecated(args: string[]): Promise<void> {
  process.stderr.write(
    `dw-lifecycle: \`check-editor-symmetry\` is deprecated; ` +
      `use \`check-module-symmetry\`. ` +
      `Removal target: ${LEGACY_ALIAS_REMOVAL_VERSION}.\n`,
  );
  const code = await main(args);
  process.exit(code);
}
