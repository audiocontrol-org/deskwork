// Core types for the document-primitives engine (T005, data-model.md).
//
// Field-level rules trace to the canonical FRs in specs/005-document-primitives/
// spec.md (referenced, not restated — DRY-for-prose).

/** Where a resolved grammar came from (FR-001 precedence). */
export type GrammarSource = 'embedded' | 'project-override' | 'builtin';

/**
 * The reserved structural marker that delimits Units (FR-002 boundary rule).
 * A Unit body provably cannot contain its own marker, which is what makes the
 * Unit span — and later its archive-file extraction (FR-006/FR-007) —
 * unambiguous.
 *
 * - `heading`: a heading-keyed grammar reserves a heading level; a Unit runs
 *   from a reserved-level heading to the next same-level heading.
 * - `row`: a row-keyed grammar uses a table row as the marker; the identifier
 *   and status live in declared columns; the archive reproduces the header +
 *   separator + column schema as a single archived-Unit table.
 */
export type UnitMarker =
  | { readonly kind: 'heading'; readonly level: number }
  | {
      readonly kind: 'row';
      /** 0-based column index carrying the identifier. */
      readonly identifierColumn: number;
      /** 0-based column index carrying the status. */
      readonly statusColumn: number;
    };

/**
 * Declared ordering over the order-key field's value domain (FR-004).
 * `relation` is an ordered enumeration of the field's values — lexicographic is
 * NEVER assumed. A categorical order key with no declared relation is a grammar
 * error.
 */
export interface OrderKey {
  readonly field: string;
  readonly relation: readonly string[];
}

/** The grammar's concrete identifier shape (FR-005, per-grammar). */
export interface IdentifierRule {
  /** `slug` (e.g. `<phase>/<slug>`) or `title`. The engine enforces the
   * properties (unique / non-ordinal / human-readable) regardless of shape. */
  readonly kind: 'slug' | 'title';
}

/** Optional reconciliation seam (FR-008) — recorded, never executed here. */
export interface ReconciliationHook {
  readonly kind: 'command' | 'glob';
  readonly source: string;
}

/**
 * How a grammar declares that a body field is an edge/reference (006 R6,
 * data-model.md). Declared in grammar YAML metadata as an optional `edgeFields`
 * list. Absent ⇒ no edges (backward-compatible with `design-inbox`).
 */
export interface EdgeFieldSpec {
  /** The body field label, e.g. `depends-on`, `part-of`, `spec`, `deferred-until`. */
  readonly name: string;
  /**
   * `unit` = referential-integrity-checked against Unit identifiers;
   * `external` = free string (path/URL/id); `prose` = free text.
   */
  readonly references: 'unit' | 'external' | 'prose';
  /** Only meaningful for `references: 'unit'`; a cycle over this edge-type fails loud (006 FR-006). */
  readonly acyclic: boolean;
  /** Semantic hint consumed by the roadmap layer; the engine does not interpret it. */
  readonly blocking: boolean;
}

/** A parsed reference on a Unit (006 — populated by `edges.ts` from the body). */
export interface Edge {
  /** The `EdgeFieldSpec.name` this came from. */
  readonly field: string;
  /**
   * For `references: 'unit'` — referenced identifiers (validated to exist).
   * For `external`/`prose` — the raw value(s) as a single-element list.
   */
  readonly targets: readonly string[];
}

/** The compiled, declared description of a document's structure (FR-001/FR-012). */
export interface GrammarSpec {
  readonly id: string;
  readonly source: GrammarSource;
  /** The PEG body compiled by peggy at runtime (parses the normalized stream). */
  readonly pegText: string;
  readonly unit: UnitMarker;
  readonly statusVocabulary: readonly string[];
  /** Subset of `statusVocabulary` that is archivable (FR-004). */
  readonly terminalStatuses: readonly string[];
  readonly orderKey: OrderKey;
  readonly identifierProduction: IdentifierRule;
  readonly reconciliationHook: ReconciliationHook | null;
  /** Declared edge/reference fields (006 R6); empty when undeclared. */
  readonly edgeFields: readonly EdgeFieldSpec[];
}

/** Inclusive original-markdown line range (1-based), the unit of cut/move. */
export interface Span {
  readonly startLine: number;
  readonly endLine: number;
}

/**
 * The normalized block stream handed to the grammar: one entry per content
 * block. `text` is the salient normalized payload the grammar matches on; the
 * parser sees `lines.join('\n')` and peggy's `location().start.line` indexes
 * `entries` 1-based (FR-002 integration pattern, research.md).
 */
export interface BlockEntry {
  /** `H<n>` | `P` | `ROW` | `THEAD` | `CODE` | `HR` | `HTML` | `BQ`. */
  readonly kind: string;
  /** Salient payload (heading/paragraph text, or `\x1f`-joined table cells). */
  readonly text: string;
  /** Original markdown line range of the source block. */
  readonly span: Span;
}

export interface BlockStream {
  /** The normalized text the grammar parses (one block per line). */
  readonly normalized: string;
  /** Parallel array: normalized-line-index (0-based) → original block entry. */
  readonly entries: readonly BlockEntry[];
}

/** A single parsed item — ordered, archived, referenced (FR-002). */
export interface Unit {
  readonly identifier: string;
  readonly status: string;
  /** Order-key field value used by the declared ordering relation (FR-004). */
  readonly orderValue: string;
  /** Original markdown line range (what archive/curate cut/move). */
  readonly span: Span;
  /** Raw block content; never interpreted by the engine. */
  readonly body: string;
  /** Parsed edges/refs from the body per the grammar's `edgeFields` (006); empty when none. */
  readonly edges: readonly Edge[];
}

/** A parsed markdown document bound to its grammar (FR-002). */
export interface GovernableDocument {
  readonly path: string;
  readonly archivePath: string;
  readonly grammar: GrammarSpec;
  /** Parsed Units in document order. */
  readonly units: readonly Unit[];
  /** Raw source lines (1-based via `lines[n-1]`); the live document content. */
  readonly sourceLines: readonly string[];
}

/** One provenance-ledger record (FR-006) — keyed by identifier, never ordinal. */
export interface LedgerEntry {
  readonly identifier: string;
  readonly archivedAt: string;
  readonly fromStatus: string;
}

/** A planned or applied archive move (dry-run reports these; FR-009). */
export interface ArchiveMove {
  readonly identifier: string;
  readonly status: string;
  readonly span: Span;
}

export interface ArchiveResult {
  readonly applied: boolean;
  readonly moves: readonly ArchiveMove[];
  readonly archivePath: string;
}

/** A single curate finding (well-formed/ordered/archived/up-to-date/coherence). */
export interface CurateFinding {
  readonly kind:
    | 'disorder'
    | 'unarchived-terminal'
    | 'up-to-date-seam'
    | 'coherence-notice';
  readonly message: string;
}

export interface CurateReport {
  readonly applied: boolean;
  readonly findings: readonly CurateFinding[];
  readonly reordered: boolean;
  readonly archived: readonly ArchiveMove[];
}

/**
 * Fail-loud engine error (FR-010). Carries an actionable message naming the
 * offending element; verbs map it to the documented exit code.
 */
export class DocumentModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentModelError';
  }
}
