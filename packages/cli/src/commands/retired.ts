/**
 * Retired-verb stub for the deskwork CLI.
 *
 * The deskwork pipeline redesign (v0.11.0) collapsed nine stage-specific
 * verbs into five universal verbs (iterate / approve / block / cancel /
 * induct) plus the existing publish + status surfaces. The retired
 * subcommands no longer have skill modules behind them; this stub
 * intercepts them at the dispatcher and prints a stable migration message
 * so adopters with stale skill invocations get a clear pointer instead of
 * the generic "unknown subcommand" error.
 *
 * See MIGRATING.md for the full mapping.
 */

const RETIRED = new Set([
  'plan',
  'outline',
  'draft',
  'pause',
  'resume',
  'review-start',
  'review-cancel',
  'review-help',
  'review-report',
]);

export function isRetired(subcommand: string): boolean {
  return RETIRED.has(subcommand);
}

export function printRetiredError(subcommand: string): never {
  process.stderr.write(
    `deskwork: subcommand '${subcommand}' was retired in v0.11.0.\n` +
      `The deskwork pipeline now uses universal verbs:\n` +
      `  iterate    — within-stage edit cycle\n` +
      `  approve    — graduate to next stage\n` +
      `  block      — set Blocked\n` +
      `  cancel     — set Cancelled\n` +
      `  induct     — teleport to chosen stage\n` +
      `  publish    — Final → Published\n` +
      `  status     — per-entry state summary\n` +
      `\nSee MIGRATING.md for the full mapping.\n`,
  );
  process.exit(1);
}
