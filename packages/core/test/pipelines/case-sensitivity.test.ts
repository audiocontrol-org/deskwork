/**
 * AUDIT-20260530-06 — case-insensitive filesystem produces confusing
 * id-mismatch error in loadPipelineTemplate.
 *
 * Pre-Bundle 1: on macOS / Windows (case-insensitive FS),
 * `existsSync('...Editorial.json')` returned true for an on-disk
 * `editorial.json`. The loader then read the file and the id-mismatch
 * check tripped with "declares id 'editorial' but was loaded as
 * 'Editorial'" — confusing because the operator typed `Editorial`
 * which IS what got loaded; the divergence-by-host-OS hid the real
 * issue (the requested id is non-canonical).
 *
 * Bundle 1's PIPELINE_ID_REGEX guard added at the top of
 * loadPipelineTemplate now rejects mixed-case ids BEFORE any FS
 * access, so the confusing error path is unreachable. This test
 * locks the fix in by asserting:
 *
 *   1. loadPipelineTemplate('Editorial', root) throws the
 *      "Invalid pipeline id" regex error.
 *   2. The error message does NOT contain the misleading
 *      "declares id" id-mismatch text.
 *   3. Same for other mixed-case canonical names (Visual, Blog-Post,
 *      FEATURE-DOC) — the guard fires for every host-OS-sensitive
 *      case-variant.
 *
 * AUDIT-20260530-06 closed implicitly by Bundle 1 commit 7e15a61
 * (the loader-side PIPELINE_ID_REGEX guard); this regression test
 * was added in the Bundle 2 closure commit so future refactors can't
 * silently regress the implicit closure.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPipelineTemplate } from '../../src/pipelines/loader.ts';

describe('AUDIT-20260530-06 — mixed-case id rejected before id-mismatch path', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-case-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('rejects loadPipelineTemplate("Editorial", root) with the regex error, not the id-mismatch error', () => {
    let captured: unknown;
    try {
      loadPipelineTemplate('Editorial', projectRoot);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(Error);
    const message = captured instanceof Error ? captured.message : String(captured);
    // Regex-violation error must surface.
    expect(message).toMatch(/Invalid pipeline id/);
    // The confusing id-mismatch error path MUST NOT be reached.
    expect(message).not.toMatch(/declares id/);
    expect(message).not.toMatch(/was loaded as/);
  });

  it('rejects other mixed-case canonical preset names with the same regex error', () => {
    const variants = ['Visual', 'Blog-Post', 'FEATURE-DOC', 'Qa-Plan'];
    for (const id of variants) {
      let captured: unknown;
      try {
        loadPipelineTemplate(id, projectRoot);
      } catch (err) {
        captured = err;
      }
      expect(captured, `expected throw for ${id}`).toBeInstanceOf(Error);
      const message = captured instanceof Error ? captured.message : String(captured);
      expect(message, `id=${id}`).toMatch(/Invalid pipeline id/);
      expect(message, `id=${id}`).not.toMatch(/declares id/);
    }
  });

  it('regression: the canonical lowercase form still loads', () => {
    const template = loadPipelineTemplate('editorial', projectRoot);
    expect(template.id).toBe('editorial');
  });
});
