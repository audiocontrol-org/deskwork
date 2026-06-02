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
        '--content-dir', 'content/mockups',
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
        '--content-dir', 'content/mockups',
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
        '--content-dir', 'content/mockups',
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
});
