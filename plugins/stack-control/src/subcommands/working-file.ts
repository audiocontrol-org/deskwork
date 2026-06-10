// Read-side working-file resolution for the governed verbs (009 T016/T019).
// Precedence: explicit --doc > env seam (test seam / operator override) >
// enclosing installation. When resolving via the installation and the working
// file is missing, auto-on-first-use scaffolds it (announced, contentless) and
// proceeds (FR-015/016/017) — the SAME scaffold writer `setup` uses, so the
// artifacts are byte-identical. Outside any installation with no --doc/seam,
// resolveInstallation fails loud (InstallationError 'not-found') directing the
// operator to `stackctl setup` — no bundled-copy fallback (Principle V / D8).

import { findInstallation, resolveInstallation } from '../config/installation.js';
import { scaffoldKey, targetExists } from '../setup/scaffold.js';
import { BUILTIN_GRAMMAR_DIR, grammarOptsForRoot } from './document-verb-shared.js';
import type { LoadOptions } from '../document-model/document.js';

/** A roadmap/inbox working-file key (the document-backed verbs). */
export type DocVerbKey = 'roadmap' | 'inbox';

export interface ResolvedDoc {
  readonly doc: string;
  readonly opts: LoadOptions;
}

export interface ResolveDocInput {
  readonly key: DocVerbKey;
  /** The path from an explicit --doc, or null when --doc was absent. */
  readonly explicitDoc: string | null;
  /** A verb-specific env seam value (e.g. STACKCTL_INBOX_DEFAULT_DOC), or undefined. */
  readonly envSeam: string | undefined;
  readonly cwd: string;
  /** Sink for the auto-on-first-use announcement (stdout). */
  readonly announce: (message: string) => void;
}

export function resolveVerbDoc(input: ResolveDocInput): ResolvedDoc {
  const { key, explicitDoc, envSeam, cwd, announce } = input;

  if (explicitDoc !== null) {
    return { doc: explicitDoc, opts: grammarOptsFromCwd(cwd) };
  }
  if (envSeam !== undefined && envSeam !== '') {
    return { doc: envSeam, opts: grammarOptsFromCwd(cwd) };
  }

  // Installation-resolved default. Fails loud (not-found) when outside one.
  const inst = resolveInstallation(cwd);
  const doc = inst.resolved[key];
  if (!targetExists(key, inst.resolved)) {
    scaffoldKey(key, inst.resolved);
    announce(
      `stackctl ${key}: scaffolded missing ${key} at ${doc} ` +
        `(auto-on-first-use; run \`stackctl setup\` to scaffold the full installation)`,
    );
  }
  return { doc, opts: grammarOptsForRoot(inst.root) };
}

function grammarOptsFromCwd(cwd: string): LoadOptions {
  const inst = findInstallation(cwd);
  return inst ? grammarOptsForRoot(inst.root) : { builtinGrammarDir: BUILTIN_GRAMMAR_DIR };
}
