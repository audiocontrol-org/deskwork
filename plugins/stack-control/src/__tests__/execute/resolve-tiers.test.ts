// 033 T013 (US1) + T016-T019 (US2) — the `stackctl resolve-tiers --spec <dir>` verb.
//
// RED-first: spawns the dispatcher against tmp installation trees (the execute-check
// test pattern). US1 (T013): a valid tiered plan exits 0 and emits a TierResolution
// whose every model === tier_map[label]; strict arg parse rejects unknown flag /
// stray positional (exit 2). US2 (T016-T019): every tier error is named, exit 1, with
// NO partial resolution on stdout (FR-004/005/006/008, SC-002).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';

const VALID_MAP = ['version: 1', 'tier_map:', '  fast: haiku', '  balanced: sonnet', '  powerful: opus', ''].join('\n');

describe('stackctl resolve-tiers (033)', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'stackctl-tiers-'));
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  /** Build a tmp installation (config.yaml) + a spec dir holding the given tasks.md. */
  function makeInstall(opts: { config?: string; tasks?: string }): { specDir: string } {
    mkdirSync(join(work, '.stack-control'), { recursive: true });
    writeFileSync(join(work, '.stack-control', 'config.yaml'), opts.config ?? VALID_MAP);
    const specDir = join(work, 'specs', '999-fixture');
    mkdirSync(specDir, { recursive: true });
    if (opts.tasks !== undefined) writeFileSync(join(specDir, 'tasks.md'), opts.tasks);
    return { specDir };
  }

  // ── US1 (T013) ──────────────────────────────────────────────────────────────
  it('exits 0 and emits a TierResolution where every model === tier_map[label] (SC-001)', () => {
    const tasks = [
      '- [ ] T001 [P] [tier:fast] mechanical task — in src/a.ts',
      '- [ ] T002 [tier:powerful] design task — in src/b.ts',
      '',
    ].join('\n');
    const { specDir } = makeInstall({ tasks });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).toBe(0);
    const out: unknown = JSON.parse(r.stdout);
    expect(out).toEqual({
      specDir,
      tasks: [
        { id: 'T001', tierLabel: 'fast', model: 'haiku' },
        { id: 'T002', tierLabel: 'powerful', model: 'opus' },
      ],
    });
  });

  it('accepts the optional --json flag (default JSON emission)', () => {
    const { specDir } = makeInstall({ tasks: '- [ ] T001 [tier:fast] x — in src/a.ts\n' });
    const r = runCli(['resolve-tiers', '--spec', specDir, '--json'], { cwd: work });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveProperty('tasks');
  });

  it('exits 2 on an unknown flag (no flag silently ignored)', () => {
    const { specDir } = makeInstall({ tasks: '- [ ] T001 [tier:fast] x — in src/a.ts\n' });
    const r = runCli(['resolve-tiers', '--spec', specDir, '--bogus'], { cwd: work });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/unexpected argument|unknown/i);
  });

  it('exits 2 on a stray positional', () => {
    const { specDir } = makeInstall({ tasks: '- [ ] T001 [tier:fast] x — in src/a.ts\n' });
    const r = runCli(['resolve-tiers', '--spec', specDir, 'extra'], { cwd: work });
    expect(r.status).toBe(2);
  });

  it('exits 2 when --spec is missing', () => {
    const r = runCli(['resolve-tiers'], { cwd: work });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--spec/);
  });

  it('exits 1 naming the missing tasks.md', () => {
    const { specDir } = makeInstall({}); // no tasks.md
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/tasks\.md/);
  });

  // ── US2 (T016-T019) ─────────────────────────────────────────────────────────
  it('T016: a no-tier task → named error, exit 1, no resolution on stdout (FR-004)', () => {
    const { specDir } = makeInstall({ tasks: '- [ ] T001 a task with no tier — in src/a.ts\n' });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/task T001 has no model tier declared/);
    expect(r.stdout.trim()).toBe('');
  });

  it('T017: an unknown-tier task → named error naming task + tier, exit 1 (FR-005)', () => {
    const { specDir } = makeInstall({ tasks: '- [ ] T001 [tier:nonsuch] x — in src/a.ts\n' });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/task T001 declares unknown tier nonsuch/);
  });

  it('T018: multiple distinct errors are ALL printed before exit; zero tasks emitted (FR-006)', () => {
    const tasks = [
      '- [ ] T001 no tier here — in src/a.ts',
      '- [ ] T002 [tier:nonsuch] unknown tier — in src/b.ts',
      '- [ ] T003 [tier:fast] valid but not emitted — in src/c.ts',
      '',
    ].join('\n');
    const { specDir } = makeInstall({ tasks });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/T001 has no model tier declared/);
    expect(r.stderr).toMatch(/T002 declares unknown tier nonsuch/);
    expect(r.stdout.trim()).toBe(''); // no partial resolution
  });

  it('an empty [tier:] task reports exactly ONE error (empty-tier), not also no-tier (AUDIT-20260629-01)', () => {
    const { specDir } = makeInstall({ tasks: '- [ ] T001 [tier:] x — in src/a.ts\n' });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/empty \[tier:\] tag/);
    expect(r.stderr).not.toMatch(/has no model tier declared/);
  });

  it('T019: a tiered task with no tier_map configured → named error, exit 1 (FR-008)', () => {
    const { specDir } = makeInstall({ config: 'version: 1\n', tasks: '- [ ] T001 [tier:fast] x — in src/a.ts\n' });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/no tier_map configured; cannot resolve tier 'fast' for task T001/);
  });
});
