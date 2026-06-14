import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  parseRefereeRequestManifest,
  refereeRequestManifestSchema,
} from '@/manifests/referee-request';

function sha256Hex(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

const DEFAULT_VIEWPORTS = [
  { id: 'desktop', width: 1280 },
  { id: 'phone', width: 390 },
];

function baseFields() {
  return {
    version: 1,
    surfaceId: 'studio-content-browser',
    routeState: '/studio/default',
    viewports: DEFAULT_VIEWPORTS,
    wireframe: { path: 'surface.html', sha256: sha256Hex('wireframe') },
    designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec') },
    implementationCommit: 'abc1234',
    changeIntentBrief: 'Regroup the content browser into lanes.',
  };
}

function validRefereeControl() {
  return {
    baseline: { path: 'baselines/desktop.png', sha256: sha256Hex('baseline') },
    candidate: { path: 'candidates/desktop.png', sha256: sha256Hex('candidate') },
    stableRegions: [
      { id: 'masthead', locator: 'header.masthead', captureStep: 'default' },
    ],
    dynamicRegions: [
      { id: 'clock', locator: '.live-clock', justification: 'wall-clock text changes every second' },
    ],
    captureConfig: { identityHash: sha256Hex('recipe'), recipe: 'studio:default' },
    perViewportIdentity: [
      { viewportId: 'desktop', identityHash: sha256Hex('desktop-identity') },
      { viewportId: 'phone', identityHash: sha256Hex('phone-identity') },
    ],
    principal: { id: 'editor', storageStateRef: 'editor-session' },
  };
}

function validScaffold(overrides: Record<string, unknown> = {}) {
  return { mode: 'scaffold', ...baseFields(), ...overrides };
}

function validRefereePreview(overrides: Record<string, unknown> = {}) {
  return { mode: 'referee-preview', ...baseFields(), referee: validRefereeControl(), ...overrides };
}

describe('refereeRequestManifestSchema', () => {
  it('accepts a scaffold manifest that omits the referee-control fields (acceptance 3)', () => {
    const manifest = parseRefereeRequestManifest(validScaffold());
    expect(manifest.mode).toBe('scaffold');
    expect(manifest.surfaceId).toBe('studio-content-browser');
    // scaffold omits referee — the v1-scaffold "no capture/baseline" boundary is preserved.
    expect('referee' in manifest && manifest.referee).toBeFalsy();
  });

  it('accepts a scaffold manifest that supplies a well-formed referee-control field (validated-when-present)', () => {
    const manifest = parseRefereeRequestManifest(validScaffold({ referee: validRefereeControl() }));
    expect(manifest.mode).toBe('scaffold');
    expect(manifest.referee?.stableRegions[0].locator).toBe('header.masthead');
  });

  it('rejects a scaffold manifest that supplies a referee-control field in malformed shape (acceptance 2)', () => {
    const bad = validRefereeControl();
    // stableRegions present but its locator is empty — structurally malformed.
    bad.stableRegions = [{ id: 'masthead', locator: '', captureStep: 'default' }];
    expect(() => parseRefereeRequestManifest(validScaffold({ referee: bad }))).toThrow();
  });

  it('accepts a well-formed referee-preview manifest', () => {
    const manifest = parseRefereeRequestManifest(validRefereePreview());
    expect(manifest.mode).toBe('referee-preview');
    expect(manifest.referee?.baseline.path).toBe('baselines/desktop.png');
  });

  it('rejects a referee-preview manifest that omits the referee field (acceptance 4)', () => {
    const { referee, ...withoutReferee } = validRefereePreview();
    void referee;
    expect(() => parseRefereeRequestManifest(withoutReferee)).toThrow();
  });

  it('rejects a referee-preview manifest whose referee field omits a required sub-field', () => {
    const manifest = validRefereePreview();
    const { stableRegions, ...refereeWithoutStable } = manifest.referee;
    void stableRegions;
    expect(() =>
      parseRefereeRequestManifest({ ...manifest, referee: refereeWithoutStable }),
    ).toThrow();
  });

  it('rejects a malformed base manifest — missing surfaceId (acceptance 1)', () => {
    const { surfaceId, ...withoutSurface } = validScaffold();
    void surfaceId;
    expect(() => parseRefereeRequestManifest(withoutSurface)).toThrow();
  });

  it('rejects a manifest missing the required phone viewport', () => {
    expect(() =>
      parseRefereeRequestManifest(validScaffold({ viewports: [{ id: 'desktop', width: 1280 }] })),
    ).toThrow();
  });

  it('rejects a manifest missing the required desktop viewport', () => {
    expect(() =>
      parseRefereeRequestManifest(validScaffold({ viewports: [{ id: 'phone', width: 390 }] })),
    ).toThrow();
  });

  it('rejects a machine-rooted (absolute) artifact path', () => {
    expect(() =>
      parseRefereeRequestManifest(
        validScaffold({ wireframe: { path: '/tmp/surface.html', sha256: sha256Hex('wireframe') } }),
      ),
    ).toThrow();
  });

  it('rejects a wireframe path that escapes the collection root via `../` (AUDIT-20260614-17)', () => {
    expect(() =>
      parseRefereeRequestManifest(
        validScaffold({ wireframe: { path: '../outside/surface.html', sha256: sha256Hex('wireframe') } }),
      ),
    ).toThrow();
    expect(
      refereeRequestManifestSchema.safeParse(
        validScaffold({ wireframe: { path: '../outside/surface.html', sha256: sha256Hex('wireframe') } }),
      ).success,
    ).toBe(false);
  });

  it('rejects a referee baseline path that escapes the collection root via `../../` (AUDIT-20260614-17)', () => {
    const referee = validRefereeControl();
    referee.baseline = { path: '../../outside.png', sha256: sha256Hex('baseline') };
    expect(() => parseRefereeRequestManifest(validRefereePreview({ referee }))).toThrow();
  });

  it('rejects a wireframe path with an embedded backslash escape `nested\\..\\outside.html` (AUDIT-20260614-18)', () => {
    expect(() =>
      parseRefereeRequestManifest(
        validScaffold({ wireframe: { path: 'nested\\..\\outside.html', sha256: sha256Hex('wireframe') } }),
      ),
    ).toThrow();
    expect(
      refereeRequestManifestSchema.safeParse(
        validScaffold({ wireframe: { path: 'nested\\..\\outside.html', sha256: sha256Hex('wireframe') } }),
      ).success,
    ).toBe(false);
  });

  it('still accepts a normal forward-slash subdirectory path (AUDIT-20260614-18 — no over-rejection)', () => {
    const manifest = parseRefereeRequestManifest(
      validScaffold({ wireframe: { path: 'baselines/desktop.png', sha256: sha256Hex('wireframe') } }),
    );
    expect(manifest.wireframe.path).toBe('baselines/desktop.png');
  });

  it('rejects an unknown mode', () => {
    expect(() => parseRefereeRequestManifest({ ...baseFields(), mode: 'capture' })).toThrow();
  });

  it('rejects a referee-preview manifest whose perViewportIdentity misses a declared viewport (AUDIT-20260614-19)', () => {
    const referee = {
      ...validRefereeControl(),
      perViewportIdentity: [{ viewportId: 'desktop', identityHash: sha256Hex('desktop-identity') }],
    };
    // viewports declare desktop + phone, but identity covers only desktop.
    expect(() => parseRefereeRequestManifest(validRefereePreview({ referee }))).toThrow();
  });

  it('rejects a duplicate viewportId in perViewportIdentity (AUDIT-20260614-19)', () => {
    const referee = {
      ...validRefereeControl(),
      perViewportIdentity: [
        { viewportId: 'desktop', identityHash: sha256Hex('desktop-identity') },
        { viewportId: 'desktop', identityHash: sha256Hex('desktop-identity-2') },
      ],
    };
    expect(() => parseRefereeRequestManifest(validRefereePreview({ referee }))).toThrow();
  });

  it('rejects perViewportIdentity referencing an undeclared viewport (AUDIT-20260614-19)', () => {
    const referee = {
      ...validRefereeControl(),
      perViewportIdentity: [
        { viewportId: 'desktop', identityHash: sha256Hex('desktop-identity') },
        { viewportId: 'phone', identityHash: sha256Hex('phone-identity') },
        { viewportId: 'tablet', identityHash: sha256Hex('tablet-identity') },
      ],
    };
    expect(() => parseRefereeRequestManifest(validRefereePreview({ referee }))).toThrow();
  });

  it('rejects a scaffold manifest whose supplied referee identity misses a declared viewport (AUDIT-20260614-19)', () => {
    const referee = {
      ...validRefereeControl(),
      perViewportIdentity: [{ viewportId: 'desktop', identityHash: sha256Hex('desktop-identity') }],
    };
    expect(() => parseRefereeRequestManifest(validScaffold({ referee }))).toThrow();
  });

  it('accepts a referee whose perViewportIdentity matches the declared viewports exactly (AUDIT-20260614-19)', () => {
    const manifest = parseRefereeRequestManifest(validRefereePreview());
    expect(manifest.referee?.perViewportIdentity.map((entry) => entry.viewportId).sort()).toEqual([
      'desktop',
      'phone',
    ]);
  });

  it('rejects a malformed sha256 on a referee baseline', () => {
    const referee = validRefereeControl();
    referee.baseline = { path: 'baselines/desktop.png', sha256: 'not-a-hash' };
    expect(() => parseRefereeRequestManifest(validRefereePreview({ referee }))).toThrow();
  });

  it('rejects a principal carrying an extra secret-bearing key like `token` (AUDIT-20260614-20)', () => {
    const referee = { ...validRefereeControl(), principal: { id: 'editor', storageStateRef: 'editor-session', token: 'secret' } };
    expect(() => parseRefereeRequestManifest(validRefereePreview({ referee }))).toThrow();
  });

  it('rejects a captureConfig carrying an unexpected extra key (AUDIT-20260614-20)', () => {
    const referee = { ...validRefereeControl(), captureConfig: { identityHash: sha256Hex('recipe'), recipe: 'studio:default', token: 'secret' } };
    expect(() => parseRefereeRequestManifest(validRefereePreview({ referee }))).toThrow();
  });

  it('rejects a misspelled top-level `refree` block on a scaffold manifest (AUDIT-20260614-22)', () => {
    // A typo'd referee key must FAIL — not be silently stripped and treated as
    // "referee omitted". Strictness across the whole manifest is what makes this
    // a rejection rather than a silent drop.
    const manifest = { ...validScaffold(), refree: validRefereeControl() };
    expect(() => parseRefereeRequestManifest(manifest)).toThrow();
    expect(refereeRequestManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects an unknown secret-bearing extra key at the manifest top level (AUDIT-20260614-23)', () => {
    const manifest = { ...validScaffold(), secretToken: 'leak-me' };
    expect(() => parseRefereeRequestManifest(manifest)).toThrow();
    expect(refereeRequestManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects an unknown key inside the nested wireframe object (AUDIT-20260614-23)', () => {
    const manifest = validScaffold({
      wireframe: { path: 'surface.html', sha256: sha256Hex('wireframe'), token: 'leak' },
    });
    expect(() => parseRefereeRequestManifest(manifest)).toThrow();
    expect(refereeRequestManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects an unknown key inside a nested stableRegions entry (AUDIT-20260614-23)', () => {
    const referee: Record<string, unknown> = {
      ...validRefereeControl(),
      stableRegions: [
        { id: 'masthead', locator: 'header.masthead', captureStep: 'default', token: 'leak' },
      ],
    };
    expect(() => parseRefereeRequestManifest(validRefereePreview({ referee }))).toThrow();
  });

  it('rejects an unknown key inside the nested designSpec object (AUDIT-20260614-23)', () => {
    const manifest = validScaffold({
      designSpec: { path: 'design-language.md', version: 'v1', sha256: sha256Hex('spec'), token: 'leak' },
    });
    expect(() => parseRefereeRequestManifest(manifest)).toThrow();
  });

  it('rejects two declared viewports that share the same id (AUDIT-20260614-21 — duplicate viewport id)', () => {
    // Both viewports claim id "desktop"; the duplicate must be reported as the
    // root problem (not masked into a false identity-coverage match).
    const manifest = validRefereePreview({
      viewports: [
        { id: 'desktop', width: 1280 },
        { id: 'desktop', width: 390 },
      ],
    });
    expect(() => parseRefereeRequestManifest(manifest)).toThrow(/duplicate.*viewport/i);
    expect(refereeRequestManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('still accepts distinct desktop/phone viewport ids (AUDIT-20260614-21 — no over-rejection)', () => {
    const manifest = parseRefereeRequestManifest(validRefereePreview());
    expect(manifest.viewports.map((viewport) => viewport.id).sort()).toEqual(['desktop', 'phone']);
  });

  it('exposes the schema for callers that want a non-throwing safeParse', () => {
    expect(refereeRequestManifestSchema.safeParse(validScaffold()).success).toBe(true);
    expect(refereeRequestManifestSchema.safeParse({ mode: 'scaffold' }).success).toBe(false);
  });
});
