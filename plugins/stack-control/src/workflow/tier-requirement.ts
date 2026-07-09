// The tasks frontend's single-source opinion (035 D2/FR-012). ONE source, two
// consumers: the block is INJECTED into the tasks backend's conversation at the
// `/stack-control:define` tasks seam (FR-002, mirroring how house-rules.ts is
// injected at the design seam) AND its canonical clauses are re-asserted verbatim
// in the static `tasks-template.md` (FR-011), with a drift test pinning the two
// together (FR-012). Keeping both off one block — and off the two exported
// `TIER_*_CLAUSE` constants — is what makes the tier requirement non-drifting.
//
// Parallel to src/workflow/house-rules.ts. Pure: no I/O; the installation's
// vocabulary is supplied by the caller (the `tier-vocab` verb), string in / out.
//
// The producing-side types (TierBuckets/TierVocab/TierVocabEntry/AbsentVocab)
// live HERE rather than in a sibling types file: they are small, this module is
// their first and primary consumer, and co-locating them with the single-source
// render keeps the seam's contract in one place (data-model.md § producing-side
// types). The later `tier-vocab` verb imports them from here.

import { rankOf } from '../execute/accepted-models.js';
import type { TierMap } from '../config/types.js';

/**
 * The three semantic heuristic buckets bound to concrete `tier_map` labels for one
 * installation (FR-004a). Produced by `bucketBindings`; consumed by the render
 * block's section (c) and the `tier-vocab` verb.
 */
export interface TierBuckets {
  /** The label whose resolved model has minimum capability rank. */
  readonly cheapest: string;
  /** The median-rank label (lower-middle on even counts; = `cheapest` on a two-label map). */
  readonly mid: string;
  /** The label whose resolved model has maximum capability rank. */
  readonly mostCapable: string;
}

/** One `tier_map` entry, decorated with its resolved model's capability rank. */
export interface TierVocabEntry {
  /** The `tier_map` key — an operator semantic label, never a model id (Principle III). */
  readonly label: string;
  /** The accepted model the label resolves to (∈ ACCEPTED_MODELS). */
  readonly model: string;
  /** The label's capability rank (index in MODEL_CAPABILITY_RANK), for traceability. */
  readonly rank: number;
}

/** The `tier-vocab` verb output when a `tier_map` IS configured (D1). */
export interface TierVocab {
  readonly configured: true;
  /** Absolute path to the resolved config (for advisories/traceability). */
  readonly configPath: string;
  readonly labels: readonly TierVocabEntry[];
  readonly buckets: TierBuckets;
}

/** The `tier-vocab` verb output when NO `tier_map` is configured (FR-009). */
export interface AbsentVocab {
  readonly configured: false;
  /** Absolute path where the operator adds a `tier_map` to fix the gap. */
  readonly configPath: string;
}

/**
 * Bind the three heuristic buckets (cheapest / mid / most-capable) to this
 * installation's actual `tier_map` labels (FR-004a). Pure, total, deterministic
 * for any label count/naming — the ordering never depends on `tier_map` key
 * insertion order.
 *
 * Algorithm (data-model.md § Tier ranking):
 *  1. Rank each label by `rankOf(model)`.
 *  2. Sort labels ascending by `(rank, label)` — tie-break on the label string so
 *     labels resolving to the same model still order deterministically.
 *  3. cheapest = sorted[0]; mostCapable = sorted[n-1];
 *     mid = sorted[floor((n-1)/2)] (lower-middle on even n).
 *     ⇒ two-label ⇒ mid = cheapest; single-label ⇒ all three equal.
 *
 * Fails loud (Principle V) via `rankOf` if a label resolves to a non-accepted
 * model — that would already have failed config validation upstream. Callers only
 * invoke this on a non-empty map (an empty `tier_map` is treated as absent by the
 * verb).
 */
export function bucketBindings(tierMap: TierMap): TierBuckets {
  const labels = Object.keys(tierMap);
  if (labels.length === 0) {
    throw new Error(
      'bucketBindings: called with an empty tier_map; an absent/empty map is the ' +
        "verb's `configured:false` case and must not reach the ranking function",
    );
  }

  const ranked = labels.map((label): { label: string; rank: number } => {
    const model = tierMap[label];
    if (model === undefined) {
      throw new Error(`bucketBindings: tier_map key "${label}" has no model value`);
    }
    return { label, rank: rankOf(model) };
  });
  ranked.sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : a.label < b.label ? -1 : a.label > b.label ? 1 : 0,
  );

  const n = ranked.length;
  const at = (index: number): string => {
    const entry = ranked[index];
    if (entry === undefined) {
      throw new Error(`bucketBindings: index ${index} out of range for ${n} labels`);
    }
    return entry.label;
  };
  return {
    cheapest: at(0),
    mid: at(Math.floor((n - 1) / 2)),
    mostCapable: at(n - 1),
  };
}

