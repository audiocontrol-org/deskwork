// 026 T014 — `stackctl front-door enter|exit` (contracts/cli-verbs.md). The marker
// writer the stack-control capability-interface skills call to bracket a sanctioned
// backend drive: `enter` pushes a session-keyed marker entry and prints its token;
// `exit` removes only that token's entry (safe after a crash). Installation-anchored:
// `enter` REFUSES with no enclosing installation (it cannot anchor the write); `exit`
// is a no-op success when there is nothing to anchor (crash-safety). Pure core
// (`frontDoor`) is hermetically testable; `runFrontDoor` does process I/O + exit.

import { enterFrontDoor, exitFrontDoor, isSafeSession } from '../capability/marker.js';
import { CAPABILITY_REGISTRY } from '../capability/registry.js';
import { findInstallation } from '../config/installation.js';

const USAGE =
  'usage: stackctl front-door <enter --capability <id> --session <id> | exit --token <tok> --session <id>> [--at <dir>]';

/** Injectable seams so the verb logic is tested without disk/installation. */
export interface FrontDoorDeps {
  readonly resolveRoot: (at: string) => string | null;
  readonly enter: (root: string, session: string, capability: string) => string;
  readonly exit: (root: string, session: string, token: string) => void;
}

export interface FrontDoorResult {
  readonly code: 0 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

function usageErr(message: string): FrontDoorResult {
  return { code: 2, stdout: '', stderr: `front-door: ${message}\n${USAGE}\n` };
}

/** Pure core: parse strictly, drive the marker via injected deps, render. */
export function frontDoor(args: readonly string[], deps: FrontDoorDeps): FrontDoorResult {
  const sub = args[0];
  if (sub !== 'enter' && sub !== 'exit') {
    return usageErr(`subaction must be 'enter' or 'exit' (got '${sub ?? ''}')`);
  }

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
  };
}

/** Thin CLI wrapper: run the pure core, emit its I/O, exit with its code. */
export async function runFrontDoor(args: string[]): Promise<void> {
  const result = frontDoor(args, defaultDeps());
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exit(result.code);
}
