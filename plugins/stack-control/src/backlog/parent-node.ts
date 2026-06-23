// Backlog task parent-node ref (031 US2, FR-010; contract backlog-parent-node.md).
// A task may carry an OPTIONAL reference to the roadmap node it belongs to, stored
// as a greppable linkage line in its implementation notes — mirroring the
// `**Promoted-to:**` promotion-linkage mechanism (mappings.ts / promote.ts). The
// notes linkage line is the SINGLE source of the ref (no duplicate roadmap-side
// index). Read via the backend's raw-notes accessor; written via append-notes.

import type { BacklogBackend } from './backend.js';

/** The greppable token of the parent-node linkage line (mirrors the
 * `**Promoted-to:**` bold-bullet form). The contract names the field `Node:`. */
const PARENT_NODE_TOKEN = '**Node:**';

/** The linkage line recorded on a task carrying a parent-node ref. */
export function parentNodeLine(nodeId: string): string {
  return `- ${PARENT_NODE_TOKEN} ${nodeId}`;
}

/**
 * Record a parent-node ref on a task (FR-010) — appends the linkage line to the
 * task's implementation notes additively (every pre-existing label/note preserved,
 * like the promote linkage). Shells the real backend; a non-zero exit (e.g. an
 * unknown id) throws BacklogError — never a silent no-op.
 */
export function setParentNode(backend: BacklogBackend, id: string, nodeId: string): void {
  backend.edit(id, { appendNotes: parentNodeLine(nodeId) });
}

/**
 * Read the parent-node ref from a task's notes, or `null` when absent. Parses the
 * greppable `- **Node:** <roadmap-id>` linkage line; returns the LAST such ref
 * when multiple are present (the most-recently appended). Throws BacklogError on
 * an unknown id (via readNotes — never a fabricated empty read).
 */
export function readParentNode(backend: BacklogBackend, id: string): string | null {
  const notes = backend.readNotes(id);
  let found: string | null = null;
  for (const raw of notes.split('\n')) {
    const idx = raw.indexOf(PARENT_NODE_TOKEN);
    if (idx < 0) continue;
    const value = raw.slice(idx + PARENT_NODE_TOKEN.length).trim();
    if (value.length > 0) found = value;
  }
  return found;
}
