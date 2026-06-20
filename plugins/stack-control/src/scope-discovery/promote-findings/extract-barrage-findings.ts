/**
 * plugins/stack-control/src/scope-discovery/promote-findings/extract-barrage-findings.ts
 *
 * Phase 15 Task 2 — audit-barrage finding extraction library.
 *
 * Walks an `audit-runs/<timestamp>-<feature>/` directory of per-model
 * markdown files (`claude.md`, `codex.md`, `gemini.md`, ...) and emits
 * a deduplicated list of `ExtractedFinding` records, with cross-model
 * agreement detection merging matching findings across models.
 *
 * The per-model markdown shape is fixed by the audit-barrage prompt
 * template (`templates/audit-barrage-prompt.md`): each finding is a
 * `### <heading>` block followed by `Finding-ID:`, `Status:`,
 * `Severity:`, `Surface:` field lines and a free-form body.
 *
 * Agreement heuristic (specs/014 US3 — mechanism-aware): union requires
 * heading substring overlap of ≥ 12 chars (case-insensitive,
 * punctuation-stripped) — the mechanism proxy that catches paraphrased
 * findings about the same root cause. A shared repo-relative path token
 * in the Surface field alone NEVER unions: surface adjacency is not
 * agreement, and the pre-014 `|| surfacesAgree()` key collapsed five
 * distinct mechanisms at one surface into a single entry documenting
 * only one of them (TASK-12 / gh-440).
 *
 * Same-root-cause findings cluster transitively: A↔B + B↔C → {A, B, C}.
 *
 * `INDEX.md` and `PROMPT.md` are skipped (they're metadata, not model
 * output). Files that fail to parse any finding blocks emit a warning
 * via the injectable `warn` sink (default: `console.warn`); other
 * model files are still processed.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { computeClusterSeverity, SEVERITY_RANK } from './cluster-severity.js';
import { adjudicate } from './adjudicate-findings.js';
import type {
  ClusterSeverityDecision,
  PerLaneSeverity,
} from './cluster-severity-types.js';

const FIELD_LINE_RE = /^([A-Za-z][A-Za-z-]+):\s*(.+?)\s*$/;
const HEADING_LINE_RE = /^###\s+(.+?)\s*$/;
const MIN_HEADING_SUBSTRING_LEN = 12;
const CANONICAL_SEVERITIES: ReadonlySet<NormalizedSeverity> = new Set([
  'blocking',
  'high',
  'medium',
  'low',
  'informational',
]);
// specs/015 (T011): a finding whose prose names a consistency seam / prior-round
// fix-code is a candidate for the adjudication re-score (D2) when it survives D1
// as a single-lane HIGH+.
const RESIDUAL_INFLATION_RE =
  /\b(seam|consistency|fix.?code|prior round|previous round|round \d+|the fix)\b/i;

export type NormalizedSeverity =
  | 'blocking'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

export interface RawModelFinding {
  readonly model: string;
  readonly findingId: string;
  readonly heading: string;
  readonly severity: NormalizedSeverity;
  readonly surface: string;
  readonly body: string;
  readonly isClean: boolean;
}

export interface ExtractedFinding {
  readonly heading: string;
  /**
   * specs/015 (FR-001): now the cluster's GATE-COUNTED severity (cross-lane
   * agreement + adjudication), NOT max-of-cluster. The dampener reads this line
   * unchanged; only how it is computed changed.
   */
  readonly severity: NormalizedSeverity;
  readonly surface: string;
  readonly body: string;
  readonly sourceModels: readonly string[];
  readonly sourceFindingIds: readonly string[];
  /** Existence clustering (≥2 lanes flagged it) — ORTHOGONAL to severity (FR-003). */
  readonly crossModelAgreement: boolean;
  /** specs/015 (FR-002): every covering lane's raw severity, preserved on disk. */
  readonly perLaneSeverities: readonly PerLaneSeverity[];
  /** specs/015 (FR-002): how `severity` was derived (rule + per-lane inputs + basis). */
  readonly severityDecision: ClusterSeverityDecision;
}

export interface ExtractBarrageFindingsArgs {
  readonly runDir: string;
  readonly warn?: (message: string) => void;
  /**
   * specs/014 FR-007: when provided, only model files whose stem is in
   * this set are parsed. The lift passes the COMPLETED lanes from the
   * run's INDEX terminal states — a killed/failed lane's partial capture
   * is forensics, never findings. Absent → every model file (pre-014
   * run-dir compatibility).
   */
  readonly includeModels?: ReadonlySet<string>;
}

