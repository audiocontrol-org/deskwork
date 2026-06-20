// T077 (RED-first, US2, 028) — edge-aware archival: `curate`/archive must REFUSE
// (exit 2) a terminal roadmap node that is still a depends-on / part-of TARGET,
// rather than dangling the edge by moving it into the archive. A terminal node
// with no inbound edge archives normally (FR-017; contract RM4; US2 scenario 7).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCli } from '../_run-helpers.js';
import { writeTempRoadmap } from './helpers.js';

describe('edge-aware archival (T077)', () => {
  it('curate --apply REFUSES a terminal node still targeted by depends-on (exit 2, zero-write)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    const before = readFileSync(docPath, 'utf8');
    const r = runCli(['curate', '--doc', docPath, '--apply']);
    expect(r.status).toBe(2);
    // The refusal names the dangling edge that would be created.
    expect(r.stderr).toContain('design:feature/a');
    // Zero-write: the live document is byte-for-byte unchanged (no archive move).
    expect(readFileSync(docPath, 'utf8')).toBe(before);
  });

  it('curate --apply REFUSES a terminal node still targeted by part-of (exit 2)', () => {
    const docPath = writeTempRoadmap([
      '## multi:feature/parent',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- part-of: multi:feature/parent',
    ]);
    const r = runCli(['curate', '--doc', docPath, '--apply']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('multi:feature/parent');
  });

  it('curate dry-run also surfaces the dangling-target refusal (exit 2)', () => {
    const docPath = writeTempRoadmap([
      '## design:feature/a',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
      '- depends-on: design:feature/a',
    ]);
    const r = runCli(['curate', '--doc', docPath]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('design:feature/a');
  });

  it('a terminal node with NO inbound edge archives normally (exit 0)', () => {
    const docPath = writeTempRoadmap([
      '## impl:feature/done',
      '- status: shipped',
      '',
      '## impl:feature/x',
      '- status: planned',
    ]);
    const r = runCli(['curate', '--doc', docPath, '--apply']);
    expect(r.status).toBe(0);
  });
});
