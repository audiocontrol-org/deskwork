/**
 * Unit tests for the install command's pre-flight helpers.
 * Covers Issue #42 (schema preflight) and Issue #45 (existing
 * editorial-pipeline detection).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectExistingPipeline,
  preflightSchemaForProject,
} from '../src/commands/install-preflight.ts';

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'deskwork-preflight-'));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

function touch(rel: string, contents = ''): void {
  const abs = join(project, rel);
  mkdirSync(abs.replace(/\/[^/]+$/, ''), { recursive: true });
  writeFileSync(abs, contents, 'utf-8');
}

function mkdir(rel: string): void {
  mkdirSync(join(project, rel), { recursive: true });
}

// ---------------------------------------------------------------------------
// Schema pre-flight (Issue #42)
// ---------------------------------------------------------------------------

describe('preflightSchemaForProject', () => {
  it('skips when no astro.config.* is present (non-Astro project)', () => {
    const out = preflightSchemaForProject(project);
    expect(out.kind).toBe('skipped');
  });

  it('returns uncertain when astro.config exists but no schema file is found', () => {
    touch('astro.config.mjs', 'export default {};\n');
    const out = preflightSchemaForProject(project);
    expect(out.kind).toBe('uncertain');
    if (out.kind === 'uncertain') {
      expect(out.schemaPath).toBeNull();
    }
  });

  it('returns compatible when schema declares an explicit `deskwork` field', () => {
    touch('astro.config.mjs', 'export default {};\n');
    touch(
      'src/content/config.ts',
      [
        "import { defineCollection, z } from 'astro:content';",
        '',
        'const blog = defineCollection({',
        "  type: 'content',",
        '  schema: z.object({',
        '    deskwork: z.object({ id: z.string().uuid() }).passthrough().optional(),',
        '    title: z.string(),',
        '  }),',
        '});',
        '',
        'export const collections = { blog };',
        '',
      ].join('\n'),
    );
    const out = preflightSchemaForProject(project);
    expect(out.kind).toBe('compatible');
    if (out.kind === 'compatible') {
      expect(out.schemaPath.endsWith('src/content/config.ts')).toBe(true);
    }
  });

  it('returns compatible when schema uses top-level `.passthrough()`', () => {
    touch('astro.config.ts', 'export default {};\n');
    touch(
      'src/content/config.ts',
      [
        "import { defineCollection, z } from 'astro:content';",
        '',
        'const blog = defineCollection({',
        "  type: 'content',",
        '  schema: z.object({',
        '    title: z.string(),',
        '  }).passthrough(),',
        '});',
        '',
        'export const collections = { blog };',
        '',
      ].join('\n'),
    );
    const out = preflightSchemaForProject(project);
    expect(out.kind).toBe('compatible');
  });

  it('returns uncertain when schema is strict and has no deskwork field', () => {
    touch('astro.config.mjs', 'export default {};\n');
    touch(
      'src/content/config.ts',
      [
        "import { defineCollection, z } from 'astro:content';",
        '',
        'const blog = defineCollection({',
        "  type: 'content',",
        '  schema: z.object({',
        '    title: z.string(),',
        '    description: z.string().optional(),',
        '  }),',
        '});',
        '',
        'export const collections = { blog };',
        '',
      ].join('\n'),
    );
    const out = preflightSchemaForProject(project);
    expect(out.kind).toBe('uncertain');
    if (out.kind === 'uncertain') {
      expect(out.schemaPath?.endsWith('src/content/config.ts')).toBe(true);
    }
  });

  it('also reads the newer src/content.config.ts location', () => {
    touch('astro.config.mjs', 'export default {};\n');
    touch(
      'src/content.config.ts',
      [
        "import { defineCollection, z } from 'astro:content';",
        '',
        'const blog = defineCollection({',
        '  schema: z.object({',
        '    deskwork: z.object({ id: z.string().uuid() }).optional(),',
        '  }),',
        '});',
        '',
      ].join('\n'),
    );
    const out = preflightSchemaForProject(project);
    expect(out.kind).toBe('compatible');
  });

  it('top-level `id: z.string().uuid()` is NOT a compatibility signal', () => {
    // Issue #41 motivation: the legacy install instructions told operators
    // to add top-level id, but doctor writes the binding under deskwork.id.
    // A schema with only top-level id (and no deskwork field, no
    // passthrough) must NOT register as compatible — that's exactly the
    // failure mode the preflight is supposed to surface.
    touch('astro.config.mjs', 'export default {};\n');
    touch(
      'src/content/config.ts',
      [
        "import { defineCollection, z } from 'astro:content';",
        '',
        'const blog = defineCollection({',
        '  schema: z.object({',
        '    title: z.string(),',
        '    id: z.string().uuid().optional(),',
        '  }),',
        '});',
        '',
      ].join('\n'),
    );
    const out = preflightSchemaForProject(project);
    expect(out.kind).toBe('uncertain');
  });
});

// ---------------------------------------------------------------------------
// Existing-pipeline detection (Issue #45)
// ---------------------------------------------------------------------------

describe('detectExistingPipeline', () => {
  it('returns no signals on a bare project', () => {
    const signals = detectExistingPipeline(project);
    expect(signals).toEqual([]);
  });

  it('detects journal/editorial/ tree', () => {
    mkdir('journal/editorial/history');
    const signals = detectExistingPipeline(project);
    expect(signals.some((s) => s.kind === 'journal-tree')).toBe(true);
  });

  it('does NOT trip on a single coincidental editorial-* skill', () => {
    mkdir('.claude/skills/editorial-add');
    const signals = detectExistingPipeline(project);
    const skillSignals = signals.filter((s) => s.kind === 'editorial-skill');
    expect(skillSignals).toEqual([]);
  });

  it('reports editorial-* skills when at least three are present', () => {
    mkdir('.claude/skills/editorial-add');
    mkdir('.claude/skills/editorial-plan');
    mkdir('.claude/skills/editorial-outline');
    const signals = detectExistingPipeline(project);
    const skillSignals = signals.filter((s) => s.kind === 'editorial-skill');
    expect(skillSignals.length).toBeGreaterThanOrEqual(3);
    for (const s of skillSignals) {
      expect(s.relativePath.startsWith('.claude/skills/editorial-')).toBe(
        true,
      );
    }
  });

  it('reports src/sites/<site>/pages/dev/editorial-*.astro pages', () => {
    mkdir('src/sites/audiocontrol/pages/dev');
    touch(
      'src/sites/audiocontrol/pages/dev/editorial-studio.astro',
      '<!-- placeholder -->\n',
    );
    const signals = detectExistingPipeline(project);
    const astroSignals = signals.filter(
      (s) => s.kind === 'editorial-astro-page',
    );
    expect(astroSignals).toHaveLength(1);
    expect(astroSignals[0].relativePath).toContain('editorial-studio.astro');
  });

  it('reports scripts/lib/editorial/ as a script-module signal', () => {
    mkdir('scripts/lib/editorial');
    const signals = detectExistingPipeline(project);
    const moduleSignals = signals.filter(
      (s) => s.kind === 'editorial-script-module',
    );
    expect(moduleSignals).toHaveLength(1);
    expect(moduleSignals[0].relativePath).toBe('scripts/lib/editorial/');
  });

  it('reports the full audiocontrol-shaped layout as multiple signals', () => {
    // The full configuration documented in Issue #45.
    mkdir('journal/editorial/history');
    mkdir('.claude/skills/editorial-add');
    mkdir('.claude/skills/editorial-plan');
    mkdir('.claude/skills/editorial-outline');
    mkdir('.claude/skills/editorial-publish');
    mkdir('src/sites/audiocontrol/pages/dev');
    touch(
      'src/sites/audiocontrol/pages/dev/editorial-studio.astro',
      '',
    );
    mkdir('scripts/lib/editorial-review');
    const signals = detectExistingPipeline(project);
    const kinds = new Set(signals.map((s) => s.kind));
    expect(kinds.has('journal-tree')).toBe(true);
    expect(kinds.has('editorial-skill')).toBe(true);
    expect(kinds.has('editorial-astro-page')).toBe(true);
    expect(kinds.has('editorial-script-module')).toBe(true);
  });
});
