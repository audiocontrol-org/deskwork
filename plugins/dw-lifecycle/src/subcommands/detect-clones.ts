/**
 * plugins/dw-lifecycle/src/subcommands/detect-clones.ts
 *
 * Thin dispatch shim for the `dw-lifecycle detect-clones` subcommand.
 * Delegates to the scope-discovery clone-detector core; the actual
 * logic + flag parsing lives in scope-discovery/clone-detector.ts to
 * keep the subcommands/ tree focused on dispatch wiring.
 *
 * Subcommand contract (mirrors the audiocontrol pilot's CLI):
 *   --root <path>             override .jscpd.json `path`
 *   --quiet                   suppress per-clone output
 *   --json                    emit JSON for tooling
 *   --baseline <path>         override default docs/scope-discovery/clones.yaml
 *   --refresh-baseline        rewrite the baseline, preserving dispositions
 *   --diff                    print only NEW + DROPPED + summary line
 *
 * Exit codes (handled inside detectClones via process.exit):
 *   0   no NEW clone groups (or first-run baseline written)
 *   1   one or more NEW groups since the baseline
 *   2   I/O, parse, or jscpd-crash error
 */

import { detectClones } from '../scope-discovery/clone-detector.js';

export { detectClones };
