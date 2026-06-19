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
//   (3) a flag the help does NOT show is rejected by the parser (exit 2,
//       `unknown flag`), and every flag the help DOES show is accepted (NOT an
//       unknown-flag rejection — proven by exercising a MINIMAL VALID invocation
//       of the subaction with all its declared flags).
//
// Checks (1)+(2) loop over every SUBACTION_SPECS key; check (3) loops over the
// same set via the per-subaction VALID_INVOCATION fixture map below — closing the
// gap the cross-model audit-barrage flagged (check (3) was hand-coded for only
// `advance`/`add`, so 10 of 12 subactions had no flag-acceptance coverage).

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

/**
 * The long-form flag tokens DECLARED in a `--help` render (e.g. `--to`).
 *
 * Matches a `--long` flag that BEGINS a structured flag-table entry — either at
 * line-start (`  --doc <path>`) OR immediately after a `-x, ` short-alias prefix
 * (the conventional `  -t, --to <status>` two-column style). It deliberately does
 * NOT match a `--flag` token embedded in a description, prose, an example, or the
 * `(one of: …)` vocabulary suffix: those are not the declared surface, and
 * counting them made the CHK015 gate unreliable (a flag named only in a
 * description would be a false "shown"; a removed flag still mentioned in prose
 * would spuriously fail check (2)).
 *
 * Robustness note (AUDIT-BARRAGE claude-01): the prior `/^[ \t]*(--[a-z…])/gm`
 * anchored ONLY at line-start, so if the help table ever rendered the `-x, --long`
 * short-alias style this regex would capture nothing and the gate would pass
 * VACUOUSLY (every grammar flag "not shown", check (1) failing loudly is the only
 * thing that would catch it — but check (2) would pass on an empty set). The
 * optional `(?:-[A-Za-z], )?` prefix makes the gate measure the declared surface
 * under BOTH formatter styles while keeping prose flags excluded.
 */
