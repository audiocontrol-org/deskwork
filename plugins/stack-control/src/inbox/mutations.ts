// Inbox mutations (007). Every mutation computes a CANDIDATE document in memory,
// re-validates the whole governed design-inbox document (identifier uniqueness,
// order-key domain) via loadDocumentFromSource, and only then writes — a
// validation failure leaves the on-disk document byte-for-byte unchanged
// (FR-003 zero-write). Dry-run (apply=false) returns the candidate without
// writing. Mirrors src/roadmap/mutations.ts (research D1/D3); reuses the
// document-primitives engine + the design-inbox grammar unchanged.

import { writeFileSync } from 'node:fs';
import {
  loadDocumentFromSource,
  type LoadOptions,
} from '../document-model/document.js';

export interface MutationResult {
  readonly applied: boolean;
  /** The candidate document source (the new content, applied or dry-run). */
  readonly source: string;
}

/**
 * Re-validate a candidate document against its grammar + graph, then write it
 * iff `apply`. A validation failure throws `DocumentModelError` *before* any
 * write (zero-write); on success and dry-run, the candidate is returned but not
 * written. The single fail-safe substrate every inbox mutation commits through.
 */
export function commit(
  docPath: string,
  candidate: string,
  opts: LoadOptions,
  apply: boolean,
): MutationResult {
  loadDocumentFromSource(candidate, docPath, opts);
  if (apply) writeFileSync(docPath, candidate, 'utf8');
  return { applied: apply, source: candidate };
}
