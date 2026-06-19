// Emit handlers for the 028 US2 roadmap edge-mutation + marker sub-actions
// (FR-014/016; contract RM1/RM3). Split out of roadmap.ts to keep that file under
// the size cap. Each handler reads the validated `Flags`, calls the corresponding
// edge-mutation engine function, and formats the dry-run / applied line. The
// candidate→validate→write + zero-write guarantees live in edge-mutations.ts.

import type { LoadOptions } from '../document-model/document.js';
import {
  addEdge,
  moveEdge,
  removeEdge,
  removeNode,
  renameNode,
  setMarker,
  type MutationResult,
} from '../roadmap/edge-mutations.js';
import { requireMapValue, requirePositional } from './document-verb-shared.js';
import type { Flags } from './roadmap.js';

/** The first positional, failing usage with a subaction-specific message. */
function requireId(flags: Flags, subaction: string): string {
  return requirePositional(
    'roadmap',
    flags.positionals,
    `${subaction} requires an <identifier> positional`,
  );
}

/** Require a named `--<flag> <value>`. */
function requireValue(flags: Flags, name: string): string {
  return requireMapValue('roadmap', flags.values, name);
}

/** Standard dry-run / applied report line, shared by the simple edge mutations. */
function reportMutation(result: MutationResult, verb: string, id: string): void {
  process.stdout.write(
    result.applied
      ? `roadmap ${verb}: applied to ${id}\n`
      : `roadmap ${verb}: dry-run — would change ${id} (use --apply to write)\n`,
  );
}

export function emitAddEdge(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'add-edge');
  const field = requireValue(flags, 'field');
  const to = requireValue(flags, 'to');
  reportMutation(addEdge(flags.doc, id, field, to, opts, flags.apply), 'add-edge', id);
}

export function emitRemoveEdge(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'remove-edge');
  const field = requireValue(flags, 'field');
  const to = requireValue(flags, 'to');
  reportMutation(removeEdge(flags.doc, id, field, to, opts, flags.apply), 'remove-edge', id);
}

export function emitMoveEdge(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'move-edge');
  const field = requireValue(flags, 'field');
  const from = requireValue(flags, 'from');
  const to = requireValue(flags, 'to');
  reportMutation(moveEdge(flags.doc, id, field, from, to, opts, flags.apply), 'move-edge', id);
}

export function emitRename(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'rename');
  const to = requireValue(flags, 'to');
  reportMutation(renameNode(flags.doc, id, to, opts, flags.apply), 'rename', id);
}

export function emitRemoveNode(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'remove-node');
  reportMutation(removeNode(flags.doc, id, opts, flags.apply), 'remove-node', id);
}

/**
 * `roadmap approve-design <id> [--analyze-clean] [--clear] [--apply]` (TASK-298) —
 * the sanctioned marker writer. `--analyze-clean` selects the symmetric marker;
 * `--clear` negates (removes the marker).
 */
export function emitApproveDesign(flags: Flags, opts: LoadOptions): void {
  const id = requireId(flags, 'approve-design');
  const marker = flags.analyzeClean ? 'analyze-clean' : 'design-approved';
  const value = !flags.clear;
  const result = setMarker(flags.doc, id, marker, value, opts, flags.apply);
  const verb = value ? 'record' : 'clear';
  process.stdout.write(
    result.applied
      ? `roadmap approve-design: ${verb}ed ${marker} on ${id}\n`
      : `roadmap approve-design: dry-run — would ${verb} ${marker} on ${id} (use --apply to write)\n`,
  );
}
