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

import { describe, it, expect, afterEach } from 'vitest';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../../src/__tests__/_run-helpers.js';
import { SUBACTION_SPECS } from '../../src/subcommands/roadmap.js';
import { flagNamesFor } from '../../src/cli-help/roadmap-help.js';
import { fixturePath } from './helpers.js';

// AUDIT-20260619-14 (TASK-275): `mkdtempSync` creates a fresh /tmp dir per call;
// without cleanup the `roadmap-help-nondrift-*` dirs accumulate indefinitely
// (slow disk-fill on shared CI runners). Track every dir this file creates and
// remove them after each test.
const createdDirs: string[] = [];
afterEach(() => {
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop()!, { recursive: true, force: true });
  }
});

function tmpChain(): string {
  const dir = mkdtempSync(join(tmpdir(), 'roadmap-help-nondrift-'));
  createdDirs.push(dir);
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
 *
 * Anchor (AUDIT-20260619-15/-22 / TASK-276/283): the match additionally requires a
 * flag-TABLE continuation right after the `--long` token — either a value
 * placeholder (` <…>` / ` […]`) OR a ≥2-space description-column gutter (the
 * `${token.padEnd(col)}  ${desc}` shape roadmap-help renders). This is the
 * structural feature that distinguishes a flag-table row from a bare `--token` that
 * merely STARTS a line — e.g. an indented vocabulary enumeration (`    --planned`
 * under a "valid values:" header) — which the prior line-start-only anchor would
 * have miscounted as a "shown" flag, spuriously failing check (2). The
 * `shownFlags is anchored to flag-TABLE rows` describe block below pins this against
 * crafted multi-style snippets so the regex stays calibrated as the formatter evolves.
 */
function shownFlags(helpText: string): Set<string> {
  const found = new Set<string>();
  for (const m of helpText.matchAll(/^[ \t]*(?:-[A-Za-z], )?(--[a-z][a-z0-9-]*)(?= [<[]| {2,})/gm)) {
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
  /** For an `expectExit0: false` subaction, the POSITIVE exit-2 reason (a
   * doc-resolution / validation phrase) proving the non-zero exit is NOT a flag
   * rejection — stronger than merely negating an incomplete unknown-flag pattern
   * (AUDIT-20260619-21 / TASK-282). Required when `expectExit0` is false. */
  readonly failureReason?: RegExp;
}

const VALID_INVOCATION: Readonly<Record<string, ValidInvocation>> = {
  next: { argv: [], expectExit0: true },
  blocked: { argv: [], expectExit0: true },
  order: { argv: [], expectExit0: true },
  graph: { argv: [], expectExit0: true },
  // reconcile resolves spec paths against a `specs/` glob-parent dir; a bare tmp
  // chain copy has none, so it exits 2 (DocumentModelError) — NOT a flag
  // rejection. Its value flags (--unorphan/--type) ARE exercised here: they parse
  // fine and the run still reaches the same doc-resolution failure (verified), so
  // the flag-acceptance half of check (3) covers them while `expectExit0` stays
  // false. The `failureReason` pins the doc-resolution phrase POSITIVELY (TASK-282)
  // so the exit-2 cannot be silently a flag rejection masquerading as a resolution
  // error, and the completeness guard sees --unorphan/--type exercised (TASK-281).
  reconcile: {
    argv: ['--unorphan', 'specs/x', '--type', 'feature'],
    expectExit0: false,
    failureReason: /glob-parent 'specs\//,
  },
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
  // resolves (031 US2): exercise BOTH multi-value flags (--add / --remove). A
  // dry-run --add of TASK-1 + --remove of an absent TASK-2 exits 0 (no write).
  resolves: {
    argv: ['impl:feature/c', '--add', 'TASK-1', '--remove', 'TASK-2'],
    expectExit0: true,
  },
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

/** Whether stderr is an unknown-flag / unknown-subaction rejection. Case-insensitive
 * with a word boundary (not a fixed trailing-space substring) so a re-capitalized or
 * re-spaced diagnostic doesn't make this silently return false and mask a real flag
 * rejection (AUDIT-20260619-21 / TASK-282). */
function isUnknownFlagOrSubaction(stderr: string): boolean {
  return /unknown (flag|subaction)\b/i.test(stderr);
}

/** The BOOLEAN flags a subaction's grammar declares — `flagNamesFor` minus `--doc`
 * and the value/multi-value flags. Derived from the grammar so a newly-declared
 * boolean flag is covered automatically (AUDIT-20260619-20 / TASK-281: `--apply` /
 * `--clear` were listed in help but the acceptance check never exercised them). */
function booleanFlagsFor(sub: string): readonly string[] {
  const grammar = SUBACTION_SPECS[sub]!;
  const valueLongs = new Set<string>([
    '--doc',
    ...grammar.valueFlags.map((f) => `--${f}`),
    ...(grammar.multiValueFlags ?? []).map((f) => `--${f}`),
  ]);
  return flagNamesFor(grammar).filter((f) => !valueLongs.has(f));
}

/** The leading positional tokens of a fixture invocation (the id, before any flag).
 * A minimal boolean-flag probe reuses these so the parser reaches flag validation. */
function leadingPositionals(argv: readonly string[]): readonly string[] {
  const out: string[] = [];
  for (const tok of argv) {
    if (tok.startsWith('-')) break;
    out.push(tok);
  }
  return out;
}

describe('027 T006 — check (3): every shown flag is accepted; an unshown flag is rejected', () => {
  for (const sub of SUBACTIONS) {
    const invocation = invocationFor(sub);

    it(`${sub}: the minimal valid invocation is accepted (no unknown-flag rejection)`, () => {
      const docPath = tmpChain();
      const r = runCli(['roadmap', sub, ...invocation.argv, '--doc', docPath]);
      // Every value-flag the grammar declares (and thus the help shows) is passed in
      // the fixture invocation; a parse-time unknown-flag rejection would prove drift.
      expect(isUnknownFlagOrSubaction(r.stderr)).toBe(false);
      if (invocation.expectExit0) {
        // exit 0 dry-run proves every declared flag was accepted AND validated.
        expect(r.status).toBe(0);
      } else {
        // The weak-gate subaction exits 2 for a reason UNRELATED to flag acceptance;
        // assert that reason POSITIVELY (TASK-282) rather than only negating an
        // unknown-flag pattern, so a flag rejection can't slip through as a "doc
        // resolution" failure.
        expect(r.status).toBe(2);
        expect(invocation.failureReason, `expectExit0:false '${sub}' must declare a failureReason`).toBeDefined();
        expect(r.stderr).toMatch(invocation.failureReason!);
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

// ── check (3b): boolean-flag acceptance ──────────────────────────────────────
// check (3)'s minimal invocation exercises every VALUE flag, but the BOOLEAN flags
// a subaction declares (`--apply`, and the mutually-exclusive markers `--clear` /
// `--chain` / `--analyze-clean` / `--validated` / `--cascade`) can't all share one
// argv, so several were listed in help yet never exercised for acceptance
// (AUDIT-20260619-20 / TASK-281). Probe each declared boolean flag on its own: the
// parser must ACCEPT it (no unknown-flag) — a downstream missing-required-value or
// validation error is fine, it still proves the flag parsed.
describe('027 T006 — check (3b): every declared boolean flag is accepted by the parser', () => {
  for (const sub of SUBACTIONS) {
    const positionals = leadingPositionals(invocationFor(sub).argv);
    for (const boolFlag of booleanFlagsFor(sub)) {
      it(`${sub}: declares ${boolFlag} and the parser accepts it (not an unknown-flag rejection)`, () => {
        const docPath = tmpChain();
        const r = runCli(['roadmap', sub, ...positionals, boolFlag, '--doc', docPath]);
        expect(isUnknownFlagOrSubaction(r.stderr)).toBe(false);
      });
    }
  }
});

describe('027 T006 — fixture completeness guards (no silently-unexercised flag)', () => {
  it('every declared flag is exercised by check (3) value-argv or check (3b) boolean-probe', () => {
    for (const sub of SUBACTIONS) {
      const declared = flagNamesFor(SUBACTION_SPECS[sub]!).filter((f) => f !== '--doc');
      const argvFlags = new Set(invocationFor(sub).argv.filter((t) => t.startsWith('--')));
      const boolFlags = new Set(booleanFlagsFor(sub));
      for (const flag of declared) {
        const exercised = argvFlags.has(flag) || boolFlags.has(flag);
        expect(exercised, `${sub}: declared flag ${flag} is exercised by the fixture argv or a boolean probe`).toBe(true);
      }
    }
  });

  // AUDIT-20260619-24 (TASK-285): `invocationFor` fails loud on a MISSING fixture;
  // this is the symmetric guard against a PHANTOM fixture — a VALID_INVOCATION key
  // for a subaction that no longer exists accumulates as a dead entry no loop
  // exercises. Both directions are now enforced.
  it('VALID_INVOCATION has no phantom entry for a removed subaction', () => {
    for (const key of Object.keys(VALID_INVOCATION)) {
      expect(SUBACTIONS, `VALID_INVOCATION key '${key}' is not a registered subaction`).toContain(key);
    }
  });
});

// AUDIT-20260619-15/-22 (TASK-276/283): pin `shownFlags` against crafted help-table
// snippets — both the styles it MUST capture and the line-start `--token` shapes it
// MUST exclude — so the regex stays calibrated as the formatter evolves.
describe('027 T006 — shownFlags is anchored to flag-TABLE rows, not bare line-start --tokens', () => {
  it('captures a plain `--long <arg>` row', () => {
    expect([...shownFlags('  --doc <path>  the doc')]).toEqual(['--doc']);
  });
  it('captures a `-x, --long <arg>` two-column row', () => {
    expect([...shownFlags('  -t, --to <status>  the target')]).toEqual(['--to']);
  });
  it('captures a boolean flag row (padded, no placeholder, ≥2-space gutter)', () => {
    expect([...shownFlags('  --apply       write the change')]).toEqual(['--apply']);
  });
  it('EXCLUDES an indented vocabulary enumeration of --tokens (the AUDIT-15 false-positive)', () => {
    expect([...shownFlags('valid values:\n    --planned\n    --in-flight\n')]).toEqual([]);
  });
  it('EXCLUDES a flag mentioned inline in prose, captures only the real row', () => {
    expect([...shownFlags('run with --apply to write the change')]).toEqual([]);
    expect([...shownFlags('  --to <status>  to (one of: planned, in-flight)')]).toEqual(['--to']);
  });
});

// Anchored spot-checks: readable, hand-written EXAMPLES of the contract the
// mechanical check (3)/(3b) loops enforce across every subaction. They are
// illustrative, NOT the coverage source — full per-subaction acceptance lives in
// check (3) (value flags) + check (3b) (boolean flags), and the completeness guard
// proves no declared flag is unexercised (AUDIT-20260619-19/-25 / TASK-280/286: the
// prior titles/comment overstated these as the acceptance coverage).
describe('027 T006 — anchored flag-acceptance spot checks (advance + add, illustrative)', () => {
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

  it('add: the three illustrated value-flags are shown AND accepted (full coverage is check (3)/(3b))', () => {
    const docPath = tmpChain();
    const help = runCli(['roadmap', 'add', '--help']);
    const shown = shownFlags(help.stdout);
    // The three flags asserted-shown here are also passed to the parser below. The
    // REMAINING add flags (--depends-on, --deferred-until, --spec, --ref, --apply)
    // are NOT a coverage gap: check (3) exercises every value flag via
    // VALID_INVOCATION.add and check (3b) exercises --apply — do not delete those
    // fixtures under the impression this illustrative spot-check covers them
    // (AUDIT-20260619-25 / TASK-286).
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
