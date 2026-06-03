/**
 * End-to-end integration test for `deskwork add --lane --stage --kind`.
 *
 * AUDIT-20260528-39 (graphical-entries). Drives the real `deskwork` CLI
 * binary via `spawnSync` against a tmp-fixture project to verify the
 * dashboard compose chip's `/deskwork:add ... --lane <id> --stage <s>`
 * command shape now resolves end-to-end (parser accepts the flags; the
 * core create path persists lane / stage / artifactKind to the sidecar;
 * stage validation rejects stages absent from the lane's pipeline
 * template).
 *
 * Mirrors the helpers pattern from `custom-pipeline-lane-integration.
 * test.ts` (Task 6.6) — every CLI invocation is a real subprocess; the
 * fixture project tree is materialized via `mkdtempSync` per test.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertDeskworkBinPresent,
  deskworkBin,
} from './util/assert-deskwork-bin.ts';

interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function makeProject(): string {
  const project = mkdtempSync(join(tmpdir(), 'dw-add-lane-int-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: {
        main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' },
      },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
  return project;
}

function destroyProject(project: string): void {
  rmSync(project, { recursive: true, force: true });
}

function deskwork(project: string, ...args: string[]): RunResult {
  const r = spawnSync(deskworkBin, args.concat(), {
    encoding: 'utf-8',
    cwd: project,
  });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function pipelineCmd(project: string, ...args: string[]): RunResult {
  return deskwork(project, 'pipeline', project, ...args);
}

function laneCmd(project: string, ...args: string[]): RunResult {
  return deskwork(project, 'lane', project, ...args);
}

function addCmd(project: string, ...args: string[]): RunResult {
  return deskwork(project, 'add', project, ...args);
}

function uuidFromAddOutput(project: string, stdout: string): string {
  const parsed = JSON.parse(stdout) as { slug: string };
  const calendarRaw = readFileSync(
    join(project, '.deskwork', 'calendar.md'),
    'utf-8',
  );
  const m = calendarRaw.match(
    new RegExp(`\\| ([0-9a-f-]{36}) \\| ${parsed.slug.replace(/[\/.]/g, '\\$&')} \\|`),
  );
  if (m === null) {
    throw new Error(
      `could not find UUID for slug "${parsed.slug}" in calendar.md`,
    );
  }
  return m[1];
}

function readSidecar(
  project: string,
  uuid: string,
): Record<string, unknown> {
  const path = join(project, '.deskwork', 'entries', `${uuid}.json`);
  if (!existsSync(path)) {
    throw new Error(`sidecar not written at ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
}

beforeAll(() => { assertDeskworkBinPresent(); });

describe('deskwork add --lane --stage --kind (AUDIT-20260528-39)', () => {
  let project: string;
  beforeEach(() => { project = makeProject(); });
  afterEach(() => { destroyProject(project); });

  it(
    'creates a sidecar with the requested lane, stage, and artifactKind',
    () => {
      // Set up a custom pipeline + lane bound to it.
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', 'AUDIT-20260528-39 integration fixture',
      );
      expect(created.stderr).toBe('');
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'mockups',
        '--template', 'visual-test',
        '--scaffold-default', 'markdown=content/mockups',
        // Phase 39c-2b (sub-task b): `add --kind html-mockup` now
        // composes artifactPath from the lane's scaffoldDefaults for
        // THAT kind. The lane must declare an html-mockup default or
        // the add fails loudly (no fallback).
        '--scaffold-default', 'html-mockup=content/mockups',
        '--name', 'Mockups',
      );
      expect(laneRes.stderr).toBe('');
      expect(laneRes.code).toBe(0);

      // Add an entry at Iterating in the mockups lane, classified as
      // an html-mockup artifact (the dashboard compose chip's shape).
      const added = addCmd(
        project,
        '--lane', 'mockups',
        '--stage', 'Iterating',
        '--kind', 'html-mockup',
        'design-x',
      );
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);

      const uuid = uuidFromAddOutput(project, added.stdout);
      const sidecar = readSidecar(project, uuid);

      expect(sidecar['uuid']).toBe(uuid);
      expect(sidecar['slug']).toBe('design-x');
      expect(sidecar['title']).toBe('design-x');
      expect(sidecar['currentStage']).toBe('Iterating');
      expect(sidecar['lane']).toBe('mockups');
      expect(sidecar['artifactKind']).toBe('html-mockup');
      expect(sidecar['source']).toBe('manual');
      expect(sidecar['keywords']).toEqual([]);
      expect(sidecar['iterationByStage']).toEqual({});
      // artifactPath composed from scaffoldDefaults[html-mockup] +
      // default `index` layout + slug. AUDIT-39: the extension derives
      // from the KIND (html-mockup → .html), NOT a hardcoded `.md`. The
      // prior `.md` assertion locked the AUDIT-39 HIGH bug in.
      expect(sidecar['artifactPath']).toBe('content/mockups/design-x/index.html');
    },
  );

  it(
    'rejects --stage that is not in the lane template with non-zero exit',
    () => {
      // Same custom pipeline + lane as the happy-path fixture.
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', 'AUDIT-20260528-39 integration fixture',
      );
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'mockups',
        '--template', 'visual-test',
        '--scaffold-default', 'markdown=content/mockups',
        '--name', 'Mockups',
      );
      expect(laneRes.code).toBe(0);

      // "Drafting" belongs to the editorial template, NOT visual-test.
      const bad = addCmd(
        project,
        '--lane', 'mockups',
        '--stage', 'Drafting',
        'bad-stage',
      );
      expect(bad.code).not.toBe(0);
      expect(bad.stderr).toContain('Drafting');
      expect(bad.stderr).toContain('mockups');
      // Error message must list the legal stages so the operator can
      // self-correct without grepping the template JSON.
      expect(bad.stderr).toContain('Sketched');
      expect(bad.stderr).toContain('Iterating');
      expect(bad.stderr).toContain('Approved');
      expect(bad.stderr).toContain('Shipped');

      // Sidecar must NOT have been written for the rejected add.
      const calendarRaw = readFileSync(
        join(project, '.deskwork', 'calendar.md'),
        'utf-8',
      );
      expect(calendarRaw).not.toContain('bad-stage');
    },
  );

  it(
    'rejects --lane that does not exist with non-zero exit',
    () => {
      const bad = addCmd(
        project,
        '--lane', 'nonexistent',
        '--stage', 'Sketched',
        'unbound',
      );
      expect(bad.code).not.toBe(0);
      expect(bad.stderr).toContain('nonexistent');
    },
  );

  it(
    'rejects --kind outside the four-case ArtifactKindSchema enum',
    () => {
      const bad = addCmd(
        project,
        '--kind', 'pdf',
        'bad-kind',
      );
      expect(bad.code).not.toBe(0);
      expect(bad.stderr).toContain('pdf');
      expect(bad.stderr).toContain('markdown');
      expect(bad.stderr).toContain('html-mockup');
      expect(bad.stderr).toContain('single-file-html');
      expect(bad.stderr).toContain('image');
    },
  );

  it(
    'defaults to lane=default + first linear stage + kind=markdown when flags omitted',
    () => {
      // No --lane / --stage / --kind: the bootstrap default lane should
      // be auto-created from the legacy site config, the entry should
      // land in editorial's first linear stage (Ideas), and the kind
      // should default to markdown.
      const added = addCmd(project, 'Legacy idea');
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);

      const uuid = uuidFromAddOutput(project, added.stdout);
      const sidecar = readSidecar(project, uuid);

      expect(sidecar['currentStage']).toBe('Ideas');
      expect(sidecar['lane']).toBe('default');
      expect(sidecar['artifactKind']).toBe('markdown');

      // The bootstrap step must have materialized .deskwork/lanes/default.json.
      const defaultLanePath = join(
        project, '.deskwork', 'lanes', 'default.json',
      );
      expect(existsSync(defaultLanePath)).toBe(true);
    },
  );

  it(
    'default --layout stamps <dir>/<slug>/index.md onto artifactPath (zero behavior change)',
    () => {
      // Legacy site fixture → bootstrap default lane with
      // scaffoldDefaults.markdown = 'docs' (sites.main.contentDir).
      const added = addCmd(project, '--slug', 'first-post', 'First post');
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);

      const uuid = uuidFromAddOutput(project, added.stdout);
      const sidecar = readSidecar(project, uuid);
      expect(sidecar['artifactPath']).toBe('docs/first-post/index.md');
    },
  );

  it(
    '--layout flat stamps <dir>/<slug>.md; --layout readme stamps <dir>/<slug>/README.md',
    () => {
      const flat = addCmd(
        project, '--slug', 'flat-post', '--layout', 'flat', 'Flat post',
      );
      expect(flat.stderr).toBe('');
      expect(flat.code).toBe(0);
      const flatUuid = uuidFromAddOutput(project, flat.stdout);
      expect(readSidecar(project, flatUuid)['artifactPath']).toBe(
        'docs/flat-post.md',
      );

      const readme = addCmd(
        project, '--slug', 'readme-post', '--layout', 'readme', 'Readme post',
      );
      expect(readme.stderr).toBe('');
      expect(readme.code).toBe(0);
      const readmeUuid = uuidFromAddOutput(project, readme.stdout);
      expect(readSidecar(project, readmeUuid)['artifactPath']).toBe(
        'docs/readme-post/README.md',
      );
    },
  );

  it(
    'rejects --layout outside {index,readme,flat} with non-zero exit and no disk mutation',
    () => {
      const bad = addCmd(project, '--layout', 'sidebar', 'Bad layout');
      expect(bad.code).not.toBe(0);
      expect(bad.stderr).toContain('sidebar');
      expect(bad.stderr).toContain('index');
      expect(bad.stderr).toContain('readme');
      expect(bad.stderr).toContain('flat');

      const calendarRaw = readFileSync(
        join(project, '.deskwork', 'calendar.md'),
        'utf-8',
      );
      expect(calendarRaw).not.toContain('Bad layout');
    },
  );

  it(
    'fails loudly when the lane has no scaffoldDefaults for the requested kind',
    () => {
      // A lane that scaffolds markdown but NOT html-mockup. Asking
      // `add --kind html-mockup` must abort with an actionable error
      // that names the lane + the kind — and leave calendar.md untouched.
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', '39c-2b loud-error fixture',
      );
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'mdonly',
        '--template', 'visual-test',
        '--scaffold-default', 'markdown=content/md',
        '--name', 'Markdown only',
      );
      expect(laneRes.code).toBe(0);

      const bad = addCmd(
        project,
        '--lane', 'mdonly',
        '--stage', 'Sketched',
        '--kind', 'html-mockup',
        'no-scaffold-default',
      );
      expect(bad.code).not.toBe(0);
      expect(bad.stderr).toContain('mdonly');
      expect(bad.stderr).toContain('html-mockup');

      // No disk mutation: the calendar must not carry the rejected entry.
      const calendarRaw = readFileSync(
        join(project, '.deskwork', 'calendar.md'),
        'utf-8',
      );
      expect(calendarRaw).not.toContain('no-scaffold-default');
    },
  );

  it(
    'defaults --stage to the lane template first linear stage when only --lane is supplied',
    () => {
      // Custom pipeline whose first linear stage is "Sketched".
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', 'AUDIT-20260528-39 integration fixture',
      );
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'mockups',
        '--template', 'visual-test',
        '--scaffold-default', 'markdown=content/mockups',
        '--name', 'Mockups',
      );
      expect(laneRes.code).toBe(0);

      // No --stage: should land at the template's first linear stage.
      const added = addCmd(
        project,
        '--lane', 'mockups',
        'stageless',
      );
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);

      const uuid = uuidFromAddOutput(project, added.stdout);
      const sidecar = readSidecar(project, uuid);

      expect(sidecar['currentStage']).toBe('Sketched');
      expect(sidecar['lane']).toBe('mockups');
    },
  );

  it(
    'single-file-html stamps <dir>/<slug>.html at its per-kind default (flat)',
    () => {
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', '39c-2b single-file-html fixture',
      );
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'pages',
        '--template', 'visual-test',
        '--scaffold-default', 'single-file-html=content/pages',
        '--name', 'Pages',
      );
      expect(laneRes.code).toBe(0);

      // No --layout: single-file-html's per-kind default is `flat`.
      const added = addCmd(
        project,
        '--lane', 'pages',
        '--stage', 'Sketched',
        '--kind', 'single-file-html',
        'banner',
      );
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);

      const uuid = uuidFromAddOutput(project, added.stdout);
      const sidecar = readSidecar(project, uuid);
      expect(sidecar['artifactKind']).toBe('single-file-html');
      // AUDIT-39: .html extension from the kind; AUDIT-44: per-kind
      // default layout `flat` → loose `<slug>.html` file.
      expect(sidecar['artifactPath']).toBe('content/pages/banner.html');
    },
  );

  it(
    'rejects an illegal (kind, layout) combo pre-write (single-file-html + index) — AUDIT-44',
    () => {
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', '39c-2b illegal-combo fixture',
      );
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'pages',
        '--template', 'visual-test',
        '--scaffold-default', 'single-file-html=content/pages',
        '--name', 'Pages',
      );
      expect(laneRes.code).toBe(0);

      const bad = addCmd(
        project,
        '--lane', 'pages',
        '--stage', 'Sketched',
        '--kind', 'single-file-html',
        '--layout', 'index',
        'bad-combo',
      );
      // Exit 2 (same shape as the invalid --layout-value rejection).
      expect(bad.code).toBe(2);
      expect(bad.stderr).toContain('single-file-html');
      expect(bad.stderr).toContain('index');

      // No disk mutation: the calendar must not carry the rejected entry.
      const calendarRaw = readFileSync(
        join(project, '.deskwork', 'calendar.md'),
        'utf-8',
      );
      expect(calendarRaw).not.toContain('bad-combo');
    },
  );

  it(
    '--kind image without --artifact-path fails loud (exit 2, no disk mutation) — AUDIT-42',
    () => {
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', '39c-2b image-no-path fixture',
      );
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'gallery',
        '--template', 'visual-test',
        '--scaffold-default', 'image=content/img',
        '--name', 'Gallery',
      );
      expect(laneRes.code).toBe(0);

      const bad = addCmd(
        project,
        '--lane', 'gallery',
        '--stage', 'Sketched',
        '--kind', 'image',
        'no-path-image',
      );
      expect(bad.code).toBe(2);
      expect(bad.stderr).toContain('--artifact-path');
      expect(bad.stderr).toContain('image');

      const calendarRaw = readFileSync(
        join(project, '.deskwork', 'calendar.md'),
        'utf-8',
      );
      expect(calendarRaw).not.toContain('no-path-image');
    },
  );

  it(
    '--kind image with --artifact-path stamps the path verbatim — AUDIT-42',
    () => {
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', '39c-2b image-with-path fixture',
      );
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'gallery',
        '--template', 'visual-test',
        '--scaffold-default', 'image=content/img',
        '--name', 'Gallery',
      );
      expect(laneRes.code).toBe(0);

      const added = addCmd(
        project,
        '--lane', 'gallery',
        '--stage', 'Sketched',
        '--kind', 'image',
        '--artifact-path', 'assets/images/hero.png',
        'hero',
      );
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);

      const uuid = uuidFromAddOutput(project, added.stdout);
      const sidecar = readSidecar(project, uuid);
      expect(sidecar['artifactKind']).toBe('image');
      // Stamped verbatim — not composed.
      expect(sidecar['artifactPath']).toBe('assets/images/hero.png');
    },
  );

  it(
    '--kind image rejects --layout (image has no layout shape) — AUDIT-42',
    () => {
      const created = pipelineCmd(
        project,
        'create', 'visual-test',
        '--shape', 'Sketched,Iterating,Approved,Shipped',
        '--name', 'Visual test pipeline',
        '--description', '39c-2b image-layout-reject fixture',
      );
      expect(created.code).toBe(0);

      const laneRes = laneCmd(
        project,
        'create', 'gallery',
        '--template', 'visual-test',
        '--scaffold-default', 'image=content/img',
        '--name', 'Gallery',
      );
      expect(laneRes.code).toBe(0);

      const bad = addCmd(
        project,
        '--lane', 'gallery',
        '--stage', 'Sketched',
        '--kind', 'image',
        '--layout', 'index',
        '--artifact-path', 'assets/images/x.png',
        'layout-image',
      );
      expect(bad.code).toBe(2);
      expect(bad.stderr).toContain('--layout');
      expect(bad.stderr).toContain('image');
    },
  );

  it(
    '--artifact-path is rejected for a templatable kind (path is composed)',
    () => {
      // Default lane (markdown) bootstrapped from the legacy site fixture.
      const bad = addCmd(
        project,
        '--artifact-path', 'somewhere/forced.md',
        'forced-path',
      );
      expect(bad.code).toBe(2);
      expect(bad.stderr).toContain('--artifact-path');

      const calendarRaw = readFileSync(
        join(project, '.deskwork', 'calendar.md'),
        'utf-8',
      );
      expect(calendarRaw).not.toContain('forced-path');
    },
  );

  it(
    'stamps a forward-slash (POSIX) artifactPath — AUDIT-40',
    () => {
      const added = addCmd(project, '--slug', 'posix-post', 'Posix post');
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);

      const uuid = uuidFromAddOutput(project, added.stdout);
      const artifactPath = readSidecar(project, uuid)['artifactPath'];
      expect(typeof artifactPath).toBe('string');
      expect(artifactPath).not.toContain('\\');
      expect(artifactPath).toBe('docs/posix-post/index.md');
    },
  );

  it(
    'AUDIT-41 seam: add stamps artifactPath but creates NO content file on disk',
    () => {
      // Trace result (sub-task b scope): `deskwork add` writes only the
      // calendar row + the entry sidecar — it does NOT scaffold the
      // content file. So the stamped artifactPath is a forward
      // reference; migrating the file-CREATING verb (scaffoldBlogPost /
      // draft) to read entry.artifactPath is sub-task (a).
      const added = addCmd(project, '--slug', 'no-file-yet', 'No file yet');
      expect(added.stderr).toBe('');
      expect(added.code).toBe(0);

      const uuid = uuidFromAddOutput(project, added.stdout);
      const sidecar = readSidecar(project, uuid);
      const artifactPath = sidecar['artifactPath'];
      expect(artifactPath).toBe('docs/no-file-yet/index.md');

      // The stamped path points at a file that does NOT exist yet — add
      // does not create it. (If a future change makes `add` scaffold the
      // file, this assertion flips and the stamped path must equal the
      // created-file location.)
      expect(typeof artifactPath).toBe('string');
      const onDisk = join(project, String(artifactPath));
      expect(existsSync(onDisk)).toBe(false);
    },
  );
});