// ── Shared canonical constants (D5/FR-012) ──────────────────────────────────
// Single-sourced across the seam block (below) and the static tasks-template.md
// (asserted by tasks-template-drift.test.ts). Vocabulary-neutral by construction:
// no installation-specific label is interpolated here — the concrete binding is
// section (c), which is seam-only because a static template cannot carry one
// installation's labels.

/**
 * The canonical one-line statement of the `[tier:<label>]` syntax: it sits
 * alongside the `[P]`/`[US n]` sibling tags and is resolved by the installation's
 * `tier_map` at `resolve-tiers` time. Embedded verbatim in render section (a) and
 * in tasks-template.md's tier documentation.
 */
export const TIER_TAG_FORMAT_CLAUSE =
  'Tag every task with `[tier:<label>]`, placed alongside the existing `[P]` and ' +
  '`[US n]` tags (e.g. `- [ ] T001 [P] [US1] [tier:<label>] <description>`); the ' +
  'label is resolved to a model by the installation\'s `tier_map` at `resolve-tiers` time.';

/**
 * The canonical FR-004 heuristic sentence: mechanical / RED-test / doc-only work →
 * cheapest; standard implementation → mid; cross-cutting / architectural /
 * ambiguous / high-blast-radius work → most-capable. Guidance the generator
 * applies, not a hard rule. Embedded verbatim in render section (b) and in
 * tasks-template.md's tier documentation.
 */
export const TIER_HEURISTIC_CLAUSE =
  'Heuristic (guidance, not a hard rule): mechanical, RED-test-only, or doc-only ' +
  'tasks → the cheapest tier; standard implementation → the mid tier; ' +
  'cross-cutting, architectural, ambiguous, or high-blast-radius tasks → the ' +
  'most-capable tier.';

/** The versioned title of the injected block (provenance in the conversation). */
export const TIER_REQUIREMENT_ID = 'stack-control-model-tier-v1';

/**
 * Render the model-tier requirement as a markdown block for injection into the
 * `/speckit-tasks` backend conversation (FR-002). Keyed off THIS installation's
 * vocabulary so section (c) names the real labels (FR-004a) — mirrors
 * `renderHouseRules()`. The branch is switched on `vocab.configured`.
 */
export function renderTierRequirement(vocab: TierVocab | AbsentVocab): string {
  const lines = [`## stack-control model-tier requirement (${TIER_REQUIREMENT_ID})`, ''];

  // (a) Syntax — single-sourced, both branches.
  lines.push('**(a) Syntax.** ' + TIER_TAG_FORMAT_CLAUSE, '');
  // (b) Heuristic — single-sourced, both branches.
  lines.push('**(b) Heuristic.** ' + TIER_HEURISTIC_CLAUSE, '');

  if (vocab.configured) {
    // (c) Concrete binding for THIS installation.
    lines.push(
      '**(c) This installation binds the heuristic buckets to these labels:**',
      `- cheapest → \`${vocab.buckets.cheapest}\``,
      `- mid → \`${vocab.buckets.mid}\``,
      `- most-capable → \`${vocab.buckets.mostCapable}\``,
      '',
      'Propose ONLY labels declared in this installation\'s `tier_map` (each resolves to a model):',
    );
    for (const entry of vocab.labels) {
      lines.push(`- \`${entry.label}\` → \`${entry.model}\``);
    }
    lines.push('');
    // (d) Completeness instruction.
    lines.push(
      '**(d) Completeness.** Emit exactly one `[tier:<label>]` on EVERY task. A task ' +
        'that genuinely spans tiers still gets a single tier (operator override at ' +
        'execute is the escape hatch); never leave a task untagged or multi-tiered.',
    );
    return lines.join('\n');
  }

  // Absent branch (FR-009): no `tier_map` configured.
  lines.push(
    '**(c) No `tier_map` is configured for this installation**, so no concrete ' +
      'labels are available to propose.',
    '',
    '**(d) Emit `[tier:UNSET]` on EVERY task.** Do NOT invent a label and do NOT ' +
      'apply a silent default.',
    '',
    '> LOUD ADVISORY: no `tier_map` is configured. Tasks are being annotated with the ' +
      `unresolved sentinel \`[tier:UNSET]\`. Add a \`tier_map\` at \`${vocab.configPath}\` ` +
      'to bind labels to models. Generation is NOT blocked here, but the existing ' +
      '`resolve-tiers` floor rejects `UNSET` fail-loud at execute — so the gap surfaces ' +
      'again at execute time until the `tier_map` is added.',
  );
  return lines.join('\n');
}
