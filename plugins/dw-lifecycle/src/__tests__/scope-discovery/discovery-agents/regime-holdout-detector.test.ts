/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/discovery-agents/regime-holdout-detector.test.ts
 *
 * Adversarial vitest suite for the Phase 4 Family A regime-holdout-
 * detector agent. Ported from the audiocontrol pilot's
 * `regime-holdout-detector.scenarios.ts` + `regime-holdout-detector.validate.ts`
 * (the pilot's harness entry + 9-scenario library are consolidated here
 * as `describe` + `it` blocks).
 *
 * The nine scenarios cover:
 *   1. empty registries + clean source tree → findings: [], total: 0.
 *   2. anti-pattern catch — registry has one entry; source matches.
 *   3. adopter-manifest holdout catch.
 *   4. editor-symmetry partial/missing cell.
 *   5. deprecation gate live — port landed in commit 4da4660 (closes #287);
 *      asserts the scanner surfaces an importer-line finding against a
 *      `@deprecated`-marked file.
 *   6. mixed sources — three contribute; meta counts reconcile.
 *   7. evidence back-pointers valid (destination path: .dw-lifecycle/...).
 *   8. JSON output passes the `isRegimeHoldoutFindings` type-predicate.
 *   9. gutted-stub self-check — stub returns 0 findings; the anti-
 *      pattern assertion REJECTS it, proving the harness has signal.
 *
 * Subprocess invocation goes through the agent's standalone CLI entry
 * (the same path the orchestrator's runtime imports + `runAgentCli`
 * dispatches when invoked directly). The fixture passes
 * `--module-root modules` so canned source paths `modules/foo-editor/...`
 * remain valid against the configured-module-root layout (the
 * destination default is `'src'`).
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import {
  cleanup,
  invokeAgent,
  makeFixture,
  payloads,
  plantEmptyRegistries,
  writeAdopterManifests,
  writeAntiPatterns,
  writeSource,
} from './regime-holdout-detector.fixtures.js';
import { isRegimeHoldoutFindings } from '../../../scope-discovery/discovery-agents/types.js';

describe('regime-holdout-detector — core scenarios', () => {
  it('empty registries + clean tree → findings: [], meta.total: 0', async () => {
    const fixture = await makeFixture('empty');
    try {
      await plantEmptyRegistries(fixture);
      const { run, payload } = await invokeAgent(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(
        isRegimeHoldoutFindings(payload),
        `payload missing regime-holdout shape; stdout=${run.stdout.slice(0, 200)}`,
      ).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      expect(payload.findings).toHaveLength(0);
      expect(payload.meta.total).toBe(0);
    } finally {
      await cleanup(fixture);
    }
  });

  it('anti-pattern match surfaces with correct source, id, file', async () => {
    const fixture = await makeFixture('anti-pat');
    try {
      await writeAntiPatterns(fixture, payloads.ANTI_PATTERN_REGISTRY_ONE);
      await writeAdopterManifests(fixture, 'adopter_manifests: []\n');
      await writeSource(
        fixture,
        'modules/foo-editor/src/Drawer.tsx',
        payloads.ANTI_PATTERN_SOURCE_MATCH,
      );
      const { run, payload } = await invokeAgent(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(isRegimeHoldoutFindings(payload)).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      expect(payload.meta.anti_pattern_count).toBe(1);
      const f = payload.findings.find((x) => x.source === 'anti-pattern');
      expect(f, 'expected one anti-pattern finding').toBeDefined();
      expect(f?.id).toBe('legacy-slide-drawer');
      expect(f?.file.endsWith('modules/foo-editor/src/Drawer.tsx')).toBe(true);
    } finally {
      await cleanup(fixture);
    }
  });

  it('adopter-manifest holdout surfaces with correct file', async () => {
    const fixture = await makeFixture('adopter');
    try {
      await writeAntiPatterns(fixture, 'anti_patterns: []\n');
      await writeAdopterManifests(fixture, payloads.ADOPTER_MANIFEST_REGISTRY_ONE);
      // Two editor files matching the glob — one adopts, one holds out.
      await writeSource(
        fixture,
        'modules/foo-editor/src/PatchEditor.tsx',
        payloads.ADOPTER_HOLDOUT_SOURCE,
      );
      await writeSource(
        fixture,
        'modules/foo-editor/src/ToneEditor.tsx',
        payloads.ADOPTER_ADOPTING_SOURCE,
      );
      const { run, payload } = await invokeAgent(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(isRegimeHoldoutFindings(payload)).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      expect(payload.meta.adopter_manifest_count).toBe(1);
      const f = payload.findings.find((x) => x.source === 'adopter-manifest');
      expect(f, 'expected an adopter-manifest finding').toBeDefined();
      expect(f?.id).toBe('slide-drawer-adoption');
      expect(f?.file.endsWith('PatchEditor.tsx')).toBe(true);
    } finally {
      await cleanup(fixture);
    }
  });

  it('editor-symmetry partial/missing cell surfaces with composite id', async () => {
    const fixture = await makeFixture('symmetry');
    try {
      await writeAntiPatterns(fixture, 'anti_patterns: []\n');
      await writeAdopterManifests(fixture, payloads.SYMMETRY_REGISTRY_TWO_EDITORS);
      // foo-editor adopts; bar-editor has a Page that doesn't import.
      await writeSource(
        fixture,
        'modules/foo-editor/src/HomePage.tsx',
        payloads.LIST_BANK_IMPORT,
      );
      await writeSource(
        fixture,
        'modules/bar-editor/src/HomePage.tsx',
        payloads.LIST_BANK_HOLDOUT,
      );
      const { run, payload } = await invokeAgent(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(isRegimeHoldoutFindings(payload)).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      expect(
        payload.meta.module_symmetry_holdout_count,
        `expected at least 1 module-symmetry finding; got ${payload.meta.module_symmetry_holdout_count}`,
      ).toBeGreaterThanOrEqual(1);
      const f = payload.findings.find(
        (x) => x.source === 'module-symmetry' && x.id.includes('bar-editor'),
      );
      expect(f, 'expected a module-symmetry finding naming bar-editor').toBeDefined();
    } finally {
      await cleanup(fixture);
    }
  });

  it('deprecation gate surfaces importer-line findings against a @deprecated file (#287 closure)', async () => {
    // Pilot Scenario 5 (`scenarioDeprecationCatch`): the deprecation-
    // scan gate surfaces importer-line findings against a
    // `@deprecated`-marked file. Port landed in commit 4da4660
    // (closes https://github.com/audiocontrol-org/deskwork/issues/287);
    // basename-relative resolution catches the `@/components/OldEnvelope`
    // importer against the `modules/foo-editor/src/components/OldEnvelope.ts`
    // candidate.
    const fixture = await makeFixture('deprecation');
    try {
      await plantEmptyRegistries(fixture);
      await writeSource(
        fixture,
        'modules/foo-editor/src/components/OldEnvelope.ts',
        payloads.DEPRECATED_FILE_CONTENT,
      );
      await writeSource(
        fixture,
        'modules/foo-editor/src/Page.tsx',
        payloads.DEPRECATED_IMPORTER_CONTENT,
      );
      const { run, payload } = await invokeAgent(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(isRegimeHoldoutFindings(payload)).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      expect(
        payload.meta.deprecation_count,
        `expected at least 1 deprecation finding; got ${payload.meta.deprecation_count}`,
      ).toBeGreaterThanOrEqual(1);
      const deprecationFinding = payload.findings.find((x) => x.source === 'deprecation');
      expect(
        deprecationFinding,
        'expected a deprecation finding from the post-port scanner',
      ).toBeDefined();
    } finally {
      await cleanup(fixture);
    }
  });

  it('mixed sources contribute; meta totals reconcile against findings array', async () => {
    const fixture = await makeFixture('mixed');
    try {
      await writeAntiPatterns(fixture, payloads.ANTI_PATTERN_REGISTRY_ONE);
      await writeAdopterManifests(fixture, payloads.ADOPTER_MANIFEST_REGISTRY_ONE);
      // anti-pattern: drawer source matches the regex.
      await writeSource(
        fixture,
        'modules/foo-editor/src/Drawer.tsx',
        payloads.ANTI_PATTERN_SOURCE_MATCH,
      );
      // adopter-manifest: editor file fails the import expectation.
      await writeSource(
        fixture,
        'modules/foo-editor/src/PatchEditor.tsx',
        payloads.ADOPTER_HOLDOUT_SOURCE,
      );
      // Deprecation source files contribute one finding via the
      // post-port scanner (#287 closure in commit 4da4660).
      await writeSource(
        fixture,
        'modules/foo-editor/src/components/OldEnvelope.ts',
        payloads.DEPRECATED_FILE_CONTENT,
      );
      await writeSource(
        fixture,
        'modules/foo-editor/src/Page.tsx',
        payloads.DEPRECATED_IMPORTER_CONTENT,
      );
      const { run, payload } = await invokeAgent(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(isRegimeHoldoutFindings(payload)).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      expect(payload.meta.anti_pattern_count).toBe(1);
      expect(payload.meta.adopter_manifest_count).toBe(1);
      expect(payload.meta.deprecation_count).toBeGreaterThanOrEqual(1);
      const expectedTotal =
        payload.meta.anti_pattern_count +
        payload.meta.adopter_manifest_count +
        payload.meta.module_symmetry_holdout_count +
        payload.meta.deprecation_count;
      expect(payload.meta.total).toBe(expectedTotal);
      expect(payload.findings.length).toBe(expectedTotal);
    } finally {
      await cleanup(fixture);
    }
  });

  it('every finding carries non-empty evidence back-pointer to its registry', async () => {
    const fixture = await makeFixture('evidence');
    try {
      await writeAntiPatterns(fixture, payloads.ANTI_PATTERN_REGISTRY_ONE);
      await writeAdopterManifests(fixture, 'adopter_manifests: []\n');
      await writeSource(
        fixture,
        'modules/foo-editor/src/Drawer.tsx',
        payloads.ANTI_PATTERN_SOURCE_MATCH,
      );
      const { run, payload } = await invokeAgent(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(isRegimeHoldoutFindings(payload)).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      for (const f of payload.findings) {
        expect(typeof f.evidence.registryPath).toBe('string');
        expect(f.evidence.registryPath.length).toBeGreaterThan(0);
        expect(typeof f.evidence.registryId).toBe('string');
        expect(f.evidence.registryId.length).toBeGreaterThan(0);
      }
      const antiPatternFinding = payload.findings.find((x) => x.source === 'anti-pattern');
      expect(antiPatternFinding, 'no anti-pattern finding to verify').toBeDefined();
      // Destination path rewrite: .dw-lifecycle/scope-discovery/ (not
      // the pilot's docs/scope-discovery/).
      expect(antiPatternFinding?.evidence.registryPath).toBe(
        '.dw-lifecycle/scope-discovery/anti-patterns.yaml',
      );
      expect(antiPatternFinding?.evidence.registryId).toBe('legacy-slide-drawer');
    } finally {
      await cleanup(fixture);
    }
  });

  it('JSON output passes the type predicate; agent name + featureSlug propagate', async () => {
    const fixture = await makeFixture('json-shape');
    try {
      await plantEmptyRegistries(fixture);
      const { run, payload } = await invokeAgent(fixture);
      expect(run.code, `stderr=${run.stderr}`).toBe(0);
      expect(
        isRegimeHoldoutFindings(payload),
        'isRegimeHoldoutFindings rejected payload — agent emitted wrong shape',
      ).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      expect(payload.agent).toBe('regime-holdout-detector');
      expect(payload.featureSlug).toBe('test-feature');
    } finally {
      await cleanup(fixture);
    }
  });
});

describe('regime-holdout-detector — gutted-stub self-check', () => {
  it('gutted stub returns 0 findings; the real anti-pattern assertion would reject it', async () => {
    // Plants a stub that always emits a 0-findings payload. Re-runs
    // the anti-pattern-catch source layout against the stub; the
    // anti-pattern assertion (`meta.anti_pattern_count === 1`) MUST
    // reject the stub's empty response — that's the signal the
    // assertion carries.
    const fixture = await makeFixture('gutted');
    const stubDir = await mkdtemp(join(tmpdir(), 'regime-stub-'));
    const stubPath = join(stubDir, 'stub.ts');
    try {
      const stubPayload = {
        agent: 'regime-holdout-detector',
        featureSlug: 'test-feature',
        findings: [],
        meta: {
          anti_pattern_count: 0,
          adopter_manifest_count: 0,
          module_symmetry_holdout_count: 0,
          deprecation_count: 0,
          total: 0,
        },
      };
      await writeFile(
        stubPath,
        `process.stdout.write(${JSON.stringify(JSON.stringify(stubPayload))} + '\\n');\nprocess.exit(0);\n`,
        'utf8',
      );
      await writeAntiPatterns(fixture, payloads.ANTI_PATTERN_REGISTRY_ONE);
      await writeAdopterManifests(fixture, 'adopter_manifests: []\n');
      await writeSource(
        fixture,
        'modules/foo-editor/src/Drawer.tsx',
        payloads.ANTI_PATTERN_SOURCE_MATCH,
      );
      const { run, payload } = await invokeAgent(fixture, stubPath);
      expect(
        isRegimeHoldoutFindings(payload),
        'stub payload should still pass the type-predicate; harness contract broken',
      ).toBe(true);
      if (!isRegimeHoldoutFindings(payload)) return;
      // The stub emits 0 anti-pattern findings; the real-agent
      // assertion (the "anti-pattern-catch" test above) requires 1.
      // Confirm the stub's count is what the production assertion
      // would reject — that's the teeth check.
      expect(run.code).toBe(0);
      expect(payload.meta.anti_pattern_count).toBe(0);
    } finally {
      await cleanup(fixture);
      await rm(stubDir, { recursive: true, force: true });
    }
  });
});
