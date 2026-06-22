// 030 T072 (RED first) — US9 / FR-028 / SC-010: coverage must be preserved
// across the non-audit trim. The trim drops non-audit BYTES from measurement and
// rendering, but a trimmed file must stay COVERED in exactly one chunk — it must
// NOT be dropped from the chunk SET (a coverage hole). And an all-non-audit
// OVERSIZED cluster must never emit a dangling/empty SplitClusterMarker: a marker
// references >= 2 sub-chunk ids, or there is no marker at all.
//
// Both assertions are operator-perceivable/behavioral (coverage union; marker
// arity), not internal-measurement checks. Watched to FAIL while binpack drops
// trimmed files from the chunk set and emits dangling markers (T079 fixes it).

import { describe, expect, it } from 'vitest';
import { partitionDiff } from '../../govern/cluster-payload/partition.js';

describe('030 T072 — coverage preserved through non-audit trim (FR-028 / SC-010)', () => {
  it('(a) the union of all chunk files equals the changed set, INCLUDING a trimmed non-audit file', () => {
    // src/g/package-lock.json (non-audit: lockfile) is coupled by dir-adjacency to
    // src/g/a.ts. The cluster total (lockfile + source) exceeds the envelope, but
    // after the trim drops the lockfile it FITS — exercising the oversized-fits-
    // after-trim branch. The trimmed file must remain COVERED in the chunk set.
    const changedFiles = ['src/g/a.ts', 'src/g/package-lock.json'];
    const fileDiffs = new Map<string, string>([
      ['src/g/a.ts', '+export const y = 2;'.padEnd(120, ';')],
      ['src/g/package-lock.json', '+ "x": "1.0.0"'.padEnd(200, ' ')],
    ]);
    // envelope 150: cluster total (~320) > 150; after trim, source (~120) <= 150.
    const r = partitionDiff({ changedFiles, fileDiffs }, 150);

    const covered = r.chunks.flatMap((c) => [...c.files]).sort();
    expect(covered).toEqual([...changedFiles].sort());
  });

  it('(b) an all-non-audit oversized cluster yields no dangling/empty SplitClusterMarker', () => {
    // Two lockfiles in the same directory couple by dir-adjacency into ONE cluster
    // composed ENTIRELY of non-audit files. The cluster is oversized; after the
    // trim it is empty. A SplitClusterMarker must reference >= 2 sub-chunk ids, or
    // there must be no marker at all — never an empty/1-element dangling marker.
    const changedFiles = ['src/h/package-lock.json', 'src/h/yarn.lock'];
    const fileDiffs = new Map<string, string>([
      ['src/h/package-lock.json', '+ "x": "1.0.0"'.padEnd(120, ' ')],
      ['src/h/yarn.lock', '+ x@1.0.0:'.padEnd(120, ' ')],
    ]);
    // envelope 150: cluster total (~240) > 150; all files are non-audit.
    const r = partitionDiff({ changedFiles, fileDiffs }, 150);

    for (const marker of r.splitClusterMarkers) {
      expect(marker.subChunkIds.length).toBeGreaterThanOrEqual(2);
    }
  });
});
