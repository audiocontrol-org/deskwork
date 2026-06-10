// T010 — the ported ajv-backed schema validator. Pins: a well-formed manifest
// validates; a schema-violating manifest is rejected with errors that NAME the
// offending field (FR-035 fail-loud / never false-clean).

import { describe, it, expect } from 'vitest';
import {
  compileManifestValidator,
  validateManifest,
} from '../../scope-discovery/schema/manifest-validator.js';

const GOOD_MANIFEST = {
  kind: 'code',
  feature_slug: 'migrate-scope-discovery',
  scenarios: [{ id: 'default', description: 'baseline pattern shapes' }],
  reference_docs: [{ path: 'specs/010-migrate-scope-discovery/spec.md', role: 'prd' }],
  discovery_themes: ['per-codebase-boundary'],
  modules: [
    {
      glob: 'src/scope-discovery/**/*.ts',
      patterns: [{ id: 'dup-block', kind: 'clone-group' }],
    },
  ],
};

describe('manifest-validator', () => {
  it('validates a well-formed manifest', async () => {
    const validate = await compileManifestValidator();
    const result = validateManifest(GOOD_MANIFEST, validate);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a manifest missing a required field and names the offense', async () => {
    const validate = await compileManifestValidator();
    const bad = { ...GOOD_MANIFEST };
    delete (bad as Record<string, unknown>)['feature_slug'];
    const result = validateManifest(bad, validate);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/feature_slug/);
  });

  it('rejects an unknown top-level property (additionalProperties:false)', async () => {
    const validate = await compileManifestValidator();
    const result = validateManifest({ ...GOOD_MANIFEST, bogus_key: true }, validate);
    expect(result.ok).toBe(false);
  });
});
