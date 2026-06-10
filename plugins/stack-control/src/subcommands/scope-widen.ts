// `stackctl scope-widen` (010 / US3) — mid-implementation scope widening.
//
// Thin dispatch shim over the ported `scope-widen` module's library entry
// (`scopeWidenMain`), which takes a free-text operator complaint, re-runs the
// four universal discovery agents against the complaint-augmented PRD, deltas
// the new manifest against the prior one on disk, and surfaces the additive
// NEW surfaces the original inventory missed. Default is DRY-RUN; `--apply`
// merges the delta into the manifest. The verb is the vendor-neutral core
// (FR-016): runnable in a plain shell.
//
// Exit codes (owned by scopeWidenMain):
//   0 — delta computed (manifest updated when --apply)
//   1 — schema-validation failure on the re-synthesized manifest
//   2 — CLI parse / missing prior manifest or PRD / agent failure

import { scopeWidenMain } from '../scope-discovery/scope-widen.js';

export async function runScopeWiden(args: string[]): Promise<void> {
  const code = await scopeWidenMain(args);
  process.exit(code);
}
