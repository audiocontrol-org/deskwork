/**
 * Phase 39a — additive lane-schema fields.
 *
 * Covers the two new optional fields added in 39a:
 *   - `host?: string`            — present only when the lane publishes a site.
 *   - `scaffoldDefaults?: Partial<Record<ArtifactKind, string>>`
 *                                — a partial-by-construction record (a single
 *                                  kind validates; unknown keys reject because
 *                                  the key schema is the ArtifactKind enum).
 *
 * The schema stays `.strict()`, so an unknown TOP-LEVEL key still fails parse.
 * `contentDir` is intentionally retained in 39a (removed in 39c); the
 * `makeLane` helper keeps it present so these tests stay green across 39a.
 */

import { describe, it, expect } from 'vitest';
import { LaneConfigSchema } from '../../src/lanes/types.ts';

/**
 * Minimally-valid lane config, optionally overriding any field. `contentDir`
 * stays present per 39a (its removal is 39c's job).
 */
function makeLane(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'default',
    name: 'Default',
    pipelineTemplate: 'editorial',
    contentDir: 'docs',
    ...overrides,
  };
}

describe('LaneConfigSchema — 39a additive fields', () => {
  it('accepts scaffoldDefaults with a single artifactKind (partial map)', () => {
    const result = LaneConfigSchema.safeParse(
      makeLane({ scaffoldDefaults: { markdown: 'src/content/blog' } }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a host string', () => {
    const result = LaneConfigSchema.safeParse(makeLane({ host: 'example.com' }));
    expect(result.success).toBe(true);
  });

  it('rejects scaffoldDefaults with an unknown artifactKind key', () => {
    const result = LaneConfigSchema.safeParse(
      makeLane({ scaffoldDefaults: { bogus: 'x' } }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an unknown TOP-LEVEL key (.strict() still holds)', () => {
    const result = LaneConfigSchema.safeParse(
      makeLane({ unexpectedTopLevelKey: 'x' }),
    );
    expect(result.success).toBe(false);
  });

  it('accepts a lane omitting both new fields (both optional)', () => {
    const result = LaneConfigSchema.safeParse(makeLane());
    expect(result.success).toBe(true);
  });
});