export function normalizeSeverity(raw: string): NormalizedSeverity {
  const lowered = raw.trim().toLowerCase();
  if (CANONICAL_SEVERITIES.has(lowered as NormalizedSeverity)) {
    return lowered as NormalizedSeverity;
  }
  // Per AUDIT-20260530-11: distinguish "non-canonical token"
  // (e.g. `critical`, `urgent` — a model JUDGMENT in non-canonical
  // vocabulary) from "empty/whitespace severity" (a parse artifact
  // — the model didn't supply a severity at all). The first should
  // fall back to `high` per AUDIT-20260530-01 ("fail toward
  // attention"); the second to `medium` so a malformed empty-severity
  // finding doesn't inflate a cross-model cluster's max-of-cluster
  // severity by masquerading as a model-asserted high. Medium is
  // surfaced but not top-of-queue.
  if (lowered.length === 0) {
    return 'medium';
  }
  return 'high';
}

/**
 * specs/029 US3 (FR-019): THE single heading normalizer — lowercase,
 * punctuation→space, whitespace-collapsed. Shared by the cross-model
 * cluster-merge (`headingsAgree`) AND the finding-signature
 * (`findingSignature`); there is exactly one, never a second.
 */
export function normalizeHeading(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * specs/029 US3 (FR-019): the primary file path of a finding's `Surface:`
 * field — the FIRST path token, with any trailing line locator stripped.
 * Surfaces list one or more refs separated by `;` or `,`, and the audit-barrage
 * prompt has models emit a variety of locator shapes: `path:89`, `path:89:3`
 * (line:col), and `path:89-91` (line RANGE — AUDIT-BARRAGE-codex-02). All must
 * reduce to the same `path` so the same finding on the same file gets ONE
 * signature regardless of which line range a model reported. The trailing
 * `:N(-N|:N)*` group strips every line/col/range tail.
 */
export function primaryFilePath(surface: string): string {
  const first = surface.split(/[;,]/)[0]?.trim() ?? '';
  // Unwrap optional markdown code-span delimiters (`` `path:line` ``) before
  // stripping the locator — audit-log surfaces sometimes wrap the ref in
  // backticks (AUDIT-BARRAGE-codex, phase-3). Without this the trailing backtick
  // defeats the `:N…$` strip, so the same finding gets different signatures
  // depending on whether a model/section backticked the surface.
  const unwrapped = first.replace(/^`+/, '').replace(/`+$/, '').trim();
  return unwrapped.replace(/:\d+(?:[:-]\d+)*\s*$/, '').trim();
}

/**
 * specs/029 US3 (FR-019): the finding-signature — the tuple
 * `(normalized-heading, primary-file-path)` as a stable string key. Used by
 * the dampener identity-key (FR-009) and the lift cross-run dedup (FR-016). The
 * components join with a space; the join is unambiguous because a normalized
 * heading is only `[a-z0-9 ]` while a file path carries `/`/`.`/`-` — the path
 * portion is always distinguishable from the heading text.
 */
export function findingSignature(heading: string, surface: string): string {
  return `${normalizeHeading(heading)} ${primaryFilePath(surface)}`;
}

function headingsAgree(a: string, b: string): boolean {
  const sa = normalizeHeading(a);
  const sb = normalizeHeading(b);
  if (sa.length < MIN_HEADING_SUBSTRING_LEN || sb.length < MIN_HEADING_SUBSTRING_LEN) {
    return false;
  }
  const [shorter, longer] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  for (let start = 0; start + MIN_HEADING_SUBSTRING_LEN <= shorter.length; start += 1) {
    const window = shorter.slice(start, start + MIN_HEADING_SUBSTRING_LEN);
    if (longer.includes(window)) return true;
  }
  return false;
}

export function parseModelMarkdown(text: string, model: string): RawModelFinding[] {
  const lines = text.split(/\r?\n/);
  const blocks: { headingLineIndex: number; heading: string }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const m = HEADING_LINE_RE.exec(line);
    if (m !== null) {
      blocks.push({ headingLineIndex: i, heading: m[1]!.trim() });
    }
  }

  const findings: RawModelFinding[] = [];
  for (let bi = 0; bi < blocks.length; bi += 1) {
    const block = blocks[bi]!;
    const endLineIndex =
      bi + 1 < blocks.length ? blocks[bi + 1]!.headingLineIndex : lines.length;
    const fields = new Map<string, string>();
    let fieldsEndIndex = block.headingLineIndex + 1;
    for (let li = block.headingLineIndex + 1; li < endLineIndex; li += 1) {
      const raw = lines[li] ?? '';
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        if (fields.size > 0) {
          fieldsEndIndex = li;
          break;
        }
        continue;
      }
      const fm = FIELD_LINE_RE.exec(raw);
      if (fm !== null) {
        const key = fm[1]!.toLowerCase();
        if (!fields.has(key)) fields.set(key, fm[2]!);
        fieldsEndIndex = li + 1;
      } else {
        if (fields.size > 0) {
          fieldsEndIndex = li;
          break;
        }
      }
    }

    const findingId = fields.get('finding-id');
    if (findingId === undefined) continue;
    const severityRaw = fields.get('severity') ?? '';
    const surface = fields.get('surface') ?? '';
    const body = lines
      .slice(fieldsEndIndex, endLineIndex)
      .join('\n')
      .replace(/^\s+|\s+$/g, '');
    const isClean = /-CLEAN$/i.test(findingId);
    findings.push({
      model,
      findingId,
      heading: block.heading,
      severity: normalizeSeverity(severityRaw),
      surface,
      body,
      isClean,
    });
  }

  return findings;
}

