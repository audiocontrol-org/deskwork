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

/** The summary text rendered on a subaction's own help row, or null if no row for
 * `sub` carries trailing content. A row is `  <name>  <summary>` — the name at
 * line-start (after indent) followed by ≥2 spaces then non-empty text. The `\s{2,}`
 * gap means `add` does NOT match the `add-edge` row (after `add` comes `-`, not a
 * space), so prefix-overlapping names are disambiguated. */
function summaryRowFor(helpText: string, sub: string): string | null {
  const escaped = sub.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`^\\s+${escaped}\\s{2,}(\\S.*)$`, 'm').exec(helpText);
  return m ? m[1]!.trim() : null;
}

describe('027 T007 — roadmap --help lists every subaction + summary (exit 0)', () => {
  for (const flag of ['--help', '-h'] as const) {
    it(`${flag} prints a per-subaction summary row for EVERY subaction and exits 0`, () => {
      const r = runCli(['roadmap', flag]);
      expect(r.status).toBe(0);
      // Structural (AUDIT-20260619-13/-26 / TASK-274/287): assert ONE summary row
      // per SUBACTION_SPECS key with non-empty trailing text — not broad substring
      // checks against two hand-picked prose fragments (which pass even if most
      // subactions are merely listed in a usage enum with no individual summary,
      // and break when either fragment is reworded during normal maintenance).
      for (const sub of SUBACTIONS) {
        const summary = summaryRowFor(r.stdout, sub);
        expect(summary, `summary row for '${sub}'`).not.toBeNull();
        expect(summary!.length, `summary for '${sub}' is non-empty`).toBeGreaterThan(0);
      }
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
  // AUDIT-20260619-23 (TASK-284): the worry is that advance --help could advertise
  // statuses advance cannot accept. By construction it cannot: the `--to` vocabulary
  // advance accepts and the vocabulary its help advertises are the SAME governed set
  // (roadmapStatusVocabulary, sourced from the grammar — there is no per-subaction
  // status SUBSET mechanism; advance is a general status setter). The test asserts
  // that single source appears, so the help cannot drift to advertise a status the
  // grammar does not define. If a subset is ever introduced, this is the test to
  // re-derive from the advance-specific accepted set.
  it('advance --help shows every status from the governed grammar (advance accepts the full set) (exit 0)', () => {
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

describe('031 T036 — advance --help surfaces the post-ship terminal `closed` target', () => {
  it('advance --help names `closed` in the --to status vocabulary (the terminal advance)', () => {
    // The post-ship terminal advance (`advance --to closed`) is discoverable on the
    // same surface as every other status — uniform with sibling --to targets, sourced
    // from the governed grammar (non-drift). A regression that dropped `closed` from
    // the vocabulary would fail here.
    expect(roadmapStatusVocabulary()).toContain('closed');
    const r = runCli(['roadmap', 'advance', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('closed');
  });
});
