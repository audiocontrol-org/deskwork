// Shared fixtures for the command-surface help-probe tests (028 US1, T002;
// FR-001/002). NOT a *.test.ts, so vitest does not collect it.
//
// Two things every help-probe test needs:
//   1. `liveVerbs()` — the live verb set, discovered the SAME way an operator
//      would: by running `stackctl --help` and reading the `Verbs:` line. This
//      is deliberately spawn-derived rather than `import { SUBCOMMANDS }`:
//      `cli.ts` runs `main()` on module load, so importing it would execute the
//      CLI as a side effect. Discovering verbs through the live `--help` surface
//      is both side-effect-free AND the faithful "discover without reading
//      source" path (FR-001).
//   2. `probeHelp(verb, sub?)` — run `stackctl <verb> [sub] --help` through the
//      real CLI and capture exit code + stdout, so a test can assert exit 0 +
//      a non-empty usage body (SC-001).

import { runCli } from '../_run-helpers.js';

/**
 * The live top-level verb set, parsed from `stackctl --help` (the `Verbs:` line),
 * sorted for stable iteration. Fails loud if the line is absent — a help surface
 * that no longer enumerates its verbs is a regression the harness must surface,
 * not paper over with an empty list.
 */
export function liveVerbs(): readonly string[] {
  const r = runCli(['--help']);
  const out = r.stdout ?? '';
  if (r.status !== 0) {
    // A non-zero `--help` is itself a regression: parsing stdout anyway could
    // return a stale/partial verb list that makes every downstream per-verb loop
    // pass vacuously. Fail loud (AUDIT-BARRAGE-claude-04, 028 Phase 1 govern).
    throw new Error(
      `command-surface-harness: 'stackctl --help' exited ${r.status} (expected 0). stdout:\n${out}\nstderr:\n${r.stderr ?? ''}`,
    );
  }
  // `printUsage` (src/cli.ts) emits the whole verb set on ONE `\n`-terminated
  // line (`Verbs: ${keys.join(', ')}\n`), and `spawnSync` captures raw stdout
  // bytes with no TTY-width wrapping — so the single matched line carries the
  // complete set; there is no multi-line continuation to truncate.
  const line = out.split('\n').find((l) => l.startsWith('Verbs:'));
  if (line === undefined) {
    throw new Error(
      `command-surface-harness: 'stackctl --help' printed no 'Verbs:' line (exit ${r.status}). stdout:\n${out}`,
    );
  }
  const verbs = line
    .slice('Verbs:'.length)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .sort();
  if (verbs.length === 0) {
    // A present-but-empty `Verbs:` line means the help surface collapsed to zero
    // verbs — exactly the regression this harness exists to catch. Fail loud
    // rather than return [] (which would make every downstream per-verb loop
    // pass vacuously).
    throw new Error(
      `command-surface-harness: 'Verbs:' line found but contained no verbs (exit ${r.status}). stdout:\n${out}`,
    );
  }
  return verbs;
}

/** The outcome of a `--help` probe against one verb (and optional sub-action). */
export interface HelpProbe {
  readonly verb: string;
  readonly sub: string | null;
  /** Process exit code (`null` only if the child was killed by a signal). */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run `stackctl <verb> [sub] --help` and capture the outcome. A conformant verb
 * exits 0 with a non-empty usage body on stdout; `isHelpConformant()` is the
 * shared predicate the SC-001 assertions use.
 */
export function probeHelp(verb: string, sub?: string): HelpProbe {
  const args = sub ? [verb, sub, '--help'] : [verb, '--help'];
  const r = runCli(args);
  return {
    verb,
    sub: sub ?? null,
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

/**
 * A probe passes when it exits 0 AND prints a recognizable usage body on STDOUT.
 *
 * "Usage body" is asserted by a LINE-ANCHORED `Usage:` marker (`/^usage:/im`) — the
 * header the descriptor renderer (and the existing `roadmap-help.ts`) emit — not
 * merely "any stdout containing 'usage:'". Anchoring to the start of a line avoids
 * a false positive from an error banner like "Illegal usage: …" that happens to
 * embed the token (AUDIT-BARRAGE-claude-05, 028 Phase 1 govern). A verb that exits
 * 0 while printing an unrelated banner / JSON blob is NOT conformant help.
 *
 * The stdout-only check is intentional: SC-001 specifies "a non-empty usage body
 * on stdout", and the renderer writes help to stdout by design. A verb whose
 * `--help` emitted usage to stderr instead would be a real help-routing defect we
 * WANT surfaced as non-conformant — so the predicate deliberately does not consult
 * `probe.stderr`.
 */
export function isHelpConformant(probe: HelpProbe): boolean {
  return probe.status === 0 && /^usage:/im.test(probe.stdout);
}
