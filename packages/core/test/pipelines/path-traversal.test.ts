/**
 * Path-traversal hardening tests for the pipeline-template loader
 * (AUDIT-20260530-01).
 *
 * The fix has three observable surfaces and one test per surface:
 *
 *   1. `loadPipelineTemplate(id, projectRoot)` MUST refuse any `id` that
 *      fails `PIPELINE_ID_REGEX` before any filesystem access. The
 *      observable property is "no readFileSync against a path constructed
 *      from the malformed id"; we assert by writing a file at the
 *      traversal target and confirming the loader throws WITHOUT reading
 *      it (the test would otherwise pick up the contents).
 *
 *   2. `PipelineTemplateSchema.id` MUST reject loaded JSON whose `id`
 *      field doesn't match the regex. The earlier id-mismatch check
 *      could only fire if the basename + JSON id agreed; a schema-level
 *      regex catches an operator who writes a non-canonical id into
 *      both the filename AND the JSON.
 *
 *   3. `listAvailablePipelineTemplates` MUST skip basenames that fail
 *      the regex. A stray non-canonical `.json` next to the preset set
 *      should not appear in the picker.
 *
 * The regression tests at the bottom assert the canonical happy paths
 * continue to work — `editorial` loads, `editorial` appears in the
 * preset list.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPipelineTemplate,
  listAvailablePipelineTemplates,
  pipelineOverridesDir,
} from '../../src/pipelines/loader.ts';
import { PipelineTemplateSchema } from '../../src/pipelines/types.ts';

describe('AUDIT-20260530-01 — loadPipelineTemplate path-traversal hardening', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipeline-traversal-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('refuses an id with parent-directory segments before reading the file', () => {
    // Seed a file at the would-be-traversal target. If the loader were
    // unguarded, it would read this file. The regex guard must fire
    // before the readFileSync, so the file's contents never reach the
    // loader.
    const traversalTarget = join(projectRoot, 'gotcha.json');
    writeFileSync(traversalTarget, JSON.stringify({
      id: 'gotcha',
      name: 'Gotcha',
      description: 'Should never be read by the loader.',
      linearStages: ['Ideas', 'Published'],
      offPipelineStages: ['Cancelled'],
    }), 'utf8');
    expect(existsSync(traversalTarget)).toBe(true);

    // The id resolves to `<projectRoot>/.deskwork/pipelines/../../gotcha.json`
    // which normalizes to `<projectRoot>/gotcha.json` — the seeded file.
    // The kebab-case regex rejects the dots + slashes before the path is
    // constructed.
    expect(() => loadPipelineTemplate('../../gotcha', projectRoot))
      .toThrow(/Invalid pipeline id/);
  });

  it('refuses an id containing a forward slash', () => {
    expect(() => loadPipelineTemplate('foo/bar', projectRoot))
      .toThrow(/Invalid pipeline id/);
  });

  it('refuses an id containing uppercase characters', () => {
    expect(() => loadPipelineTemplate('Editorial', projectRoot))
      .toThrow(/Invalid pipeline id/);
  });

  it('refuses an id beginning with a hyphen', () => {
    expect(() => loadPipelineTemplate('-editorial', projectRoot))
      .toThrow(/Invalid pipeline id/);
  });

  it('refuses an absolute path id', () => {
    expect(() => loadPipelineTemplate('/etc/passwd', projectRoot))
      .toThrow(/Invalid pipeline id/);
  });

  it('regression: a canonical id still loads', () => {
    const template = loadPipelineTemplate('editorial', projectRoot);
    expect(template.id).toBe('editorial');
  });
});

describe('AUDIT-20260530-01 — PipelineTemplateSchema.id charset', () => {
  it('rejects a loaded template whose JSON id is non-canonical', () => {
    const result = PipelineTemplateSchema.safeParse({
      id: 'Editorial',
      name: 'Editorial',
      description: 'Mixed-case id should fail the regex.',
      linearStages: ['Ideas', 'Published'],
      offPipelineStages: ['Cancelled'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const idIssue = result.error.issues.find((i) => i.path.includes('id'));
      expect(idIssue).toBeDefined();
    }
  });

  it('rejects a loaded template whose JSON id contains a path separator', () => {
    const result = PipelineTemplateSchema.safeParse({
      id: '../escape',
      name: 'Escape',
      description: 'Path-traversal id in the JSON itself.',
      linearStages: ['Ideas', 'Published'],
      offPipelineStages: ['Cancelled'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts a canonical kebab-case id', () => {
    const result = PipelineTemplateSchema.safeParse({
      id: 'editorial',
      name: 'Editorial',
      description: 'Canonical id passes.',
      linearStages: ['Ideas', 'Published'],
      offPipelineStages: ['Cancelled'],
    });
    expect(result.success).toBe(true);
  });
});

describe('AUDIT-20260530-01 — listAvailablePipelineTemplates filters non-canonical basenames', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipeline-list-traversal-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('skips override JSONs whose basename does not match the kebab-case regex', () => {
    const dir = pipelineOverridesDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    // Canonical override the operator authored.
    writeFileSync(join(dir, 'newsletter.json'), JSON.stringify({
      id: 'newsletter',
      name: 'Newsletter',
      description: 'Operator-authored override.',
      linearStages: ['Draft', 'Sent'],
      offPipelineStages: ['Cancelled'],
    }), 'utf8');
    // Non-canonical stray JSON (uppercase basename).
    writeFileSync(join(dir, 'Notes.json'), '{}', 'utf8');
    // Non-canonical stray JSON (starts with dot).
    writeFileSync(join(dir, '.hidden.json'), '{}', 'utf8');
    // Non-canonical stray JSON (contains underscore).
    writeFileSync(join(dir, 'with_underscore.json'), '{}', 'utf8');

    const ids = listAvailablePipelineTemplates(projectRoot);
    expect(ids).toContain('newsletter');
    expect(ids).not.toContain('Notes');
    expect(ids).not.toContain('.hidden');
    expect(ids).not.toContain('with_underscore');

    // Ensure the seeded files are still on disk (the filter is read-only).
    expect(existsSync(join(dir, 'Notes.json'))).toBe(true);
    // Read just to silence an unused-import lint; the contents don't matter.
    expect(readFileSync(join(dir, 'Notes.json'), 'utf8')).toBe('{}');
  });
});
