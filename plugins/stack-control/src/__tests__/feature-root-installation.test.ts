// US6 (T015) — installation-aware feature-root resolution
// (specs/installation-isolation; research R7; descriptive-naming
// forward-only decision).
//
// The resolver's primary base is the verb-entry-resolved INSTALLATION
// root: `<installation>/specs/<slug>` (exact slug + grandfathered
// `NNN-slug`) and `<installation>/docs/<v>/001-IN-PROGRESS/<slug>` resolve
// first. The transitional legacy locations — the same two layouts at the
// derived git TOPLEVEL (an external anchor, derived from git's own
// marker, never a parameter) — stay read-resolvable byte-compatibly, so a
// pre-relocation repo (spec artifacts at the monorepo root, installation
// below it) still resolves its features. Installation layers win over
// toplevel layers; within a layer the existing specs-then-docs precedence
// is unchanged.

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverFeatureRoots,
  resolveFeatureRoot,
} from '../scope-discovery/util/feature-root.js';
import { makeNestedFixture } from './_isolation-harness.js';

function mkdirp(base: string, rel: string): string {
  const abs = join(base, rel);
  mkdirSync(abs, { recursive: true });
  return abs;
}

describe('US6 — installation-aware feature-root resolution (T015)', () => {
  it('resolves a legacy root-level specs/<slug> from the installation root (the transitional layout)', async () => {
    const fixture = makeNestedFixture();
    try {
      const legacy = mkdirp(fixture.outerRoot, 'specs/feat');
      const r = await resolveFeatureRoot({
        repoRoot: fixture.installationRoot,
        slug: 'feat',
      });
      expect(r.root).toBeDefined();
      expect(realpathSync(r.root ?? '')).toBe(realpathSync(legacy));
    } finally {
      fixture.cleanup();
    }
  });

  it('<installation>/specs/<slug> wins over the toplevel legacy location', async () => {
    const fixture = makeNestedFixture();
    try {
      mkdirp(fixture.outerRoot, 'specs/feat');
      const inside = mkdirp(fixture.installationRoot, 'specs/feat');
      const r = await resolveFeatureRoot({
        repoRoot: fixture.installationRoot,
        slug: 'feat',
      });
      expect(realpathSync(r.root ?? '')).toBe(realpathSync(inside));
    } finally {
      fixture.cleanup();
    }
  });

  it('every installation layer wins over any toplevel layer (installation docs beats toplevel specs)', async () => {
    const fixture = makeNestedFixture();
    try {
      mkdirp(fixture.outerRoot, 'specs/feat');
      const insideDocs = mkdirp(
        fixture.installationRoot,
        'docs/1.0/001-IN-PROGRESS/feat',
      );
      const r = await resolveFeatureRoot({
        repoRoot: fixture.installationRoot,
        slug: 'feat',
      });
      expect(realpathSync(r.root ?? '')).toBe(realpathSync(insideDocs));
    } finally {
      fixture.cleanup();
    }
  });

  it('grandfathered NNN-slug names resolve at both layers', async () => {
    const fixture = makeNestedFixture();
    try {
      const inside = mkdirp(fixture.installationRoot, 'specs/003-feat');
      const r = await resolveFeatureRoot({
        repoRoot: fixture.installationRoot,
        slug: 'feat',
      });
      expect(realpathSync(r.root ?? '')).toBe(realpathSync(inside));
    } finally {
      fixture.cleanup();
    }

    const fixture2 = makeNestedFixture();
    try {
      const legacy = mkdirp(fixture2.outerRoot, 'specs/014-feat');
      const r = await resolveFeatureRoot({
        repoRoot: fixture2.installationRoot,
        slug: 'feat',
      });
      expect(realpathSync(r.root ?? '')).toBe(realpathSync(legacy));
    } finally {
      fixture2.cleanup();
    }
  });

  it('legacy toplevel docs layout stays read-resolvable', async () => {
    const fixture = makeNestedFixture();
    try {
      const legacyDocs = mkdirp(
        fixture.outerRoot,
        'docs/1.0/001-IN-PROGRESS/feat',
      );
      const r = await resolveFeatureRoot({
        repoRoot: fixture.installationRoot,
        slug: 'feat',
      });
      expect(realpathSync(r.root ?? '')).toBe(realpathSync(legacyDocs));
    } finally {
      fixture.cleanup();
    }
  });

  it('a non-git base behaves as before: undefined root, no throw', async () => {
    const plain = mkdtempSync(join(tmpdir(), 'froot-nogit-'));
    try {
      const r = await resolveFeatureRoot({ repoRoot: plain, slug: 'feat' });
      expect(r.root).toBeUndefined();
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  it('discoverFeatureRoots unions the installation and toplevel layers (deduped, sorted)', async () => {
    const fixture = makeNestedFixture();
    try {
      const a = mkdirp(fixture.installationRoot, 'specs/alpha');
      const b = mkdirp(fixture.outerRoot, 'specs/beta');
      const c = mkdirp(fixture.outerRoot, 'docs/1.0/001-IN-PROGRESS/gamma');
      // An ignorable file so the docs walk has its 001-IN-PROGRESS marker.
      writeFileSync(join(c, 'prd.md'), '# gamma\n', 'utf8');

      const roots = (await discoverFeatureRoots(fixture.installationRoot)).map(
        (p) => realpathSync(p),
      );
      expect(roots).toContain(realpathSync(a));
      expect(roots).toContain(realpathSync(b));
      expect(roots).toContain(realpathSync(c));
      expect([...roots].sort()).toEqual(roots);
    } finally {
      fixture.cleanup();
    }
  });
});
