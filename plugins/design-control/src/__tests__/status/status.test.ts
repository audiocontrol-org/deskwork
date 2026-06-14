import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createArchiveEntry, writeArchiveEntry } from '@/archive/store';
import { recordDerivation, recordDrivingWireframe } from '@/provenance/derived';
import { getSurfaceStatus, runDesignControlStatus } from '@/status/status';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function freshDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dc-status-'));
  dirs.push(dir);
  return dir;
}

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function writeGreenSpec(dir: string): string {
  writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
  const path = join(dir, 'design-language.md');
  writeFileSync(
    path,
    `### rule: ink-primary
- kind: palette
- css: studio.css .btn-primary
- example: compose button
- do: Use the ink palette for primary actions.
`,
  );
  return path;
}

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) } };
}

function writeManifest(dir: string, payload: unknown): string {
  const file = join(dir, 'surface.manifest.json');
  writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

const DEFAULT_VIEWPORTS = [
  { id: 'desktop', width: 1280 },
  { id: 'phone', width: 390 },
];

describe('getSurfaceStatus', () => {
  it('reports complete when archive acceptance, spec, provenance, and stale map are all green', () => {
    const dir = freshDir();
    const wireframePath = join(dir, 'surface.html');
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(wireframePath, wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });

    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "stable";\n');

    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex(readFileSync(sourcePath, 'utf8')) }],
      },
    });

    const result = getSurfaceStatus(manifestPath);
    expect(result.complete).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('flags an unaccepted archive decision', () => {
    const dir = freshDir();
    const wireframePath = join(dir, 'surface.html');
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(wireframePath, wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "stable";\n');
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex(readFileSync(sourcePath, 'utf8')) }],
      },
    });

    expect(getSurfaceStatus(manifestPath).findings.map((item) => item.rule)).toContain('unaccepted-decision');
  });

  it('flags a derived artifact accepted without a recorded operator edit', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Derived</h1></body></html>';
    const wireframePath = join(dir, 'surface.html');
    writeFileSync(wireframePath, wireframeHtml);
    recordDerivation({ dir, surfaceId: 'surface', derivedHtml: wireframeHtml, source: 'live surface' });
    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "stable";\n');
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex(readFileSync(sourcePath, 'utf8')) }],
      },
    });

    expect(getSurfaceStatus(manifestPath).findings.map((item) => item.rule)).toContain('derived-unedited');
  });

  it('flags a dead-link spec', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(join(dir, 'surface.html'), wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    writeFileSync(join(dir, 'studio.css'), '.real { color: navy; }\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: ink-primary
- kind: palette
- css: studio.css .ghost
- example: compose button
- do: Use the ink palette for primary actions.
`,
    );
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "stable";\n');
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex(readFileSync(sourcePath, 'utf8')) }],
      },
    });

    expect(getSurfaceStatus(manifestPath).findings.map((item) => item.rule)).toContain('dead-link-spec');
  });

  it('flags non-link design-spec findings as incomplete', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(join(dir, 'surface.html'), wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    writeFileSync(join(dir, 'studio.css'), '.btn-primary { color: navy; }\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: ink-primary
- kind: palette
- css: studio.css .btn-primary
- do: Use the ink palette for primary actions.
`,
    );
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "stable";\n');
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex(readFileSync(sourcePath, 'utf8')) }],
      },
    });

    expect(getSurfaceStatus(manifestPath).findings.map((item) => item.rule)).toContain('invalid-design-spec');
  });

  it('flags an unchecked-link spec as incomplete', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(join(dir, 'surface.html'), wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    writeFileSync(join(dir, 'styles.ts'), 'export const btn = ".btn";\n');
    const specPath = join(dir, 'design-language.md');
    writeFileSync(
      specPath,
      `### rule: ink-primary
- kind: palette
- css: styles.ts .btn
- example: compose button
- do: Use the ink palette for primary actions.
`,
    );
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "stable";\n');
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex(readFileSync(sourcePath, 'utf8')) }],
      },
    });

    const result = getSurfaceStatus(manifestPath);
    expect(result.complete).toBe(false);
    expect(result.findings.map((item) => item.rule)).toContain('unchecked-link-spec');
  });

  it('flags stale mapped source drift', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(join(dir, 'surface.html'), wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "changed";\n');
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex('export const UI = "stable";\n') }],
      },
    });

    expect(getSurfaceStatus(manifestPath).findings.map((item) => item.rule)).toContain('stale-surface');
  });

  it('accepts an explicit operator-approved stale-surface descope', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(join(dir, 'surface.html'), wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: { mode: 'operator-approved-descope', rationale: 'Graph-derived source mapping is not feasible for this surface.' },
    });

    const result = getSurfaceStatus(manifestPath);
    expect(result.complete).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('flags an archive entry whose accepted wireframe does not match the manifest', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(join(dir, 'surface.html'), wireframeHtml);
    writeFileSync(join(dir, 'other.html'), wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'other.html',
        acceptedWireframePath: 'other.html',
        implementationCommit: 'abc1234',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "stable";\n');
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex(readFileSync(sourcePath, 'utf8')) }],
      },
    });

    expect(getSurfaceStatus(manifestPath).findings.map((item) => item.rule)).toContain('unaccepted-decision');
  });

  it('flags driving provenance that no longer matches the wireframe artifact', () => {
    const dir = freshDir();
    const wireframePath = join(dir, 'surface.html');
    writeFileSync(wireframePath, '<html><body><h1>Wireframe</h1></body></html>');
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    writeFileSync(wireframePath, '<html><body><h1>Changed</h1></body></html>');
    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const sourcePath = join(dir, 'ui-source.ts');
    writeFileSync(sourcePath, 'export const UI = "stable";\n');
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(readFileSync(wireframePath, 'utf8')) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: {
        mode: 'mapped',
        sourceFiles: [{ path: 'ui-source.ts', sha256: sha256Hex(readFileSync(sourcePath, 'utf8')) }],
      },
    });

    expect(getSurfaceStatus(manifestPath).findings.map((item) => item.rule)).toContain('missing-wireframe-provenance');
  });

  it('does not emit a provenance finding when the wireframe artifact is already missing', () => {
    const dir = freshDir();
    writeFileSync(join(dir, 'surface.html'), '<html><body><h1>Wireframe</h1></body></html>');
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    unlinkSync(join(dir, 'surface.html'));
    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex('wireframe') },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
      staleSurface: { mode: 'operator-approved-descope', rationale: 'Not needed for this test.' },
    });

    const rules = getSurfaceStatus(manifestPath).findings.map((item) => item.rule);
    expect(rules).toContain('missing-wireframe');
    expect(rules).not.toContain('missing-wireframe-provenance');
  });

  it('flags missing stale-surface mapping as a separate gate', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(join(dir, 'surface.html'), wireframeHtml);
    recordDrivingWireframe({ dir, surfaceId: 'surface', wireframeFile: 'surface.html' });
    const specPath = writeGreenSpec(dir);
    const archivePath = join(dir, 'surface.archive.json');
    writeArchiveEntry(
      archivePath,
      createArchiveEntry({
        surfaceId: 'surface',
        brief: 'Regroup the layout',
        proposalWireframePath: 'surface.html',
        acceptedWireframePath: 'surface.html',
        implementationCommit: 'abc1234',
      }),
    );
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(specPath, 'utf8')) },
      archive: { path: 'surface.archive.json' },
    });

    expect(getSurfaceStatus(manifestPath).findings.map((item) => item.rule)).toContain('stale-surface-unmapped');
  });

  it('rejects a symlinked artifact that escapes the collection root (AUDIT-20260614-16)', () => {
    const collection = freshDir();
    const outside = freshDir();
    const outsideFile = join(outside, 'real.html');
    writeFileSync(outsideFile, '<html><body><h1>Outside</h1></body></html>');
    // A collection-relative-looking symlink whose target resolves outside the root.
    symlinkSync(outsideFile, join(collection, 'surface.html'));

    const manifestPath = writeManifest(collection, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex('wireframe') },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec') },
      archive: { path: 'surface.archive.json' },
    });

    const result = getSurfaceStatus(manifestPath);
    expect(result.complete).toBe(false);
    expect(result.findings.map((item) => item.rule)).toContain('malformed-manifest');
    expect(result.findings[0].message).toContain('must stay within the collection root');
  });

  it('returns a structured finding when the wireframe artifact is unreadable instead of crashing (AUDIT-20260614-15)', () => {
    const dir = freshDir();
    // existsSync is true but readFileSync throws (EISDIR) — simulates a concurrent
    // replace/unreadable artifact between the presence check and the hash read.
    mkdirSync(join(dir, 'surface.html'));
    writeGreenSpec(dir);

    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex('wireframe') },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex(readFileSync(join(dir, 'design-language.md'), 'utf8')) },
      archive: { path: 'surface.archive.json' },
    });

    const result = getSurfaceStatus(manifestPath);
    expect(result.complete).toBe(false);
    const wireframeFinding = result.findings.find((item) => item.rule === 'missing-wireframe');
    expect(wireframeFinding?.message).toContain('could not be read');
  });

  it('returns a structured finding when the design spec is unreadable instead of crashing (AUDIT-20260614-15)', () => {
    const dir = freshDir();
    const wireframeHtml = '<html><body><h1>Wireframe</h1></body></html>';
    writeFileSync(join(dir, 'surface.html'), wireframeHtml);
    // existsSync true, readFileSync throws (EISDIR).
    mkdirSync(join(dir, 'design-language.md'));

    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex(wireframeHtml) },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec') },
      archive: { path: 'surface.archive.json' },
    });

    const result = getSurfaceStatus(manifestPath);
    expect(result.complete).toBe(false);
    const specFinding = result.findings.find((item) => item.rule === 'missing-design-spec');
    expect(specFinding?.message).toContain('could not be read');
  });
});

