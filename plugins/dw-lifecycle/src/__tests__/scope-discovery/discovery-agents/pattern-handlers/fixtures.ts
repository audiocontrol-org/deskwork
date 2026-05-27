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

export function makeScan(file: string, text: string): SourceFileView {
  return {
    file,
    text,
    lines: text.split(/\r?\n/),
  };
}
