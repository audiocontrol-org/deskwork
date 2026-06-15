/**
 * deskwork CLI `induct` subcommand — entry-centric stage teleport.
 *
 * Tests the four default-stage paths (Blocked → priorStage,
 * Cancelled → priorStage, Final → Drafting, pipeline → require --to),
 * the explicit `--to <Stage>` override, and the off-pipeline target
 * refusal.
 *
 * Phase 7.35 (graphical-entries) — AUDIT-20260530-20 regression
 * coverage: the CLI is now template-aware. The visual-lane tests
 * exercise non-editorial templates end-to-end; the invalid-stage test
 * pins the error-message contract (must name `template.linearStages`,
 * NOT the editorial six).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testDir, '../../..');
const deskworkBin = join(workspaceRoot, 'node_modules/.bin/deskwork');

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'dw-induct-'));
  mkdirSync(join(project, '.deskwork', 'entries'), { recursive: true });
  writeFileSync(
    join(project, '.deskwork', 'config.json'),
    JSON.stringify({
      version: 1,
      sites: { main: { contentDir: 'docs', calendarPath: '.deskwork/calendar.md' } },
      defaultSite: 'main',
    }),
    'utf-8',
  );
  writeFileSync(
    join(project, '.deskwork', 'calendar.md'),
    '# Editorial Calendar\n\n## Ideas\n\n*No entries.*\n',
    'utf-8',
  );
});

afterEach(() => { rmSync(project, { recursive: true, force: true }); });

function writeSidecar(
  uuid: string,
  slug: string,
  currentStage: string,
  priorStage?: string,
  lane?: string,
): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid, slug, title: slug,
      keywords: [], source: 'manual',
      currentStage,
      iterationByStage: {},
      ...(priorStage !== undefined && { priorStage }),
      ...(lane !== undefined && { lane }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function writeLane(id: string, pipelineTemplate: string): void {
  const dir = join(project, '.deskwork', 'lanes');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${id}.json`),
    JSON.stringify({ id, name: id, pipelineTemplate }),
    'utf-8',
  );
}

function readSidecar(uuid: string): { currentStage: string; priorStage?: string } {
  return JSON.parse(
    readFileSync(join(project, '.deskwork', 'entries', `${uuid}.json`), 'utf-8'),
  );
}

function readJournalEvents(): Array<{ kind: string; from?: string; to?: string }> {
  const dir = join(project, '.deskwork', 'review-journal', 'history');
  try {
    const files = readdirSync(dir);
    return files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
  } catch { return []; }
}

function induct(slug: string, ...extraArgs: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(deskworkBin, ['induct', project, slug, ...extraArgs], { encoding: 'utf-8' });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('deskwork induct — entry-centric stage teleport', () => {
  it('inducts Blocked → priorStage when --to is omitted', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    writeSidecar(uuid, 'paused-drafting', 'Blocked', 'Drafting');

    const res = induct('paused-drafting');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    const sidecar = readSidecar(uuid);
    expect(sidecar.currentStage).toBe('Drafting');

    const transitions = readJournalEvents().filter((e) => e.kind === 'stage-transition');
    expect(transitions[0]).toMatchObject({ from: 'Blocked', to: 'Drafting' });
  });

  it('inducts Cancelled → priorStage when --to is omitted', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    writeSidecar(uuid, 'unkilled', 'Cancelled', 'Outlining');

    const res = induct('unkilled');
    expect(res.code).toBe(0);
    expect(readSidecar(uuid).currentStage).toBe('Outlining');
  });

  it('inducts Final → Drafting when --to is omitted (revoke Final-status)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440002';
    writeSidecar(uuid, 'unfinaled', 'Final');

    const res = induct('unfinaled');
    expect(res.code).toBe(0);
    expect(readSidecar(uuid).currentStage).toBe('Drafting');
  });

  it('refuses Drafting → ??? without --to (backward induction must be intentional)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440003';
    writeSidecar(uuid, 'mid-pipeline', 'Drafting');

    const res = induct('mid-pipeline');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/--to is required/i);
  });

  it('explicit --to Outlining moves Drafting backward', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440004';
    writeSidecar(uuid, 'retreating', 'Drafting');

    const res = induct('retreating', '--to', 'Outlining');
    expect(res.code).toBe(0);
    expect(readSidecar(uuid).currentStage).toBe('Outlining');
  });

  it('refuses --to Blocked (use the dedicated block command)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440005';
    writeSidecar(uuid, 'mistaken', 'Drafting');

    const res = induct('mistaken', '--to', 'Blocked');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Target must be a linear-pipeline stage|deskwork block/i);
  });

  it('refuses --to Cancelled (use the dedicated cancel command)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440006';
    writeSidecar(uuid, 'mistaken2', 'Drafting');

    const res = induct('mistaken2', '--to', 'Cancelled');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Target must be a linear-pipeline stage|deskwork cancel/i);
  });

  // ---- Template-awareness (AUDIT-20260530-20) ---------------------
  //
  // The CLI must resolve the entry's lane → pipeline template before
  // validating `--to`. Editorial-narrow `isLinearPipelineTarget` is
  // gone; the guard now consults `template.linearStages`.

  it('inducts visual-lane Cancelled → Sketched (--to Sketched on a visual entry)', () => {
    // AUDIT-20260530-20 repro: pre-fix CLI rejected `--to Sketched`
    // with "must be a linear-pipeline stage (Ideas, Planned, ...)"
    // because the editorial-only guard never saw the entry's template.
    writeLane('mockups', 'visual');
    const uuid = '550e8400-e29b-41d4-a716-446655440010';
    writeSidecar(uuid, 'icon-set', 'Cancelled', 'Sketched', 'mockups');

    const res = induct('icon-set', '--to', 'Sketched');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    const sidecar = readSidecar(uuid);
    expect(sidecar.currentStage).toBe('Sketched');
  });

  it('inducts editorial-lane Cancelled → Drafting (regression — editorial path still works)', () => {
    writeLane('default', 'editorial');
    const uuid = '550e8400-e29b-41d4-a716-446655440011';
    writeSidecar(uuid, 'editorial-revival', 'Cancelled', 'Drafting', 'default');

    const res = induct('editorial-revival', '--to', 'Drafting');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    expect(readSidecar(uuid).currentStage).toBe('Drafting');
  });

  it('refuses --to <stage-unknown-to-template> with the template\'s linearStages in the error', () => {
    // Visual lane: linearStages are Sketched / Iterating / Approved /
    // Shipped. Drafting belongs to editorial, NOT visual. The error
    // must name the visual stages, NOT the editorial six — the
    // editorial-narrow hardcoded list is the precise bug being fixed.
    writeLane('mockups', 'visual');
    const uuid = '550e8400-e29b-41d4-a716-446655440012';
    writeSidecar(uuid, 'visual-mistake', 'Sketched', undefined, 'mockups');

    const res = induct('visual-mistake', '--to', 'Drafting');
    expect(res.code).not.toBe(0);
    // The error must name the visual template's actual linear stages.
    expect(res.stderr).toMatch(/Sketched/);
    expect(res.stderr).toMatch(/Iterating/);
    expect(res.stderr).toMatch(/Approved/);
    expect(res.stderr).toMatch(/Shipped/);
    // It must NOT recite the editorial-narrow hardcoded vocabulary.
    expect(res.stderr).not.toMatch(/Ideas, Planned, Outlining, Drafting, Final, Published/);
  });

  it('defaults --to from visual-lane Archived → priorStage (off-pipeline detection is template-aware)', () => {
    // Visual template adds `Archived` to offPipelineStages. The
    // CLI's default-stage path must treat any of the template's
    // off-pipeline stages — not just hardcoded Blocked/Cancelled —
    // as eligible for the priorStage shortcut.
    writeLane('mockups', 'visual');
    const uuid = '550e8400-e29b-41d4-a716-446655440013';
    writeSidecar(uuid, 'archived-asset', 'Archived', 'Iterating', 'mockups');

    const res = induct('archived-asset');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(readSidecar(uuid).currentStage).toBe('Iterating');
  });
});
