// `stackctl tier-vocab [--json]` (035 T009; contracts/tier-vocab-verb.md).
//
// The read-only, installation-scoped authoring-time analogue of `resolve-tiers`:
// resolve the enclosing installation, read its `tier_map`, and emit the tier
// vocabulary + derived `{cheapest, mid, mostCapable}` bucket bindings (FR-004a).
// The `/stack-control:define` tasks seam runs this BEFORE driving `/speckit-tasks`
// and injects `renderTierRequirement(<this output>)` into the backend conversation
// (FR-002). Read-only computation — reads config, emits to stdout, mutates nothing.
//
// Mirrors resolve-tiers.ts: strict arg parse (no flag silently ignored), fail-loud
// (Principle V). Unlike resolve-tiers it is installation-scoped, not spec-scoped —
// there is NO `--spec`; the installation is resolved by walking up from cwd
// (findInstallation, the established installation-anchor mechanism).

import { findInstallation } from '../config/installation.js';
import { rankOf } from '../execute/accepted-models.js';
import {
  bucketBindings,
  type AbsentVocab,
  type TierVocab,
  type TierVocabEntry,
} from '../workflow/tier-requirement.js';

interface Args {
  readonly json: boolean;
}

// Strict arg parsing: accept ONLY `--json`; reject an unknown flag or a stray
// positional with exit 2 (the dispatcher contract — no flag silently ignored).
function parseArgs(args: string[]): Args {
  let json = false;
  for (const token of args) {
    if (token === '--json') {
      json = true;
      continue;
    }
    process.stderr.write(
      `tier-vocab: unexpected argument '${token}' (usage: tier-vocab [--json])\n`,
    );
    process.exit(2);
  }
  return { json };
}

export async function runTierVocab(args: string[]): Promise<void> {
  parseArgs(args);

  // Installation-scoped: walk up from cwd to the nearest `.stack-control/config.yaml`.
  // A MALFORMED config throws here (findInstallation re-raises any non-'not-found'
  // InstallationError) → the dispatcher's top-level catch exits 1 with the loader's
  // prefixed message (no partial vocab — Principle V). An ABSENT installation is a
  // clean null we turn into a fail-loud exit-1 below.
  const installation = findInstallation(process.cwd());
  if (installation === null) {
    process.stderr.write(
      `tier-vocab: FATAL — no stack-control installation found from ${process.cwd()} ` +
        '(no .stack-control/config.yaml at or above it) — run `stackctl setup`\n',
    );
    process.exit(1);
  }

  const { configPath } = installation;
  const tierMap = installation.config.tierMap;

  // Absent OR empty `tier_map` (FR-009): emit `configured:false` + a LOUD advisory,
  // exit 0. Generation is NOT blocked — the seam still authors tasks tagged
  // `[tier:UNSET]`, and the existing `resolve-tiers` floor rejects UNSET fail-loud at
  // execute. exit 0 is deliberate so the define seam proceeds to the UNSET path.
  if (tierMap === undefined || Object.keys(tierMap).length === 0) {
    const absent: AbsentVocab = { configured: false, configPath };
    process.stdout.write(`${JSON.stringify(absent)}\n`);
    process.stderr.write(
      `tier-vocab: no tier_map is configured for this installation; add a tier_map at ` +
        `${configPath} to bind labels to models. Generation is NOT blocked — tasks are ` +
        'tagged `[tier:UNSET]` and rejected fail-loud by resolve-tiers at execute.\n',
    );
    process.exit(0);
  }

  // Configured: decorate each label with its resolved model + capability rank
  // (insertion order preserved), and derive the heuristic bucket bindings. `rankOf`
  // + `bucketBindings` fail loud on a non-accepted model — one already caught by
  // config validation, so this is defense-in-depth, never the primary gate.
  const labels: TierVocabEntry[] = Object.keys(tierMap).map((label): TierVocabEntry => {
    const model = tierMap[label];
    if (model === undefined) {
      throw new Error(`tier-vocab: tier_map key "${label}" has no model value`);
    }
    return { label, model, rank: rankOf(model) };
  });
  const vocab: TierVocab = {
    configured: true,
    configPath,
    labels,
    buckets: bucketBindings(tierMap),
  };
  process.stdout.write(`${JSON.stringify(vocab)}\n`);
}
