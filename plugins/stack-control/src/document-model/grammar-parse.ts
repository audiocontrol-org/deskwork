// Compile a grammar's PEG, parse the normalized block stream into typed Units,
// and back-map each Unit's normalized span to its original markdown line range
// (FR-002/FR-003/FR-010, research risk #3).
//
// A malformed grammar (compile failure) and a document that does not parse both
// fail loud with a clean, LOCATED message — never a crash. Status is validated
// against the grammar's declared vocabulary (FR-004).

import peggy from 'peggy';
import { extractEdges } from './edges.js';
import {
  DocumentModelError,
  type BlockStream,
  type GrammarSpec,
  type Span,
  type Unit,
} from './types.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A PEG location, when the error carries one (peggy compile + syntax errors). */
function locationSuffix(err: unknown): string {
  if (!isRecord(err)) return '';
  const loc = err['location'];
  if (!isRecord(loc)) return '';
  const start = loc['start'];
  if (!isRecord(start)) return '';
  const { line, column } = start;
  if (typeof line === 'number' && typeof column === 'number') {
    return ` (at normalized line ${line}:${column})`;
  }
  return '';
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface RawUnit {
  identifier: string;
  status: string;
  orderValue: string;
  startLine: number;
  endLine: number;
}

function asRawUnit(value: unknown, grammarId: string): RawUnit {
  if (!isRecord(value)) {
    throw new DocumentModelError(`grammar ${grammarId}: a Unit production returned a non-object`);
  }
  const { identifier, status, orderValue, startLine, endLine } = value;
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new DocumentModelError(`grammar ${grammarId}: a Unit has no identifier`);
  }
  if (typeof startLine !== 'number' || typeof endLine !== 'number') {
    throw new DocumentModelError(`grammar ${grammarId}: Unit '${identifier}' has no line span`);
  }
  if (typeof status !== 'string') {
    throw new DocumentModelError(
      `grammar ${grammarId}: Unit '${identifier}' has no status (expected one of the declared vocabulary)`,
    );
  }
  const order = typeof orderValue === 'string' ? orderValue : status;
  return { identifier, status, orderValue: order, startLine, endLine };
}

/** Resolve a normalized-line range to the original markdown line span. */
function spanFor(stream: BlockStream, raw: RawUnit, grammarId: string): Span {
  const startEntry = stream.entries[raw.startLine - 1];
  const endEntry = stream.entries[raw.endLine - 1];
  if (startEntry === undefined || endEntry === undefined) {
    throw new DocumentModelError(
      `grammar ${grammarId}: Unit '${raw.identifier}' references normalized lines ${raw.startLine}..${raw.endLine} outside the ${stream.entries.length}-block stream`,
    );
  }
  return { startLine: startEntry.span.startLine, endLine: endEntry.span.endLine };
}

/**
 * Parse a governable document's block stream into Units. `sourceLines` is the
 * original document (1-based via `sourceLines[n-1]`) used to slice each Unit's
 * verbatim body.
 */
export function parseUnits(
  grammar: GrammarSpec,
  stream: BlockStream,
  sourceLines: readonly string[],
): Unit[] {
  let parser: peggy.Parser;
  try {
    parser = peggy.generate(grammar.pegText);
  } catch (err) {
    throw new DocumentModelError(
      `grammar '${grammar.id}' failed to compile${locationSuffix(err)}: ${messageOf(err)}`,
    );
  }

  // The grammar metadata is the SINGLE source of truth for row-keyed column
  // indices (AUDIT-20260608-26). Pass them into the PEG via parse options so the
  // body reads `options.identifierColumn` / `options.statusColumn` instead of
  // hardcoding literals — keeping the live parse in agreement with the
  // archive-marker scan + unarchive locate (both of which read the metadata
  // columns). Heading-keyed grammars use no columns; an empty options object is a
  // harmless no-op for them.
  const parseOptions: peggy.ParserOptions =
    grammar.unit.kind === 'row'
      ? { identifierColumn: grammar.unit.identifierColumn, statusColumn: grammar.unit.statusColumn }
      : {};

  let parsed: unknown;
  try {
    parsed = parser.parse(stream.normalized, parseOptions);
  } catch (err) {
    throw new DocumentModelError(
      `document does not parse against grammar '${grammar.id}'${locationSuffix(err)}: ${messageOf(err)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new DocumentModelError(
      `grammar '${grammar.id}': the top rule must return an array of Units`,
    );
  }

  return parsed.map((value): Unit => {
    const raw = asRawUnit(value, grammar.id);
    if (!grammar.statusVocabulary.includes(raw.status)) {
      throw new DocumentModelError(
        `Unit '${raw.identifier}' has status '${raw.status}', not in the declared vocabulary [${grammar.statusVocabulary.join(', ')}] (FR-004)`,
      );
    }
    const span = spanFor(stream, raw, grammar.id);
    const body = sourceLines.slice(span.startLine - 1, span.endLine).join('\n');
    return {
      identifier: raw.identifier,
      status: raw.status,
      orderValue: raw.orderValue,
      span,
      body,
      // Edge extraction is grammar-declared (006 R6); a grammar with no
      // `edgeFields` yields [] — identical to pre-feature behavior.
      edges: extractEdges(body, grammar),
    };
  });
}
