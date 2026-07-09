// 035 T013/T014 (FR-006/US4/SC-004) — behavior-guard: the fail-loud resolve-tiers
// floor built for 033 is UNCHANGED by 035. This file documents (via assertions, not
// prose) that the floor's dispatch-nothing / no-silent-default contract still holds:
// an untagged task still fails `no-tier`, an unknown label under a CONFIGURED
// tier_map still fails `unknown-tier`, and — the point of this file — a `[tier:UNSET]`
// task under an ABSENT tier_map fails `no-map`, NOT `unknown-tier`, because
// `resolveTier`'s check order (no-tier → no-map → unknown-tier → not-accepted) tests
// tier_map presence before label membership. T014 is verify-by-non-modification: no
// src/execute/{resolve-tiers,tier-resolution,tasks-tier-parser}.ts file changed for
// 035 — these assertions ARE the verification.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../_run-helpers.js';

const CONFIGURED_MAP = ['version: 1', 'tier_map:', '  fast: haiku', '  balanced: sonnet', '  powerful: opus', ''].join('\n');
const NO_MAP = 'version: 1\n';

describe('035 floor-preserved — resolve-tiers fail-loud floor is unchanged (FR-006/US4/SC-004)', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'stackctl-floor-'));
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  /** Build a tmp installation (config.yaml) + a spec dir holding the given tasks.md. */
  function makeInstall(opts: { config: string; tasks: string }): { specDir: string } {
    mkdirSync(join(work, '.stack-control'), { recursive: true });
    writeFileSync(join(work, '.stack-control', 'config.yaml'), opts.config);
    const specDir = join(work, 'specs', '999-fixture');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, 'tasks.md'), opts.tasks);
    return { specDir };
  }

  it('an untagged task exits non-zero with a no-tier error naming the task; dispatch-nothing', () => {
    const { specDir } = makeInstall({
      config: CONFIGURED_MAP,
      tasks: '- [ ] T001 an untagged task — in src/a.ts\n',
    });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no-tier:.*task T001 has no model tier declared/);
    // Dispatch-nothing: no partial resolution reaches stdout.
    expect(r.stdout.trim()).toBe('');
  });

  it('an unknown label under a CONFIGURED tier_map exits non-zero with an unknown-tier error', () => {
    const { specDir } = makeInstall({
      config: CONFIGURED_MAP,
      tasks: '- [ ] T001 [tier:nonsuch] x — in src/a.ts\n',
    });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/unknown-tier:.*task T001 declares unknown tier nonsuch/);
    expect(r.stdout.trim()).toBe('');
  });

  // ── The point of this file (analyze finding F1) ─────────────────────────────
  it('a [tier:UNSET] task under an ABSENT tier_map fails no-map, NOT unknown-tier (check-order proof)', () => {
    const { specDir } = makeInstall({
      config: NO_MAP,
      tasks: '- [ ] T001 [tier:UNSET] x — in src/a.ts\n',
    });
    const r = runCli(['resolve-tiers', '--spec', specDir], { cwd: work });
    expect(r.status).not.toBe(0);
    // resolveTier checks tier_map presence (no-map) BEFORE label membership
    // (unknown-tier) — so an absent map fires no-map even though 'UNSET' is also
    // not a key of any map. The two categories are reserved for two distinct
    // conditions: no-map = the map itself is absent; unknown-tier = the map is
    // present but the label isn't one of its keys.
    expect(r.stderr).toMatch(/no-map:.*no tier_map configured; cannot resolve tier 'UNSET' for task T001/);
    expect(r.stderr).not.toMatch(/unknown-tier/);
    expect(r.stdout.trim()).toBe('');
  });
});
