// Roadmap mutations (006 US2/US3, R7). Every mutation computes a CANDIDATE
// document in memory, re-validates the whole graph (identifier uniqueness,
// referential integrity, acyclicity) via loadDocumentFromSource, and only then
// writes — a validation failure leaves the on-disk document byte-for-byte
// unchanged (FR-010 zero-write). Dry-run (apply=false) returns the candidate
// source without writing. MVP layer ships `add`; advance/decompose/reclassify/
// defer follow in US3 (this same file, under the cap).

import { writeFileSync } from 'node:fs';
import {
  loadDocument,
  loadDocumentFromSource,
  type LoadOptions,
} from '../document-model/document.js';
import { DocumentModelError } from '../document-model/types.js';

const DEFAULT_STATUS = 'planned';

/** One-move emergent-capture input; kind+phase ride in the identifier (FR-011). */
export interface AddInput {
  readonly identifier: string;
  readonly status?: string;
  readonly scope?: string;
  readonly dependsOn?: readonly string[];
  readonly partOf?: string;
  readonly deferredUntil?: string;
  readonly spec?: string;
  readonly ref?: string;
}

export interface MutationResult {
  readonly applied: boolean;
  /** The candidate document source (the new content, applied or dry-run). */
  readonly source: string;
}

function buildSection(input: AddInput): string[] {
  const lines = [`## ${input.identifier}`, `- status: ${input.status ?? DEFAULT_STATUS}`];
  if (input.dependsOn !== undefined && input.dependsOn.length > 0) {
    lines.push(`- depends-on: ${input.dependsOn.join(', ')}`);
  }
  if (input.partOf !== undefined) lines.push(`- part-of: ${input.partOf}`);
  if (input.deferredUntil !== undefined) lines.push(`- deferred-until: ${input.deferredUntil}`);
  if (input.spec !== undefined) lines.push(`- spec: ${input.spec}`);
  if (input.ref !== undefined) lines.push(`- ref: ${input.ref}`);
  if (input.scope !== undefined && input.scope.length > 0) lines.push(input.scope);
  return lines;
}

/**
 * Re-validate a candidate document against its grammar + graph, then write it
 * iff `apply`. A validation failure throws (zero-write); on success and dry-run,
 * the candidate is returned but not written.
 */
function commit(
  docPath: string,
  candidate: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  loadDocumentFromSource(candidate, docPath, opts);
  if (apply) writeFileSync(docPath, candidate, 'utf8');
  return { applied: apply, source: candidate };
}

/** Insert a new item (one-move emergent capture). Re-validates whole graph (R7). */
export function add(
  docPath: string,
  input: AddInput,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  const { doc } = loadDocument(docPath, opts);
  const status = input.status ?? DEFAULT_STATUS;
  if (!doc.grammar.statusVocabulary.includes(status)) {
    throw new DocumentModelError(
      `status '${status}' is not in the declared vocabulary [${doc.grammar.statusVocabulary.join(', ')}]`,
    );
  }
  const sourceLines = doc.sourceLines;
  // Append after the last unit (the operator reorders with curate); when the
  // roadmap is empty, append at end of document.
  const insertAt =
    doc.units.length > 0 ? doc.units[doc.units.length - 1]!.span.endLine : sourceLines.length;
  const before = sourceLines.slice(0, insertAt);
  const after = sourceLines.slice(insertAt);
  const section = buildSection(input);
  const candidate = [...before, '', ...section, '', ...after].join('\n');
  return commit(docPath, candidate, opts, apply);
}
