/**
 * plugins/stack-control/src/__tests__/scope-discovery/discovery-agents.test.ts
 *
 * 010 T031 (US3, FR-018) — the four universal discovery agents produce
 * expected surfaces over an on-disk fixture, and the route-enumerator's
 * router-strategy default is override-able.
 *
 * Universal agents (always-on, no registry gating):
 *   - ui-route-enumerator
 *   - pattern-matrix (buildPatternMatrix)
 *   - clone-detector-reader
 *   - prd-themed-pattern-hunter (huntPrdThemes)
 *
 * Builds a real fixture tree on disk (never mocks fs).
 */

import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  enumerateUiRoutes,
  type RouterStrategy,
} from '../../scope-discovery/discovery-agents/ui-route-enumerator.js';
import { buildPatternMatrix } from '../../scope-discovery/discovery-agents/pattern-matrix.js';
import { readCloneDetectorOutput } from '../../scope-discovery/discovery-agents/clone-detector-reader.js';
import { huntPrdThemes } from '../../scope-discovery/discovery-agents/prd-themed-pattern-hunter.js';
import type { DiscoveryAgentInput } from '../../scope-discovery/discovery-agents/types.js';

const PRD = [
  '# Feature: agents-fixture',
  '',
  '## Overview',
  '',
  'The widget module is the surface under discovery. widget widget.',
  '',
].join('\n');

// One module file carries an `as Foo` cast → the builtin as-type-cast
// pattern fires a hit. Several novel-shaped sibling files exist so the
// unmatched-shape clustering pass has material.
const WIDGET_A = [
  'export const widgetA = (x: unknown) => x as Foo;',
  'export const widgetA2 = 1;',
].join('\n');

const APP_TSX = [
  'import { Routes, Route } from "react-router-dom";',
  'export function App() {',
  '  return (',
  '    <Routes>',
  '      <Route path="dashboard" element={<DashboardPage />} />',
  '      <Route path="settings" element={<SettingsPage />} />',
  '    </Routes>',
  '  );',
  '}',
].join('\n');

const CLONES_YAML = [
  'generated_at: 2026-06-10T00:00:00Z',
  'clones:',
  '  - id: abcd1234ef56',
  '    lines: 12',
  '    members:',
  '      - src/widget/a.ts:1-12',
  '      - src/widget/b.ts:1-12',
  '    disposition: pending',
  '    reason: null',
  '',
].join('\n');

interface Fixture {
  readonly root: string;
  readonly input: DiscoveryAgentInput;
  cleanup(): Promise<void>;
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'agents-'));
  const docsDir = join(root, 'docs', '1.0', '001-IN-PROGRESS', 'agents-fixture');
  await mkdir(docsDir, { recursive: true });
  const prdPath = join(docsDir, 'prd.md');
  await writeFile(prdPath, PRD, 'utf8');

  const widgetDir = join(root, 'src', 'widget');
  await mkdir(widgetDir, { recursive: true });
  await writeFile(join(widgetDir, 'a.ts'), WIDGET_A, 'utf8');
  await writeFile(join(widgetDir, 'b.ts'), 'export const widgetB = 2;\n', 'utf8');

  // Repo-root App.tsx so the default react-router strategy detects, plus
  // the module-level App.tsx that actually carries the routes.
  await writeFile(join(root, 'src', 'App.tsx'), APP_TSX, 'utf8');
  await writeFile(join(widgetDir, 'src', 'App.tsx'), APP_TSX, 'utf8').catch(
    async () => {
      await mkdir(join(widgetDir, 'src'), { recursive: true });
      await writeFile(join(widgetDir, 'src', 'App.tsx'), APP_TSX, 'utf8');
    },
  );

  const sdDir = join(root, '.stack-control', 'scope-discovery');
  await mkdir(sdDir, { recursive: true });
  await writeFile(join(sdDir, 'clones.yaml'), CLONES_YAML, 'utf8');

  return {
    root,
    input: {
      featureSlug: 'agents-fixture',
      prdPath,
      repoRoot: root,
      moduleRoot: 'src',
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

describe('discovery-agents — universal four produce expected surfaces (T031)', () => {
  it('pattern-matrix surfaces the as-type-cast builtin hit', async () => {
    const fixture = await makeFixture();
    try {
      const out = await buildPatternMatrix(fixture.input);
      expect(out.agent).toBe('ast-grep-matrix');
      const asCast = out.patterns.find((p) => p.id === 'as-type-cast');
      expect(asCast).toBeDefined();
      expect((asCast?.hits ?? []).length).toBeGreaterThan(0);
      // discoveredCandidates is always emitted (may be empty).
      expect(out.discoveredCandidates).toBeDefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it('clone-detector-reader reads the dispositioned baseline', async () => {
    const fixture = await makeFixture();
    try {
      const out = await readCloneDetectorOutput(fixture.input);
      expect(out.agent).toBe('clone-detector-reader');
      expect(out.clones.length).toBe(1);
      expect(out.clones[0]?.members.length).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('prd-themed-pattern-hunter surfaces the PRD theme', async () => {
    const fixture = await makeFixture();
    try {
      const out = await huntPrdThemes(fixture.input);
      expect(out.agent).toBe('prd-themed-pattern-hunter');
      expect(out.themes.length).toBeGreaterThan(0);
    } finally {
      await fixture.cleanup();
    }
  });

  it('ui-route-enumerator enumerates routes via the bundled default strategy', async () => {
    const fixture = await makeFixture();
    try {
      const out = await enumerateUiRoutes(fixture.input);
      expect(out.agent).toBe('ui-route-enumerator');
      const paths = out.routes.map((r) => r.path).sort();
      expect(paths).toContain('dashboard');
      expect(paths).toContain('settings');
    } finally {
      await fixture.cleanup();
    }
  });
});

describe('ui-route-enumerator — router-strategy default is override-able (FR-018, T031)', () => {
  it('uses an operator-supplied strategy in place of the bundled default', async () => {
    const fixture = await makeFixture();
    try {
      // A custom strategy that always detects and emits a fixed,
      // unmistakable route. If the override seam works, this route
      // surfaces INSTEAD of the react-router one.
      let detectCalled = false;
      const customStrategy: RouterStrategy = {
        id: 'custom-test-strategy',
        async detect() {
          detectCalled = true;
          return true;
        },
        async enumerate() {
          return [
            {
              module: '.',
              path: 'custom-override-route',
              file: 'virtual/routes.ts',
              pageFile: null,
            },
          ];
        },
      };

      const out = await enumerateUiRoutes(fixture.input, [customStrategy]);
      expect(detectCalled).toBe(true);
      const paths = out.routes.map((r) => r.path);
      // The custom strategy's route surfaces; the bundled react-router
      // routes do NOT (the default registry was overridden).
      expect(paths).toContain('custom-override-route');
      expect(paths).not.toContain('dashboard');
    } finally {
      await fixture.cleanup();
    }
  });
});