function clusterFindings(
  rawFindings: readonly RawModelFinding[],
): RawModelFinding[][] {
  const parent = rawFindings.map((_, i) => i);
  const find = (i: number): number => {
    let cur = i;
    while (parent[cur] !== cur) cur = parent[cur]!;
    let walk = i;
    while (parent[walk] !== cur) {
      const next = parent[walk]!;
      parent[walk] = cur;
      walk = next;
    }
    return cur;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let i = 0; i < rawFindings.length; i += 1) {
    for (let j = i + 1; j < rawFindings.length; j += 1) {
      const fi = rawFindings[i]!;
      const fj = rawFindings[j]!;
      if (fi.model === fj.model) continue;
      // specs/014 US3: heading agreement (the mechanism proxy) is the
      // ONLY union key — surface agreement alone never merges.
      if (headingsAgree(fi.heading, fj.heading)) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, RawModelFinding[]>();
  for (let i = 0; i < rawFindings.length; i += 1) {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(rawFindings[i]!);
    clusters.set(root, list);
  }
  return Array.from(clusters.values());
}

/**
 * Collapse a cluster to one per-lane severity each: a lane that raised several
 * findings in the cluster contributes its HIGHEST label (the lane's own
 * worst-case assessment is its vote). Ordered by model for a stable record.
 */
function perLaneSeverities(cluster: readonly RawModelFinding[]): PerLaneSeverity[] {
  const byModel = new Map<string, NormalizedSeverity>();
  for (const f of cluster) {
    const prev = byModel.get(f.model);
    if (prev === undefined || SEVERITY_RANK[f.severity] > SEVERITY_RANK[prev]) {
      byModel.set(f.model, f.severity);
    }
  }
  return Array.from(byModel.entries())
    .sort((a, b) => (a[0] === b[0] ? 0 : a[0] < b[0] ? -1 : 1))
    .map(([model, severity]) => ({ model, severity }));
}

/** The dominant (highest) severity any covering lane assigned the cluster. */
function dominantLaneSeverity(perLane: readonly PerLaneSeverity[]): NormalizedSeverity {
  let top: NormalizedSeverity = 'informational';
  for (const p of perLane) {
    if (SEVERITY_RANK[p.severity] > SEVERITY_RANK[top]) top = p.severity;
  }
  return top;
}

/**
 * specs/015 (T011 / FR-001): the cluster's gate-counted severity is computed by
 * cross-lane agreement (D1), then a residual single-lane HIGH+ on a
 * consistency-seam / fix-code finding is re-scored by adjudication (D2). The
 * per-lane inputs and the decision are preserved on the finding (FR-002). The
 * retired behavior (max-of-cluster, per-lane discarded) is gone.
 */
function mergeCluster(cluster: readonly RawModelFinding[]): ExtractedFinding {
  const sortedCluster = [...cluster].sort((a, b) =>
    a.model === b.model ? 0 : a.model < b.model ? -1 : 1,
  );
  const sourceModels = Array.from(new Set(sortedCluster.map((f) => f.model)));
  const sourceFindingIds = sortedCluster.map((f) => f.findingId);
  const representative = cluster[0]!;

  const perLane = perLaneSeverities(cluster);
  let decision = computeClusterSeverity(perLane);
  // D2: a single-lane HIGH+ that survived agreement and reads as a
  // consistency-seam / prior-round fix-code finding is re-scored on its own
  // blast-radius / reachability / fix-debt evidence (the 014 AUDIT-19/-21 shape).
  // A genuine ≥2-lane agreed HIGH (rule === 'agreement') is NOT adjudicated — it
  // must keep blocking (SC-003).
  if (
    decision.rule === 'single-model' &&
    SEVERITY_RANK[decision.gateCountedSeverity] >= SEVERITY_RANK.high &&
    RESIDUAL_INFLATION_RE.test(representative.body)
  ) {
    decision = adjudicate({ perLane, body: representative.body });
  } else if (
    // AUDIT-20260612-02 (disagreement floor): agreement de-inflates intra-cluster
    // DISagreement, but a WIDE spread — the dominant lane ≥2 severity levels above
    // the agreement floor, e.g. [high, informational] → informational — can erase
    // a genuine HIGH one lane caught and another rated near-absent. That is the
    // inverse of SC-003 (unbounded LOWERING into an unattended gate). Route the
    // wide-spread clusters through adjudication so the dominant severity is
    // re-scored on the body's blast-radius / reachability / fix-debt evidence
    // (kept when the body reads reachable+high-blast; calibrated to ≤medium only on
    // low-blast/unreachable/fix-debt) — never silently floored to informational.
    // A 1-level spread ([high, medium] → medium) is intentional agreement and is
    // NOT adjudicated. D1's "don't over-suppress a real HIGH another lane missed."
    decision.rule === 'agreement' &&
    SEVERITY_RANK[dominantLaneSeverity(perLane)] - SEVERITY_RANK[decision.gateCountedSeverity] >= 2
  ) {
    // Re-score on the DOMINANT lane's body — the prose justifying the HIGH claim
    // under scrutiny — not cluster[0] (whose order is read-dependent). A dismissive
    // lower lane's prose must not be the evidence that suppresses a real HIGH.
    const dominant = cluster.reduce(
      (best, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[best.severity] ? f : best),
      cluster[0]!,
    );
    decision = adjudicate({ perLane, body: dominant.body });
  }

  return {
    heading: representative.heading,
    severity: decision.gateCountedSeverity,
    surface: representative.surface,
    body: representative.body,
    sourceModels,
    sourceFindingIds,
    crossModelAgreement: sourceModels.length >= 2,
    perLaneSeverities: perLane,
    severityDecision: decision,
  };
}

export async function extractBarrageFindings(
  args: ExtractBarrageFindingsArgs,
): Promise<ExtractedFinding[]> {
  const warn = args.warn ?? ((m) => console.warn(m));
  if (!existsSync(args.runDir)) return [];

  const entries = await readdir(args.runDir);
  const modelFiles = entries
    .filter((name) => name.endsWith('.md'))
    .filter((name) => {
      const base = basename(name).toLowerCase();
      return base !== 'index.md' && base !== 'prompt.md';
    })
    .filter(
      (name) =>
        args.includeModels === undefined ||
        args.includeModels.has(name.replace(/\.md$/i, '')),
    )
    .sort();

  const allFindings: RawModelFinding[] = [];
  for (const file of modelFiles) {
    const modelName = file.replace(/\.md$/i, '');
    const text = await readFile(join(args.runDir, file), 'utf8');
    const parsed = parseModelMarkdown(text, modelName);
    const nonClean = parsed.filter((f) => !f.isClean);
    if (parsed.length === 0) {
      warn(
        `extractBarrageFindings: no finding blocks parsed from ${file} (model: ${modelName}). Skipping.`,
      );
      continue;
    }
    allFindings.push(...nonClean);
  }

  if (allFindings.length === 0) return [];

  const clusters = clusterFindings(allFindings);
  return clusters.map(mergeCluster);
}
