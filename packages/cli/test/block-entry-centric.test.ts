/**
 * deskwork CLI `block` subcommand — entry-centric atomic transition.
 *
 * Mirrors the approve-entry-centric.test.ts shape: writes a temp project
 * with a sidecar, invokes the actual `deskwork block ...` binary via
 * spawnSync, and asserts the post-state (sidecar.currentStage, priorStage,
 * journal stage-transition event).
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
  project = mkdtempSync(join(tmpdir(), 'dw-block-'));
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

function writeSidecar(uuid: string, slug: string, currentStage: string): void {
  writeFileSync(
    join(project, '.deskwork', 'entries', `${uuid}.json`),
    JSON.stringify({
      uuid, slug, title: slug,
      keywords: [], source: 'manual',
      currentStage,
      iterationByStage: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    'utf-8',
  );
}

function readSidecar(uuid: string): { currentStage: string; priorStage?: string } {
  return JSON.parse(
    readFileSync(join(project, '.deskwork', 'entries', `${uuid}.json`), 'utf-8'),
  );
}

function readJournalEvents(): Array<{ kind: string; from?: string; to?: string; reason?: string }> {
  const dir = join(project, '.deskwork', 'review-journal', 'history');
  try {
    const files = readdirSync(dir);
    return files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
  } catch { return []; }
}

function block(slug: string, ...extraArgs: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(deskworkBin, ['block', project, slug, ...extraArgs], { encoding: 'utf-8' });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('deskwork block — entry-centric off-pipeline transition', () => {
  it('blocks a Drafting entry → Blocked + records priorStage', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    writeSidecar(uuid, 'in-flight', 'Drafting');

    const res = block('in-flight');
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    const sidecar = readSidecar(uuid);
    expect(sidecar.currentStage).toBe('Blocked');
    expect(sidecar.priorStage).toBe('Drafting');

    const transitions = readJournalEvents().filter((e) => e.kind === 'stage-transition');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ from: 'Drafting', to: 'Blocked' });
  });

  it('refuses to block an already-Blocked entry', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440001';
    writeSidecar(uuid, 'on-hold', 'Blocked');

    const res = block('on-hold');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/already Blocked/i);
  });

  it('refuses to block a Published entry (Published is terminal)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440002';
    writeSidecar(uuid, 'shipped', 'Published');

    const res = block('shipped');
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/Published is terminal|Cannot block/i);
  });

  it('passes --reason through to the journal event', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440003';
    writeSidecar(uuid, 'waiting-legal', 'Final');

    const res = block('waiting-legal', '--reason', 'awaiting legal review');
    expect(res.code).toBe(0);

    const transitions = readJournalEvents().filter((e) => e.kind === 'stage-transition');
    expect(transitions[0]).toMatchObject({
      from: 'Final',
      to: 'Blocked',
      reason: 'awaiting legal review',
    });
  });
});
