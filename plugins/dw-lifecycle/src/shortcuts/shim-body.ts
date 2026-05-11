/**
 * Canonical shim body for `~/.claude/commands/<shim>.md`.
 *
 * Every shim is a single-line forward to the corresponding
 * `/dw-lifecycle:<command>` slash command, with `$ARGUMENTS`
 * pass-through so any positional args the operator typed flow into
 * the underlying command. Shared between install (writes this body)
 * and uninstall (drift-checks against this body) so the literal lives
 * in exactly one place — drift between the two would let an install
 * write a body that uninstall would refuse on, silently.
 */
export function shimBody(command: string): string {
  return `/dw-lifecycle:${command} $ARGUMENTS\n`;
}
