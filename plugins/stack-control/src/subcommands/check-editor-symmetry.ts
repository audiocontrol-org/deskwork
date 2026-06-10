// `stackctl check-editor-symmetry` (010 / US4) — DEPRECATED alias for
// `stackctl check-module-symmetry`, preserved for one release cycle per the
// rename contract (mirrors dw-lifecycle's Phase 25 `check-editor-symmetry`
// deprecation alias; removal target tracked separately). Emits a one-line
// deprecation notice to stderr, then forwards verbatim to the module-symmetry
// verb's CLI entry — same flags, same exit codes.

import { main } from '../scope-discovery/check-module-symmetry.js';

export async function runCheckEditorSymmetry(args: string[]): Promise<void> {
  process.stderr.write(
    'stackctl check-editor-symmetry: deprecated alias — use `stackctl check-module-symmetry`.\n',
  );
  const code = await main(args);
  process.exit(code);
}
