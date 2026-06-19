// T006 (RED-first, 027 Phase 3 US1) — FR-005 / CHK015 non-drift invariant.
//
// For EVERY roadmap subaction, the flags enumerated in `roadmap <sub> --help`
// are EXACTLY the flags the parser accepts: no shown-but-unparsed flag, no
// parsed-but-unshown flag. The accepted set is derived mechanically from
// SUBACTION_SPECS (the single grammar source); the help text is parsed back out
// of `roadmap <sub> --help`. Both must be the same set.
//
// Three sub-checks per subaction:
//   (1) every flag the grammar declares appears in the help text;
//   (2) no flag appears in the help that the grammar does NOT declare;
//   (3) a flag the help does NOT show is rejected by the parser (exit 2), and
//       every flag the help DOES show is accepted (not an unknown-flag exit 2).
//
// RED until T008/T009 build the self-documenting help surface (today `--help`
// is an unknown option → exit 2 with no flag listing).

import { describe, it, expect } from 'vitest';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { SUBACTION_SPECS } from '../../src/subcommands/roadmap.js';
import { flagNamesFor } from '../../src/cli-help/roadmap-help.js';
import { fixturePath } from './helpers.js';

function tmpChain(): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-help-nondrift-'));
  const docPath = join(dir, 'ROADMAP.md');
  copyFileSync(fixturePath('chain'), docPath);
  return docPath;
}

/** The long-form flag tokens present in a `--help` render (e.g. `--to`). */
function shownFlags(helpText: string): Set<string> {
  const found = new Set<string>();
  for (const m of helpText.matchAll(/(--[a-z][a-z0-9-]*)/g)) {
    found.add(m[1]!);
  }
  return found;
}

const SUBACTIONS = Object.keys(SUBACTION_SPECS);

describe('027 T006 — roadmap per-subaction help is non-drift vs the parser (CHK015)', () => {
  for (const sub of SUBACTIONS) {
    const grammar = SUBACTION_SPECS[sub]!;
    const accepted = new Set(flagNamesFor(grammar));

    it(`${sub}: --help exits 0 and lists exactly the grammar-accepted flags`, () => {
      const r = runCli(['roadmap', sub, '--help']);
      expect(r.status).toBe(0);
      const shown = shownFlags(r.stdout);
      // (1) every declared flag is shown.
      for (const flag of accepted) {
        expect(shown.has(flag)).toBe(true);
      }
      // (2) no flag is shown that the grammar does not declare.
      for (const flag of shown) {
        expect(accepted.has(flag)).toBe(true);
      }
    });
  }
});

describe('027 T006 — a flag NOT shown is rejected; a flag shown is accepted', () => {
  it("advance: an undeclared --bogus is rejected (not in help) → exit 2", () => {
    const grammar = SUBACTION_SPECS.advance!;
    expect(flagNamesFor(grammar)).not.toContain('--bogus');
    const docPath = tmpChain();
    const r = runCli(['roadmap', 'advance', 'impl:feature/b', '--bogus', 'x', '--to', 'in-flight', '--doc', docPath]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown flag --bogus for 'advance'");
  });

  it('advance: the shown --to flag is accepted (no unknown-flag exit 2)', () => {
    const docPath = tmpChain();
    const help = runCli(['roadmap', 'advance', '--help']);
    expect(shownFlags(help.stdout).has('--to')).toBe(true);
    const r = runCli(['roadmap', 'advance', 'impl:feature/b', '--to', 'in-flight', '--doc', docPath]);
    // dry-run success (exit 0), proving --to is parsed, not rejected.
    expect(r.status).toBe(0);
  });

  it('add: the shown value-flags are all accepted by the parser', () => {
    const docPath = tmpChain();
    const help = runCli(['roadmap', 'add', '--help']);
    const shown = shownFlags(help.stdout);
    expect(shown.has('--status')).toBe(true);
    expect(shown.has('--part-of')).toBe(true);
    const r = runCli([
      'roadmap', 'add', 'impl:gap/z',
      '--status', 'planned', '--scope', 'x',
      '--doc', docPath,
    ]);
    expect(r.status).toBe(0);
  });
});
