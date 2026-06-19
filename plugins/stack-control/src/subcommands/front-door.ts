// 026 T014 — `stackctl front-door enter|exit` (contracts/cli-verbs.md). The marker
// writer the stack-control capability-interface skills call to bracket a sanctioned
// backend drive: `enter` pushes a session-keyed marker entry and prints its token;
// `exit` removes only that token's entry (safe after a crash). Installation-anchored:
// `enter` REFUSES with no enclosing installation (it cannot anchor the write); `exit`
// is a no-op success when there is nothing to anchor (crash-safety). Pure core
// (`frontDoor`) is hermetically testable; `runFrontDoor` does process I/O + exit.

import {
  clearMarker,
  enterFrontDoor,
  exitFrontDoor,
  isSafeSession,
  listMarker,
  type MarkerListing,
} from '../capability/marker.js';
import { CAPABILITY_REGISTRY } from '../capability/registry.js';
import { findInstallation } from '../config/installation.js';

const USAGE =
  'usage: stackctl front-door <enter --capability <id> --session <id> | exit --token <tok> --session <id> | ' +
  'mediate-list --session <id> | mediate-recover --session <id> (alias reset)> [--at <dir>]';

/** Injectable seams so the verb logic is tested without disk/installation. */
export interface FrontDoorDeps {
  readonly resolveRoot: (at: string) => string | null;
  readonly enter: (root: string, session: string, capability: string) => string;
  readonly exit: (root: string, session: string, token: string) => void;
  /** Tolerant listing of a session's marker (recovery — T086). */
  readonly list: (root: string, session: string) => MarkerListing;
  /** Clear a session's marker by path, no parse (recovery — T086). Returns whether a file
   *  was removed (false = nothing to clear). */
  readonly clear: (root: string, session: string) => boolean;
}

export interface FrontDoorResult {
  readonly code: 0 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

function usageErr(message: string): FrontDoorResult {
  return { code: 2, stdout: '', stderr: `front-door: ${message}\n${USAGE}\n` };
}

/** Render a tolerant marker listing for `mediate-list` (T086): a corrupt file is reported
 *  as `corrupt (unparseable)`, an empty listing as `(no marker)`, else one line per entry. */
function renderListing(listing: MarkerListing): string {
  if (listing.corrupt) {
    return 'corrupt (unparseable) — run `front-door mediate-recover --session <id>` to clear it\n';
  }
  if (listing.entries.length === 0) return '(no marker)\n';
  return listing.entries
    .map((e) => `${e.capability}  token=${e.token}  writtenAt=${e.writtenAt}  ${e.fresh ? 'fresh' : 'stale'}`)
    .join('\n')
    .concat('\n');
}

/** The recognized sub-actions (`reset` is a true alias of `mediate-recover`). */
const SUBACTIONS = new Set(['enter', 'exit', 'mediate-list', 'mediate-recover', 'reset']);

/** Pure core: parse strictly, drive the marker via injected deps, render. */
export function frontDoor(args: readonly string[], deps: FrontDoorDeps): FrontDoorResult {
  const rawSub = args[0];
  if (rawSub === undefined || !SUBACTIONS.has(rawSub)) {
    return usageErr(
      `subaction must be 'enter', 'exit', 'mediate-list', 'mediate-recover', or 'reset' (got '${rawSub ?? ''}')`,
    );
  }
  const sub = rawSub === 'reset' ? 'mediate-recover' : rawSub; // normalize the alias

  let capability: string | undefined;
  let session: string | undefined;
  let token: string | undefined;
  let at: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--capability' || arg === '--session' || arg === '--token' || arg === '--at') {
      const value = args[i + 1];
      if (value === undefined) return usageErr(`${arg} requires a value`);
      i++;
      if (arg === '--capability') capability = value;
      else if (arg === '--session') session = value;
      else if (arg === '--token') token = value;
      else at = value;
    } else {
      return usageErr(`unexpected argument '${arg}'`);
    }
  }

  // Reject an empty session loudly (codex-02): if `$CLAUDE_CODE_SESSION_ID` expanded
  // empty, the marker would be written under an empty-session key the interceptor never
  // reads, silently refusing the sanctioned call. Fail before that mismatch can happen.
  if (session === undefined || session.trim() === '') {
    return usageErr('--session must be a non-empty value (is $CLAUDE_CODE_SESSION_ID set?)');
  }
  if (!isSafeSession(session)) {
    return usageErr(`--session '${session}' is not filename-safe (allowed: letters, digits, '.', '_', '-')`);
  }
  const root = deps.resolveRoot(at ?? process.cwd());

  if (sub === 'mediate-list') {
    // Read-only recovery surface (T086): list the session's marker (no installation →
    // (no marker)). Always exit 0 — inspecting state never refuses.
    if (root === null) return { code: 0, stdout: '(no marker)\n', stderr: '' };
    const listing = deps.list(root, session);
    return { code: 0, stdout: renderListing(listing), stderr: '' };
  }

  if (sub === 'mediate-recover') {
    // Mutating recovery surface (T086, SC-005): clear the session's marker by path (no
    // parse → a corrupt file is recoverable in one command). No installation → safe no-op
    // success (nothing to anchor). Always exit 0.
    if (root === null) {
      return { code: 0, stdout: `front-door mediate-recover: no installation — nothing to clear for session ${session}\n`, stderr: '' };
    }
    deps.clear(root, session);
    return { code: 0, stdout: `front-door mediate-recover: cleared marker for session ${session}\n`, stderr: '' };
  }

  if (sub === 'enter') {
    if (capability === undefined) return usageErr('enter requires --capability');
    // Reject an unknown capability id (codex-04): a typo'd `--capability spec-definiton`
    // would otherwise write a marker that can never authorize the intended backend, and
    // the resulting refusal would look like an interceptor bug. The registry is the source.
    if (!CAPABILITY_REGISTRY.capabilities.some((c) => c.id === capability)) {
      const known = CAPABILITY_REGISTRY.capabilities.map((c) => c.id).join(', ');
      return usageErr(`unknown --capability '${capability}' (known: ${known})`);
    }
    if (root === null) {
      return usageErr(
        'no stack-control installation found (front-door enter must be installation-anchored) — run `stackctl setup`',
      );
    }
    const issued = deps.enter(root, session, capability);
    return { code: 0, stdout: `${issued}\n`, stderr: '' };
  }

  // exit — reject an EMPTY token loudly (codex-01): the agent's `enter` and `exit` are
  // separate tool calls, so a `$TOKEN` shell var does not survive between them; an empty
  // token would no-op and silently LEAK the marker. Failing here forces the caller to pass
  // the literal token value `enter` printed.
  if (token === undefined || token.trim() === '') {
    return usageErr('exit requires a non-empty --token (pass the literal token value that `enter` printed)');
  }
  if (root !== null) deps.exit(root, session, token);
  return { code: 0, stdout: '', stderr: '' }; // no installation → nothing to clear → safe no-op
}

function defaultDeps(): FrontDoorDeps {
  return {
    resolveRoot: (at) => findInstallation(at)?.root ?? null,
    enter: enterFrontDoor,
    exit: exitFrontDoor,
    list: listMarker,
    clear: clearMarker,
  };
}

/** Thin CLI wrapper: run the pure core, emit its I/O, exit with its code. */
export async function runFrontDoor(args: string[]): Promise<void> {
  const result = frontDoor(args, defaultDeps());
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exit(result.code);
}
