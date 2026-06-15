/**
 * #394 regression guard (Phase 39d — sites→lanes retirement).
 *
 * The disease (#394 + AUDIT-20260602-03/04/05): the doctor used to GUESS
 * which site's contentDir an entry's artifact lived in by searching ALL
 * of them via a slug+stage heuristic. When two sites carried the SAME
 * slug, the search resolved to the wrong file (or to "a" file under the
 * other site), producing `file-presence` + `calendar-sidecar` /
 * `frontmatter-sidecar` false-positives.
 *
 * The cure (this task): resolution reads ONLY `entry.artifactPath`. The
 * doctor never searches, never guesses. This fixture is the
 * operator-reproducible proof the bug cannot recur:
 *
 *   - TWO sites, SAME slug ("guide").
 *   - Each entry carries a STAMPED `artifactPath` pointing at ITS OWN
 *     site's file.
 *   - Both files exist on disk, each with frontmatter matching its
 *     sidecar's stage.
 *
 * Assertion: `file-presence`, `frontmatter-sidecar`, and
 * `calendar-sidecar` rules report ZERO findings. Before the flip, the
 * shared-slug heuristic search would have cross-resolved at least one
 * entry to the wrong site's file and flagged a spurious mismatch.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAll } from '@/doctor/validate';

const NOW = '2026-06-02T12:00:00.000Z';

const CAL_HEADER = '# Editorial Calendar\n\n';
const TABLE_HEADER =
  '| UUID | Slug | Title | Description | Keywords | Source | Updated |\n|------|------|------|------|------|------|------|\n';

function sidecarJson(
  uuid: string,
  slug: string,
  stage: string,
  artifactPath: string,
): string {
  return JSON.stringify({
    uuid,
    slug,
    title: `T-${slug}`,
    keywords: [],
    source: '',
    currentStage: stage,
    iterationByStage: {},
    artifactPath,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function artifactBody(uuid: string, stage: string): string {
  return `---\ndeskwork:\n  id: ${uuid}\n  stage: ${stage}\n---\n\n# body\n`;
}

describe('#394 multi-site same-slug — no false positive (resolution reads stored path only)', () => {
  let projectRoot: string;

  // Two distinct sidecars, same slug, each pointing at its OWN site dir.
  const uuidA = '11111111-1111-1111-1111-1111111111aa';
  const uuidB = '22222222-2222-2222-2222-2222222222bb';
  const slug = 'guide';
  const pathA = 'sites/alpha/guide/index.md';
  const pathB = 'sites/beta/guide/index.md';

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'dw-394-'));
    await mkdir(join(projectRoot, '.deskwork', 'entries'), { recursive: true });
    // Two legacy sites with the same content shape. Resolution must NOT
    // search across these — it reads each entry's stamped artifactPath.
    await writeFile(
      join(projectRoot, '.deskwork', 'config.json'),
      JSON.stringify({
        version: 1,
        sites: {
          alpha: { contentDir: 'sites/alpha', calendarPath: '.deskwork/calendar.md' },
          beta: { contentDir: 'sites/beta', calendarPath: '.deskwork/calendar.md' },
        },
        defaultSite: 'alpha',
      }),
    );

    // Sidecars: same slug, distinct uuids, distinct stamped paths.
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuidA}.json`),
      sidecarJson(uuidA, slug, 'Drafting', pathA),
    );
    await writeFile(
      join(projectRoot, '.deskwork', 'entries', `${uuidB}.json`),
      sidecarJson(uuidB, slug, 'Drafting', pathB),
    );

    // Both artifacts exist on disk under their respective sites.
    await mkdir(join(projectRoot, 'sites', 'alpha', 'guide'), { recursive: true });
    await mkdir(join(projectRoot, 'sites', 'beta', 'guide'), { recursive: true });
    await writeFile(join(projectRoot, pathA), artifactBody(uuidA, 'Drafting'));
    await writeFile(join(projectRoot, pathB), artifactBody(uuidB, 'Drafting'));

    // Calendar lists both uuids under the Drafting section so the
    // calendar-sidecar rule has both to reconcile.
    const cal =
      CAL_HEADER +
      '## Drafting\n\n' +
      TABLE_HEADER +
      `| ${uuidA} | ${slug} | T-${slug} |  |  |  | ${NOW} |\n` +
      `| ${uuidB} | ${slug} | T-${slug} |  |  |  | ${NOW} |\n\n`;
    await writeFile(join(projectRoot, '.deskwork', 'calendar.md'), cal);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('file-presence reports ZERO findings (each entry resolves to its own stamped path)', async () => {
    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'file-presence');
    expect(fails).toEqual([]);
  });

  it('frontmatter-sidecar reports ZERO findings (no cross-site mismatch)', async () => {
    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'frontmatter-sidecar');
    expect(fails).toEqual([]);
  });

  it('calendar-sidecar reports ZERO findings (both stamped entries present + in sync)', async () => {
    const result = await validateAll(projectRoot);
    const fails = result.failures.filter((f) => f.category === 'calendar-sidecar');
    expect(fails).toEqual([]);
  });
});
