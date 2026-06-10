// `stackctl scope-inventory` (010 / US3) — upfront scope discovery.
//
// Thin dispatch shim over the ported `scope-inventory` module's library entry
// (`scopeInventoryMain`), which fans the four universal discovery agents (plus
// any config-activated agents whose registry gate files are present) in
// parallel, synthesizes the strawman scope-manifest, validates it against the
// schema, and writes the manifest + per-agent run-evidence trail. The verb is
// the vendor-neutral core (FR-015): runnable in a plain shell.
//
// Exit codes (owned by scopeInventoryMain):
//   0 — manifest written + schema-validated
//   2 — CLI parse / missing PRD / agent failure / schema-validation failure
//       (the verb couldn't produce a manifest)

import { scopeInventoryMain } from '../scope-discovery/scope-inventory.js';

export async function runScopeInventory(args: string[]): Promise<void> {
  const code = await scopeInventoryMain(args);
  process.exit(code);
}