describe('runDesignControlStatus', () => {
  it('returns usage on missing args', () => {
    const { err, io } = capture();
    expect(runDesignControlStatus([], io)).toBe(2);
    expect(err.join('\n')).toContain('usage: design-control-status');
  });

  it('returns 1 and prints findings for a malformed manifest', () => {
    const dir = freshDir();
    const manifestPath = writeManifest(dir, { version: 1 });
    const { err, io } = capture();
    expect(runDesignControlStatus([manifestPath], io)).toBe(1);
    expect(err.join('\n')).toContain('malformed-manifest');
  });

  it('returns 1 for a manifest missing the required phone viewport', () => {
    const dir = freshDir();
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: [{ id: 'desktop', width: 1280 }],
      wireframe: { path: 'surface.html', sha256: sha256Hex('wireframe') },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec') },
      archive: { path: 'surface.archive.json' },
    });
    const { err, io } = capture();
    expect(runDesignControlStatus([manifestPath], io)).toBe(1);
    expect(err.join('\n')).toContain('phone viewport');
  });

  it('returns 1 for a manifest missing the implementation commit', () => {
    const dir = freshDir();
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'surface.html', sha256: sha256Hex('wireframe') },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec') },
      archive: { path: 'surface.archive.json' },
    });
    const { err, io } = capture();
    expect(runDesignControlStatus([manifestPath], io)).toBe(1);
    expect(err.join('\n')).toContain('implementationCommit');
  });

  it('returns 1 for a manifest using an absolute artifact path', () => {
    const dir = freshDir();
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: '/tmp/surface.html', sha256: sha256Hex('wireframe') },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec') },
      archive: { path: 'surface.archive.json' },
    });
    const { err, io } = capture();
    expect(runDesignControlStatus([manifestPath], io)).toBe(1);
    expect(err.join('\n')).toContain('collection-relative');
  });

  it('returns 1 for a manifest using a path that escapes the collection root', () => {
    const dir = freshDir();
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: '../outside/surface.html', sha256: sha256Hex('wireframe') },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec') },
      archive: { path: 'surface.archive.json' },
    });
    const { err, io } = capture();
    expect(runDesignControlStatus([manifestPath], io)).toBe(1);
    // A `../`-escaping path is now rejected EARLIER at schema-parse time (it is
    // provably not collection-relative by pure-string inspection) rather than at
    // resolution time. assertWithinCollection still guards resolution-context
    // escapes (symlinks, subdirectory manifests) the string check cannot see —
    // see the AUDIT-20260614-16 symlink case above.
    expect(err.join('\n')).toContain('collection-relative');
  });

  it('returns 1 for a manifest using a Windows drive-rooted artifact path (AUDIT-20260614-12/-13)', () => {
    const dir = freshDir();
    const manifestPath = writeManifest(dir, {
      version: 1,
      surfaceId: 'surface',
      changeIntentBrief: 'Regroup the layout',
      implementationCommit: 'abc1234',
      routeState: '/studio/default',
      viewports: DEFAULT_VIEWPORTS,
      wireframe: { path: 'C:\\Users\\surface.html', sha256: sha256Hex('wireframe') },
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec') },
      archive: { path: 'surface.archive.json' },
    });
    const { err, io } = capture();
    expect(runDesignControlStatus([manifestPath], io)).toBe(1);
    expect(err.join('\n')).toContain('collection-relative');
  });
});
