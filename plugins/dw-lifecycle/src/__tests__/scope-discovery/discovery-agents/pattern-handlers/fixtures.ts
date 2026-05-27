/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/pattern-handlers/fixtures.ts
 *
 * Synthetic fixture builders for the pattern-handler tests. We do NOT
 * mock the filesystem (per .claude/CLAUDE.md / testing.md "use fixture
 * project trees on disk, never mock the filesystem") — these helpers
 * build in-memory `SourceFileView`s the handlers can consume directly.
 *
 * The pattern-matrix agent's I/O layer (file walk + read) is tested
 * via the integration path; per-handler tests focus on each handler's
 * algorithm given a known-shape input.
 */

import type { SourceFileView } from '../../../../scope-discovery/discovery-agents/shared.js';
import type {
  CatalogStatus,
  Provenance,
} from '../../../../scope-discovery/util/catalog-status.js';

export function makeScan(file: string, text: string): SourceFileView {
  return {
    file,
    text,
    lines: text.split(/\r?\n/),
  };
}

/**
 * Default Loop metadata for synthetic pattern entries (Phase 11
 * Task 2). Test fixtures default to `blessed` status + install-seed
 * provenance so the pattern matches the loader's default-synthesis
 * path. Tests that exercise the status discriminator (e.g.,
 * loop-foundation.test.ts) override the values explicitly.
 */
export const TEST_CATALOG_STATUS: CatalogStatus = 'blessed';
export const TEST_CATALOG_PROVENANCE: Provenance = {
  source: 'install-seed',
  authored_at: '1970-01-01T00:00:00Z',
};
