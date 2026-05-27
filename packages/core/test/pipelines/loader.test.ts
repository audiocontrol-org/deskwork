/**
 * loadPipelineTemplate + listAvailablePipelineTemplates tests.
 *
 * Each test uses a fresh tmp dir (mkdtempSync) for the projectRoot.
 * Plugin defaults are the real preset files shipped alongside the
 * loader — we don't mock the plugin side. That means tests of the
 * override-takes-precedence path use a preset id that exists in the
 * defaults (`editorial`) and overlay a different JSON for it; the
 * loader must return the overridden content.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPipelineTemplate,
  listAvailablePipelineTemplates,
} from '../../src/pipelines/loader.ts';

describe('loadPipelineTemplate', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-loader-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('loads a plugin-default preset when no override exists', () => {
    const template = loadPipelineTemplate('editorial', projectRoot);
    expect(template.id).toBe('editorial');
    expect(template.linearStages).toEqual([
      'Ideas',
      'Planned',
      'Outlining',
      'Drafting',
      'Final',
      'Published',
    ]);
    expect(template.lockedStages).toEqual(['Final']);
    expect(template.offPipelineStages).toEqual(['Blocked', 'Cancelled']);
  });

  it('prefers a project override over the plugin default for the same id', () => {
    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
    mkdirSync(overrideDir, { recursive: true });
    const override = {
      id: 'editorial',
      name: 'Editorial (project override)',
      description: 'Custom three-stage editorial flow for this project.',
      linearStages: ['Draft', 'Review', 'Published'],
      lockedStages: ['Review'],
      offPipelineStages: ['Cancelled'],
    };
    writeFileSync(
      join(overrideDir, 'editorial.json'),
      JSON.stringify(override, null, 2),
      'utf8',
    );
    const template = loadPipelineTemplate('editorial', projectRoot);
    expect(template.name).toBe('Editorial (project override)');
    expect(template.linearStages).toEqual(['Draft', 'Review', 'Published']);
    expect(template.lockedStages).toEqual(['Review']);
    expect(template.offPipelineStages).toEqual(['Cancelled']);
  });

  it('loads an operator-authored override that has no plugin-default counterpart', () => {
    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
    mkdirSync(overrideDir, { recursive: true });
    const custom = {
      id: 'newsletter',
      name: 'Newsletter',
      description: 'Newsletter issues — Draft → Sent.',
      linearStages: ['Draft', 'Sent'],
      offPipelineStages: ['Cancelled'],
    };
    writeFileSync(
      join(overrideDir, 'newsletter.json'),
      JSON.stringify(custom, null, 2),
      'utf8',
    );
    const template = loadPipelineTemplate('newsletter', projectRoot);
    expect(template.id).toBe('newsletter');
    expect(template.linearStages).toEqual(['Draft', 'Sent']);
  });

  it('throws when neither project override nor plugin default exists', () => {
    expect(() => loadPipelineTemplate('does-not-exist', projectRoot))
      .toThrow(/not found/);
  });

  it('throws with both searched paths in the error when the id is unknown', () => {
    expect(() => loadPipelineTemplate('does-not-exist', projectRoot))
      .toThrow(/Searched project override/);
    expect(() => loadPipelineTemplate('does-not-exist', projectRoot))
      .toThrow(/Searched plugin default/);
  });

  it('throws on malformed JSON in an override', () => {
    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(join(overrideDir, 'editorial.json'), '{ this is not valid json', 'utf8');
    expect(() => loadPipelineTemplate('editorial', projectRoot))
      .toThrow(/not valid JSON/);
  });

  it('throws on Zod-invalid override (missing required field)', () => {
    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
    mkdirSync(overrideDir, { recursive: true });
    const invalid = {
      id: 'editorial',
      name: 'Editorial',
      // description missing — required
      linearStages: ['Ideas', 'Published'],
      offPipelineStages: ['Cancelled'],
    };
    writeFileSync(
      join(overrideDir, 'editorial.json'),
      JSON.stringify(invalid, null, 2),
      'utf8',
    );
    expect(() => loadPipelineTemplate('editorial', projectRoot))
      .toThrow(/failed Zod validation/);
  });

  it('throws when the JSON id field disagrees with the filename basename', () => {
    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
    mkdirSync(overrideDir, { recursive: true });
    const mismatched = {
      id: 'visual',
      name: 'Editorial',
      description: 'wrong id inside an editorial.json file',
      linearStages: ['Ideas', 'Published'],
      offPipelineStages: ['Cancelled'],
    };
    writeFileSync(
      join(overrideDir, 'editorial.json'),
      JSON.stringify(mismatched, null, 2),
      'utf8',
    );
    expect(() => loadPipelineTemplate('editorial', projectRoot))
      .toThrow(/declares id "visual" but was loaded as "editorial"/);
  });

  it('throws on an empty id', () => {
    expect(() => loadPipelineTemplate('', projectRoot))
      .toThrow(/non-empty id/);
  });
});

describe('listAvailablePipelineTemplates', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deskwork-pipelines-list-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns the plugin defaults when no project overrides exist', () => {
    const ids = listAvailablePipelineTemplates(projectRoot);
    // The five preset ids the workplan ships.
    expect(ids).toEqual(
      ['blog-post', 'editorial', 'feature-doc', 'qa-plan', 'visual'].sort(),
    );
  });

  it('returns the same plugin defaults when .deskwork/ exists but pipelines/ subdir does not', () => {
    mkdirSync(join(projectRoot, '.deskwork'), { recursive: true });
    const ids = listAvailablePipelineTemplates(projectRoot);
    expect(ids).toContain('editorial');
    expect(ids).toContain('visual');
  });

  it('merges project overrides with plugin defaults, deduplicated by id', () => {
    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
    mkdirSync(overrideDir, { recursive: true });
    // editorial: also exists as a plugin default (overlap — should dedup).
    // newsletter: project-only (should appear in the list).
    const editorialOverride = {
      id: 'editorial',
      name: 'Editorial (override)',
      description: 'project override',
      linearStages: ['Draft', 'Published'],
      offPipelineStages: ['Cancelled'],
    };
    const newsletter = {
      id: 'newsletter',
      name: 'Newsletter',
      description: 'project-only',
      linearStages: ['Draft', 'Sent'],
      offPipelineStages: ['Cancelled'],
    };
    writeFileSync(
      join(overrideDir, 'editorial.json'),
      JSON.stringify(editorialOverride, null, 2),
      'utf8',
    );
    writeFileSync(
      join(overrideDir, 'newsletter.json'),
      JSON.stringify(newsletter, null, 2),
      'utf8',
    );

    const ids = listAvailablePipelineTemplates(projectRoot);
    // editorial appears exactly once despite existing in both sources.
    expect(ids.filter((id) => id === 'editorial')).toHaveLength(1);
    // newsletter appears (project-only).
    expect(ids).toContain('newsletter');
    // The plugin defaults still surface.
    expect(ids).toContain('visual');
    expect(ids).toContain('blog-post');
  });

  it('returns ids in stable sorted order', () => {
    const ids = listAvailablePipelineTemplates(projectRoot);
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('ignores non-JSON files in the override directory', () => {
    const overrideDir = join(projectRoot, '.deskwork', 'pipelines');
    mkdirSync(overrideDir, { recursive: true });
    writeFileSync(join(overrideDir, 'README.md'), '# notes\n', 'utf8');
    writeFileSync(join(overrideDir, 'old-template.json.bak'), '{}', 'utf8');

    const ids = listAvailablePipelineTemplates(projectRoot);
    expect(ids).not.toContain('README');
    expect(ids).not.toContain('old-template.json');
    expect(ids).not.toContain('old-template');
  });
});
