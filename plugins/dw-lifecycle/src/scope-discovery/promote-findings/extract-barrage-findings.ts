/**
 * plugins/dw-lifecycle/src/scope-discovery/promote-findings/extract-barrage-findings.ts
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
 * Agreement heuristic (mirrors the spirit of
 * `cross-reference-audit-run.ts`):
 *
 *   - heading substring overlap of ≥ 12 chars (case-insensitive,
 *     punctuation-stripped) — catches paraphrased findings about the
 *     same root cause; OR
 *   - shared repo-relative path token in the Surface field — catches
 *     findings that name the same file regardless of heading wording.
 *
 * Two findings cluster transitively: A↔B + B↔C → {A, B, C}.
 *
 * `INDEX.md` and `PROMPT.md` are skipped (they're metadata, not model
 * output). Files that fail to parse any finding blocks emit a warning
 * via the injectable `warn` sink (default: `console.warn`); other
 * model files are still processed.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';

const FIELD_LINE_RE = /^([A-Za-z][A-Za-z-]+):\s*(.+?)\s*$/;
const HEADING_LINE_RE = /^###\s+(.+?)\s*$/;
const PATH_TOKEN_RE = /[A-Za-z0-9_./-]*\/[A-Za-z0-9_./-]+\.[a-z]{1,5}/g;
const MIN_HEADING_SUBSTRING_LEN = 12;
const CANONICAL_SEVERITIES: ReadonlySet<NormalizedSeverity> = new Set([
  'blocking',
  'high',
  'medium',
  'low',
  'informational',
]);
const SEVERITY_RANK: Record<NormalizedSeverity, number> = {
  blocking: 4,
  high: 3,
  medium: 2,
  low: 1,
  informational: 0,
};

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
  readonly severity: NormalizedSeverity;
  readonly surface: string;
  readonly body: string;
  readonly sourceModels: readonly string[];
  readonly sourceFindingIds: readonly string[];
  readonly crossModelAgreement: boolean;
}

export interface ExtractBarrageFindingsArgs {
  readonly runDir: string;
  readonly warn?: (message: string) => void;
}

export function normalizeSeverity(raw: string): NormalizedSeverity {
  const lowered = raw.trim().toLowerCase();
  if (CANONICAL_SEVERITIES.has(lowered as NormalizedSeverity)) {
    return lowered as NormalizedSeverity;
  }
  // Per AUDIT-20260530-01: an unknown-severity fallback to
  // `informational` (rank 0) actively defeats the feature's purpose —
  // it buries `critical` (the most likely model deviation) AND a
  // cross-model `critical` agreement collapses to rank 0 via
  // max-of-cluster. The safer fallback is `high`: "fail toward
  // attention, not away from it." Empty severity (malformed model
  // output / missing field) is also treated as `high` because a
  // missing severity field is itself a signal the operator should see.
  return 'high';
}

function stripHeading(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractPathTokens(surface: string): Set<string> {
  const tokens = surface.match(PATH_TOKEN_RE);
  return new Set(tokens ?? []);
}

function headingsAgree(a: string, b: string): boolean {
  const sa = stripHeading(a);
  const sb = stripHeading(b);
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

function surfacesAgree(a: string, b: string): boolean {
  const ta = extractPathTokens(a);
  if (ta.size === 0) return false;
  const tb = extractPathTokens(b);
  for (const tok of ta) {
    if (tb.has(tok)) return true;
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
      if (headingsAgree(fi.heading, fj.heading) || surfacesAgree(fi.surface, fj.surface)) {
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

function mergeCluster(cluster: readonly RawModelFinding[]): ExtractedFinding {
  const sortedCluster = [...cluster].sort((a, b) =>
    a.model === b.model ? 0 : a.model < b.model ? -1 : 1,
  );
  const sourceModels = Array.from(new Set(sortedCluster.map((f) => f.model)));
  const sourceFindingIds = sortedCluster.map((f) => f.findingId);
  const representative = cluster[0]!;
  let highestSeverity: NormalizedSeverity = representative.severity;
  for (const f of cluster) {
    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[highestSeverity]) {
      highestSeverity = f.severity;
    }
  }
  return {
    heading: representative.heading,
    severity: highestSeverity,
    surface: representative.surface,
    body: representative.body,
    sourceModels,
    sourceFindingIds,
    crossModelAgreement: sourceModels.length >= 2,
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
