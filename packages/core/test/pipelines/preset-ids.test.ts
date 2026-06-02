/**
 * AUDIT-20260530-03 — `PLUGIN_DEFAULTS_DIR` doubled as module directory
 * AND preset registry. The fix introduces an explicit `PRESET_IDS`
 * constant; the picker enumerates that list instead of reading every
 * `.json` next to the loader module. Three observable assertions:
 *
 *   1. `PRESET_IDS` is exported and lists exactly the five shipped ids.
 *   2. `listAvailablePipelineTemplates` (no overrides) returns exactly
 *      `PRESET_IDS` (after sort).
 *   3. Every id the function ever reports (no overrides) is a member
 *      of `PRESET_IDS` — a stray non-preset JSON shipped under
 *      `dist/pipelines/` cannot surface as a phantom template id.
 *
 * Contract test, not implementation spy: the assertions hold whether
 * the function reads from disk or from the constant, AS LONG AS the
 * set of returned ids matches `PRESET_IDS`. The previous readdirSync-
 * based implementation could (and did) return additional basenames
 * once a stray .json existed; the new list-based implementation
 * cannot.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  listAvailablePipelineTemplates,
  PRESET_IDS,
} from '../../src/pipelines/loader.ts';

describe('AUDIT-20260530-03 — listAvailablePipelineTemplates uses explicit PRESET_IDS', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-preset-ids-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('exposes PRESET_IDS as a readonly list naming every shipped preset', () => {
    // The five preset ids the workplan ships, sorted alphabetically.
    expect([...PRESET_IDS].sort()).toEqual([
      'blog-post',
      'editorial',
      'feature-doc',
      'qa-plan',
      'visual',
    ]);
  });

  it('returns exactly PRESET_IDS (sorted) when no overrides exist', () => {
    const ids = listAvailablePipelineTemplates(projectRoot);
    expect(ids).toEqual([...PRESET_IDS].sort());
  });

  it('never returns an id that is not a member of PRESET_IDS (no project overrides)', () => {
    const ids = listAvailablePipelineTemplates(projectRoot);
    for (const id of ids) {
      expect(PRESET_IDS).toContain(id);
    }
  });
});
