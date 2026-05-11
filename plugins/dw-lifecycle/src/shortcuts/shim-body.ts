import { COMMANDS } from './schemes.js';

/**
 * Canonical command set guarded against drift between install (writes
 * a shim per command) and uninstall (drift-checks against the same
 * canonical body). Widened to `ReadonlySet<string>` so `.has()` accepts
 * unknown input without an `as` cast.
 */
const COMMAND_SET: ReadonlySet<string> = new Set(COMMANDS);

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
 *
 * Throws on unknown commands so a typo or a stale manifest entry
 * surfaces loudly at the call site rather than producing a shim that
 * points at a non-existent slash command.
 */
export function shimBody(command: string): string {
  if (!COMMAND_SET.has(command)) {
    throw new Error(
      `shimBody: ${JSON.stringify(command)} is not a known dw-lifecycle command. ` +
        `Expected one of: ${COMMANDS.join(', ')}.`,
    );
  }
  return `/dw-lifecycle:${command} $ARGUMENTS\n`;
}
