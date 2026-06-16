// Installation-anchor enforcement (022 US7 / FR-030). Governance finding F1
// (cross-model HIGH): authored-path resolution trusted absolute inputs and did not
// reject `..` escapes, so a malformed/malicious WORKFLOW.md override pointer or
// roadmap `design:`/`spec:` pointer could read or write OUTSIDE the installation
// domain. Every authored path resolves through this guard, which fails loud on any
// path that escapes the nearest-enclosing installation root.

import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { WorkflowError } from './workflow-types.js';

/**
 * Resolve `pointer` against the installation root and assert it stays INSIDE it.
 * An install-relative pointer joins to the root; an absolute pointer is accepted
 * only when it already resolves within the root. Any escape (an outside absolute
 * path, or a `..` traversal that leaves the tree) fails loud (FR-030).
 */
export function anchorWithin(installationRoot: string, pointer: string): string {
  const abs = isAbsolute(pointer) ? pointer : join(installationRoot, pointer);
  const rel = relative(resolve(installationRoot), resolve(abs));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new WorkflowError(
      `workflow: authored path '${pointer}' escapes the installation root ${installationRoot} (FR-030)`,
    );
  }
  return abs;
}
