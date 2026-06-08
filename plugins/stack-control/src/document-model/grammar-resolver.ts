// Grammar resolution + artifact parsing (FR-001/FR-012, research risk #3).
//
// A grammar artifact is a YAML metadata header (`---` … `---`) declaring the
// vocab/order/marker/hook the PEG cannot carry as data, followed by the PEG
// body that parses the normalized block stream into Units. The resolver finds
// the artifact (embedded → project override → built-in → fail loud) and turns
// it into a validated GrammarSpec. A malformed artifact fails loud with a
// clean, located message — never a crash.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { detectFrontmatter, embeddedGrammar } from './chrome.js';
import {
  DocumentModelError,
  type GrammarSource,
  type GrammarSpec,
  type IdentifierRule,
  type OrderKey,
  type ReconciliationHook,
  type UnitMarker,
} from './types.js';

export interface ResolveOptions {
  /** Project override dir (`.stack-control/grammars/`); checked first if set. */
  readonly projectGrammarDir?: string;
  /** Built-in default dir (`plugins/stack-control/grammars/`). */
  readonly builtinGrammarDir: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reqString(obj: Record<string, unknown>, key: string, ctx: string): string {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    throw new DocumentModelError(`grammar ${ctx}: field \`${key}\` must be a non-empty string`);
  }
  return v;
}

function reqStringArray(obj: Record<string, unknown>, key: string, ctx: string): string[] {
  const v = obj[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new DocumentModelError(`grammar ${ctx}: field \`${key}\` must be a string array`);
  }
  return v as string[];
}

function parseUnit(raw: unknown, ctx: string): UnitMarker {
  if (!isRecord(raw)) throw new DocumentModelError(`grammar ${ctx}: \`unit\` must be a mapping`);
  const kind = raw.kind;
  if (kind === 'heading') {
    const level = raw.level;
    if (typeof level !== 'number' || level < 1 || level > 6) {
      throw new DocumentModelError(`grammar ${ctx}: heading \`unit.level\` must be 1–6`);
    }
    return { kind: 'heading', level };
  }
  if (kind === 'row') {
    const idc = raw.identifierColumn;
    const sc = raw.statusColumn;
    if (typeof idc !== 'number' || typeof sc !== 'number') {
      throw new DocumentModelError(
        `grammar ${ctx}: row \`unit\` requires numeric identifierColumn + statusColumn`,
      );
    }
    return { kind: 'row', identifierColumn: idc, statusColumn: sc };
  }
  throw new DocumentModelError(`grammar ${ctx}: \`unit.kind\` must be 'heading' or 'row'`);
}

function parseOrderKey(raw: unknown, ctx: string): OrderKey {
  if (!isRecord(raw)) throw new DocumentModelError(`grammar ${ctx}: \`orderKey\` must be a mapping`);
  const field = reqString(raw, 'field', ctx);
  const relation = reqStringArray(raw, 'relation', ctx);
  if (relation.length === 0) {
    // FR-004: a categorical order key MUST declare a non-empty ordering
    // relation; lexicographic is never assumed.
    throw new DocumentModelError(
      `grammar ${ctx}: \`orderKey.relation\` must declare a non-empty ordered enumeration (lexicographic is never assumed)`,
    );
  }
  return { field, relation };
}

function parseIdentifier(raw: unknown, ctx: string): IdentifierRule {
  if (!isRecord(raw)) throw new DocumentModelError(`grammar ${ctx}: \`identifier\` must be a mapping`);
  const kind = raw.kind;
  if (kind !== 'slug' && kind !== 'title') {
    throw new DocumentModelError(`grammar ${ctx}: \`identifier.kind\` must be 'slug' or 'title'`);
  }
  return { kind };
}

function parseHook(raw: unknown, ctx: string): ReconciliationHook | null {
  if (raw === null || raw === undefined) return null;
  if (!isRecord(raw)) throw new DocumentModelError(`grammar ${ctx}: \`reconciliationHook\` must be a mapping or null`);
  const kind = raw.kind;
  if (kind !== 'command' && kind !== 'glob') {
    throw new DocumentModelError(`grammar ${ctx}: \`reconciliationHook.kind\` must be 'command' or 'glob'`);
  }
  return { kind, source: reqString(raw, 'source', ctx) };
}