function shownFlags(helpText: string): Set<string> {
  const found = new Set<string>();
  for (const m of helpText.matchAll(/^[ \t]*(?:-[A-Za-z], )?(--[a-z][a-z0-9-]*)/gm)) {
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

// ── check (3) fixture map ───────────────────────────────────────────────────
// One MINIMAL VALID invocation per subaction (argv AFTER the subaction token and
// EXCLUDING `--doc`, which the harness appends as a tmp chain copy). Each entry
// exercises every flag the subaction's grammar declares with a valid value, so
// the dry-run exits 0 — proving every shown flag is ACCEPTED by the parser, not
// rejected as unknown. Ids are taken from the `chain` fixture:
//   design:feature/a (shipped — terminal), impl:feature/b (planned),
//   impl:feature/c (planned).
//
// `expectExit0: false` marks a subaction whose valid invocation cannot cleanly
// exit 0 for a reason UNRELATED to flag acceptance; for those the contract is
// weaker but still load-bearing: the failure must NOT be an `unknown flag` /
// `unknown subaction` shape (i.e. the flag was accepted; some other validation
// failed). `reconcile` is the one such subaction here: against a bare tmp chain
// copy it exits 2 with a DocumentModelError (no `specs/` glob-parent dir to
// anchor spec correspondences) — a doc-resolution failure, not a flag rejection.
// (close-related, by contrast, exits 0: its terminal-status `design:feature/a`
// records no resolved ids → "nothing to close".)
interface ValidInvocation {
  readonly argv: readonly string[];
  readonly expectExit0: boolean;
}

const VALID_INVOCATION: Readonly<Record<string, ValidInvocation>> = {
  next: { argv: [], expectExit0: true },
  blocked: { argv: [], expectExit0: true },
  order: { argv: [], expectExit0: true },
  graph: { argv: [], expectExit0: true },
  // reconcile resolves spec paths against a `specs/` glob-parent dir; a bare tmp
  // chain copy has none, so it exits 2 (DocumentModelError) — NOT a flag
  // rejection. The flag-acceptance half of check (3) still holds (no `--`-flag is
  // unknown); the bogus-flag half still asserts exit-2 `unknown flag`.
  reconcile: { argv: [], expectExit0: false },
  blocks: { argv: ['design:feature/a'], expectExit0: true },
  add: {
    argv: [
      'impl:gap/probe',
      '--status', 'planned',
      '--scope', 'x',
      '--depends-on', 'design:feature/a',
      '--part-of', 'design:feature/a',
      '--deferred-until', '2026-12-01',
      '--spec', 'specs/x',
      '--ref', 'TASK-1',
    ],
    expectExit0: true,
  },
  advance: { argv: ['impl:feature/b', '--to', 'in-flight'], expectExit0: true },
  decompose: { argv: ['impl:feature/b', '--into', 'impl:gap/x1,impl:gap/x2'], expectExit0: true },
  // reclassify renames an identifier: --to takes a NEW `<phase>:<kind>/<slug>` id,
  // NOT a status (the task's `--to in-flight` is invalid against the id grammar).
  reclassify: { argv: ['impl:feature/b', '--to', 'impl:feature/b2'], expectExit0: true },
  defer: { argv: ['impl:feature/b', '--until', '2026-12-01'], expectExit0: true },
  // cluster groups existing children under a created-or-reused parent; exercise
  // every declared flag (--children, --summary, --chain) with valid values against
  // the chain fixture (b before c keeps the chain acyclic and conflict-free).
  cluster: {
    argv: [
      'multi:feature/grp',
      '--children', 'impl:feature/b,impl:feature/c',
      '--summary', 'grouped work',
      '--chain',
    ],
    expectExit0: true,
  },
  // group is the alias of cluster — identical grammar + valid invocation.
  group: {
    argv: [
      'multi:feature/grp2',
      '--children', 'impl:feature/b,impl:feature/c',
      '--summary', 'grouped work',
      '--chain',
    ],
    expectExit0: true,
  },
  // close-related needs a TERMINAL item; design:feature/a is `shipped` (terminal)
  // and records no resolved ids, so the dry-run exits 0 ("nothing to close").
  'close-related': { argv: ['design:feature/a'], expectExit0: true },
  // 028 US2 edge-mutation + marker verbs — minimal valid invocations against the
  // chain fixture (a shipped, b/c planned: c depends-on b depends-on a).
  // add-edge: a part-of edge c→a (a shipped, no cycle).
  'add-edge': {
    argv: ['impl:feature/c', '--field', 'part-of', '--to', 'design:feature/a'],
    expectExit0: true,
  },
  // remove-edge: c already has depends-on b — removing it is valid.
  'remove-edge': {
    argv: ['impl:feature/c', '--field', 'depends-on', '--to', 'impl:feature/b'],
    expectExit0: true,
  },
  // move-edge: reparent c's depends-on from b onto a (a shipped, no cycle).
  'move-edge': {
    argv: [
      'impl:feature/c',
      '--field', 'depends-on',
      '--from', 'impl:feature/b',
      '--to', 'design:feature/a',
    ],
    expectExit0: true,
  },
  // rename: c is targeted by nothing, so renaming it repoints nothing — valid.
  rename: { argv: ['impl:feature/c', '--to', 'impl:feature/c2'], expectExit0: true },
  // remove-node: c is the leaf (no inbound edge) — removable.
  'remove-node': { argv: ['impl:feature/c'], expectExit0: true },
  // approve-design: exercise the --analyze-clean marker switch on any node.
  'approve-design': { argv: ['design:feature/a', '--analyze-clean'], expectExit0: true },
};

/** The completeness guard: every registered subaction has a check (3) fixture.
 * A new subaction without one fails loud here rather than silently skipping
 * flag-acceptance coverage (the gap this hardening closes). */
function invocationFor(sub: string): ValidInvocation {
  const entry = VALID_INVOCATION[sub];
  if (entry === undefined) {
    throw new Error(`help-nondrift: no check-(3) VALID_INVOCATION fixture for subaction '${sub}'`);
  }
  return entry;
}

function isUnknownFlagOrSubaction(stderr: string): boolean {
  return /unknown flag /.test(stderr) || /unknown subaction /.test(stderr);
}

describe('027 T006 — check (3): every shown flag is accepted; an unshown flag is rejected', () => {
  for (const sub of SUBACTIONS) {
    const invocation = invocationFor(sub);

    it(`${sub}: the minimal valid invocation is accepted (no unknown-flag rejection)`, () => {
      const docPath = tmpChain();
      const r = runCli(['roadmap', sub, ...invocation.argv, '--doc', docPath]);
      // Every flag the grammar declares (and thus the help shows) is passed in the
      // fixture invocation; a parse-time unknown-flag rejection would prove drift.
      expect(isUnknownFlagOrSubaction(r.stderr)).toBe(false);
      if (invocation.expectExit0) {
        // exit 0 dry-run proves every declared flag was accepted AND validated.
        expect(r.status).toBe(0);
      }
    });

    it(`${sub}: a bogus --zzz-not-a-flag is rejected (exit 2, unknown flag)`, () => {
      expect(flagNamesFor(SUBACTION_SPECS[sub]!)).not.toContain('--zzz-not-a-flag');
      const docPath = tmpChain();
      const r = runCli([
        'roadmap', sub, ...invocation.argv,
        '--zzz-not-a-flag', 'bogus',
        '--doc', docPath,
      ]);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('unknown flag --zzz-not-a-flag');
    });
  }
});

describe('027 T006 — anchored flag-acceptance spot checks (advance + add)', () => {
  it('advance: an undeclared --bogus is rejected (not in help) → exit 2', () => {
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
    // Assert the shown set and the exercised set are consistent: every flag we
    // assert is shown is ALSO passed to the parser below (cross-model codex-02 +
    // claude-04 — the prior version asserted --part-of was shown but never passed
    // it, so the "is it accepted?" half of check (3) never exercised --part-of).
    expect(shown.has('--status')).toBe(true);
    expect(shown.has('--scope')).toBe(true);
    expect(shown.has('--part-of')).toBe(true);
    const r = runCli([
      'roadmap', 'add', 'impl:gap/z',
      '--status', 'planned',
      '--scope', 'x',
      '--part-of', 'design:feature/a',
      '--doc', docPath,
    ]);
    expect(r.status).toBe(0);
  });
});
