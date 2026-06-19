// T007 (RED-first, 027 Phase 3 US1) — FR-002/003/004, CHK013/014.
//
// The self-documenting help surface a fresh agent learns the roadmap from:
//   - `roadmap --help` / `-h` → every subaction + a one-line summary, exit 0
//     (NOT an "unknown flag" exit 2 — this is the intentional change from the
//     Phase-2 behavior where help was disabled).
//   - `roadmap` (no subaction) → usage line enumerating the COMPLETE subaction
//     set (not the truncated `<next|blocked|add>`), exit 2 on stderr.
//   - `roadmap advance --help` / `roadmap add --help` → the status vocabulary,
//     sourced from the governed grammar, is surfaced; exit 0.
//
// RED until T008/T009: today `roadmap --help` is exit 2 with no listing, and the
// no-subaction message is the truncated subset.

import { describe, it, expect } from 'vitest';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { SUBACTION_SPECS } from '../../src/subcommands/roadmap.js';
import { roadmapStatusVocabulary } from '../../src/cli-help/roadmap-help.js';

const SUBACTIONS = Object.keys(SUBACTION_SPECS);

describe('027 T007 — roadmap --help lists every subaction + summary (exit 0)', () => {
  for (const flag of ['--help', '-h'] as const) {
    it(`${flag} prints every subaction with a summary and exits 0`, () => {
      const r = runCli(['roadmap', flag]);
      expect(r.status).toBe(0);
      for (const sub of SUBACTIONS) {
        expect(r.stdout).toContain(sub);
      }
      // A summary is present (at least one descriptive line beyond the names).
      expect(r.stdout).toMatch(/list the ready/);
      expect(r.stdout).toMatch(/dry-run unless --apply/);
    });
  }
});

describe('027 T007 — roadmap (no subaction) prints the COMPLETE set (exit 2)', () => {
  it('enumerates every subaction, not the truncated <next|blocked|add>', () => {
    const r = runCli(['roadmap']);
    expect(r.status).toBe(2);
    for (const sub of SUBACTIONS) {
      expect(r.stderr).toContain(sub);
    }
    // The truncated Phase-2 message must be gone.
    expect(r.stderr).not.toContain('<next|blocked|add>');
  });
});

describe('027 T007 — advance/add --help surface the status vocabulary (CHK014)', () => {
  it('advance --help shows every status from the governed grammar (exit 0)', () => {
    const vocab = roadmapStatusVocabulary();
    expect(vocab.length).toBeGreaterThan(0);
    const r = runCli(['roadmap', 'advance', '--help']);
    expect(r.status).toBe(0);
    for (const status of vocab) {
      expect(r.stdout).toContain(status);
    }
  });

  it('add --help shows every status from the governed grammar (exit 0)', () => {
    const vocab = roadmapStatusVocabulary();
    const r = runCli(['roadmap', 'add', '--help']);
    expect(r.status).toBe(0);
    for (const status of vocab) {
      expect(r.stdout).toContain(status);
    }
  });
});
