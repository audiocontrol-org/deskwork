// Canonical feature identity (024 US6 / FR-013). The roadmap node, its spec dir,
// govern, the convergence record, and `close-related` all resolve a feature
// through ONE identity — the roadmap NODE ID — eliminating the spec-dir basename
// collision (TASK-139) and the branch-slug mismatch (FR-011). Before this, three
// subsystems identified a feature three ways (branch slug / spec-dir basename /
// node id); the node id is the already-stable key the roadmap + 022 engine resolve
// items by, so it is the canonical key.

import { relative, resolve } from 'node:path';
import type { RoadmapModel, WorkItem } from '../roadmap/roadmap-model.js';
import { anchorWithin } from './anchor.js';

/** The one canonical identity a feature is resolved through (024 data-model § Canonical Feature Identity). */
export interface FeatureIdentity {
  /** The roadmap node id (`<phase>:<kind>/<slug>`) — THE canonical key. */
  readonly nodeId: string;
  /** The node's `spec:` pointer (installation-relative), or null when unset. */
  readonly specPointer: string | null;
  /** The absolute, install-anchored spec dir resolved from `specPointer`, or null. */
  readonly specDir: string | null;
}

/** Resolve a work item's canonical identity (FR-013). The node id is the canonical key. */
export function resolveIdentity(installationRoot: string, item: WorkItem): FeatureIdentity {
  return {
    nodeId: item.identifier,
    specPointer: item.spec,
    specDir: item.spec !== null ? anchorWithin(installationRoot, item.spec) : null,
  };
}

/**
 * The canonical convergence-record key for an item (FR-013 / TASK-139): the node
 * id. Keying the durable govern-convergence record by this — never the spec-dir
 * basename — is what makes two basename-sharing features write/read distinct
 * records (SC-005).
 */
export function convergenceKeyFor(item: WorkItem): string {
  return item.identifier;
}

/** Normalise a spec-dir pointer (absolute or relative) to an installation-relative path. */
function relSpec(installationRoot: string, specDirPointer: string): string {
  const rel = relative(resolve(installationRoot), resolve(installationRoot, specDirPointer));
  return rel.split('\\').join('/').replace(/\/+$/, '');
}

/**
 * Resolve the node whose `spec:` pointer names the given governed feature dir
 * (FR-011 write-side keying): govern knows a feature dir (absolute or relative),
 * and must key the convergence record by the SAME canonical node id the workflow
 * read-side uses. Returns null for an orphan / legacy feature with no node — the
 * caller falls back to the spec-dir pointer (collision-free) and notes it.
 */
export function resolveIdentityFromSpecDir(
  installationRoot: string,
  model: RoadmapModel,
  specDirPointer: string,
): FeatureIdentity | null {
  // Compare on the installation-relative spec dir. The roadmap's `spec:` pointers are
  // installation-relative; the caller's dir may be absolute — normalise both against the
  // REAL installation root the caller threads in (AUDIT-BARRAGE claude-05). (Previously this
  // re-derived the root by string-slicing `dirname(ROADMAP.md)`, which both hardcoded `/` and
  // assumed ROADMAP.md sits at the install root — a latent coupling a config change would break.)
  const want = relSpec(installationRoot, specDirPointer);
  for (const item of model.items) {
    if (item.spec === null) continue;
    if (relSpec(installationRoot, item.spec) === want) {
      return resolveIdentity(installationRoot, item);
    }
  }
  return null;
}