/** Parse a grammar artifact (YAML metadata header + PEG body) into a spec. */
export function parseGrammarArtifact(text: string, source: GrammarSource): GrammarSpec {
  const lines = text.split('\n');
  const fm = detectFrontmatter(lines);
  if (fm === null) {
    throw new DocumentModelError(
      `grammar artifact (${source}): missing \`---\` metadata header (id/unit/statusVocabulary/orderKey/identifier)`,
    );
  }
  const metaText = lines.slice(fm.start + 1, fm.end).join('\n');
  const pegText = lines.slice(fm.end + 1).join('\n').trim();
  if (pegText.length === 0) {
    throw new DocumentModelError(`grammar artifact (${source}): empty PEG body after metadata header`);
  }
  let metaUnknown: unknown;
  try {
    metaUnknown = parseYaml(metaText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DocumentModelError(`grammar artifact (${source}): metadata is not valid YAML — ${msg}`);
  }
  if (!isRecord(metaUnknown)) {
    throw new DocumentModelError(`grammar artifact (${source}): metadata must be a YAML mapping`);
  }
  const id = reqString(metaUnknown, 'id', source);
  const statusVocabulary = reqStringArray(metaUnknown, 'statusVocabulary', id);
  const terminalStatuses = reqStringArray(metaUnknown, 'terminalStatuses', id);
  for (const t of terminalStatuses) {
    if (!statusVocabulary.includes(t)) {
      throw new DocumentModelError(
        `grammar ${id}: terminal status '${t}' is not in statusVocabulary (FR-004: terminal ⊆ vocabulary)`,
      );
    }
  }
  const orderKey = parseOrderKey(metaUnknown.orderKey, id);
  return {
    id,
    source,
    pegText,
    unit: parseUnit(metaUnknown.unit, id),
    statusVocabulary,
    terminalStatuses,
    orderKey,
    identifierProduction: parseIdentifier(metaUnknown.identifier, id),
    reconciliationHook: parseHook(metaUnknown.reconciliationHook, id),
  };
}

/**
 * Read a `doc-grammar: <id>` reference from the document frontmatter.
 *
 * Returns null only when there is genuinely no usable grammar ref: no leading
 * frontmatter at all, or frontmatter that PARSES cleanly but carries no
 * `doc-grammar` key. A present-but-malformed frontmatter block is a
 * configuration parse failure, NOT an absent grammar — it fails loud
 * (FR-010 / Constitution Principle V) so the operator is pointed at the broken
 * YAML, not misdirected to "add a grammar". (AUDIT-20260608-35.)
 */
function frontmatterRef(source: string): string | null {
  const lines = source.split('\n');
  const fm = detectFrontmatter(lines);
  if (fm === null) return null;
  let parsed: unknown;
  try {
    parsed = parseYaml(lines.slice(fm.start + 1, fm.end).join('\n'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new DocumentModelError(
      `document has a leading \`---\` frontmatter block but its YAML is malformed and cannot be parsed — ${msg}; fix the frontmatter YAML (this is a parse failure, not a missing grammar)`,
    );
  }
  if (!isRecord(parsed)) return null;
  const ref = parsed['doc-grammar'];
  return typeof ref === 'string' && ref.length > 0 ? ref : null;
}

/**
 * Resolve a document's grammar: embedded → project override → built-in default
 * → fail loud (FR-001). When both an embedded block and a frontmatter ref are
 * present, embedded wins. More than one embedded declaration is a fail-loud
 * ambiguity (enforced in `embeddedGrammar`).
 */
export function resolveGrammar(source: string, opts: ResolveOptions): GrammarSpec {
  const embedded = embeddedGrammar(source);
  if (embedded !== null) {
    return parseGrammarArtifact(embedded.grammarText, 'embedded');
  }

  const ref = frontmatterRef(source);
  if (ref === null) {
    throw new DocumentModelError('document declares no grammar; not governable');
  }

  if (opts.projectGrammarDir !== undefined) {
    const overridePath = join(opts.projectGrammarDir, `${ref}.peg`);
    if (existsSync(overridePath)) {
      return parseGrammarArtifact(readFileSync(overridePath, 'utf8'), 'project-override');
    }
  }
  const builtinPath = join(opts.builtinGrammarDir, `${ref}.peg`);
  if (existsSync(builtinPath)) {
    return parseGrammarArtifact(readFileSync(builtinPath, 'utf8'), 'builtin');
  }
  throw new DocumentModelError(
    `document references grammar '${ref}', but no \`${ref}.peg\` was found in the project override or built-in grammar directory; not governable`,
  );
}
