// 026 T012 — `stackctl mediate-check` (contracts/cli-verbs.md). The vendor-neutral
// decision verb every adapter (Claude / Codex PreToolUse) calls. Resolves the registry
// + the session marker, applies the pure decision rule, and returns permit/refuse/usage
// via exit 0/1/2. Pure core (`mediateCheck`) returns a result so it is hermetically
// testable; the thin `runMediateCheck` wrapper does the process I/O + exit. Read-only
// (Principle IV) — it never writes the marker or any backend state.

import { matchCapability } from '../capability/identity.js';
import { activeCapabilities, isSafeSession } from '../capability/marker.js';
import { decideMediation } from '../capability/mediate.js';
import { CAPABILITY_REGISTRY, type Surface } from '../capability/registry.js';
import { findInstallation } from '../config/installation.js';

const USAGE =
  'usage: stackctl mediate-check --surface <bash|skill> --identity <str> --session <id> [--at <dir>] [--json]';

/** Injectable resolver: the active front-door capabilities for (installation@at, session). */
export interface MediateCheckDeps {
  readonly resolveActive: (at: string, session: string) => ReadonlySet<string>;
}

export interface MediateCheckResult {
  readonly code: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

function usageErr(message: string): MediateCheckResult {
  return { code: 2, stdout: '', stderr: `mediate-check: ${message}\n${USAGE}\n` };
}

/** Pure core: parse strictly, decide, render. No process I/O (testable). */
export function mediateCheck(args: readonly string[], deps: MediateCheckDeps): MediateCheckResult {
  let surface: string | undefined;
  let identity: string | undefined;
  let session: string | undefined;
  let at: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--json') {
      json = true;
    } else if (arg === '--surface' || arg === '--identity' || arg === '--session' || arg === '--at') {
      const value = args[i + 1];
      if (value === undefined) return usageErr(`${arg} requires a value`);
      i++;
      if (arg === '--surface') surface = value;
      else if (arg === '--identity') identity = value;
      else if (arg === '--session') session = value;
      else at = value;
    } else {
      return usageErr(`unexpected argument '${arg}'`); // strict: no silently-ignored flag
    }
  }

  if (surface === undefined) return usageErr('--surface is required');
  if (identity === undefined) return usageErr('--identity is required');
  if (session === undefined || session.trim() === '') return usageErr('--session must be a non-empty value');
  if (!isSafeSession(session)) return usageErr(`--session '${session}' is not filename-safe`);
  if (surface !== 'bash' && surface !== 'skill') {
    return usageErr(`--surface must be 'bash' or 'skill' (got '${surface}')`);
  }

  // Prove the identity is a fronted backend BEFORE resolving the marker (codex — symmetry
  // with the interceptor): a non-backend permits without reading marker state, so a
  // malformed marker can't false-deny an unrelated command.
  const surfaceTyped: Surface = surface; // narrowed to 'bash'|'skill' by the guard above — no cast
  const active =
    matchCapability(CAPABILITY_REGISTRY, surfaceTyped, identity) === null
      ? new Set<string>()
      : deps.resolveActive(at ?? process.cwd(), session);
  const decision = decideMediation(CAPABILITY_REGISTRY, surfaceTyped, identity, active);
  const code: 0 | 1 = decision.verdict === 'permit' ? 0 : 1;

  if (json) return { code, stdout: `${JSON.stringify(decision)}\n`, stderr: '' };
  if (decision.verdict === 'refuse') {
    return { code: 1, stdout: '', stderr: `mediate-check: REFUSED — ${decision.reason}\n` };
  }
  return { code: 0, stdout: '', stderr: '' };
}

/** Production resolver: find the enclosing installation (no throw) and read its marker.
 *  No installation → no marker store → empty active set (a backend then refuses). */
function defaultResolveActive(at: string, session: string): ReadonlySet<string> {
  const installation = findInstallation(at);
  return installation === null ? new Set() : activeCapabilities(installation.root, session);
}

/** Thin CLI wrapper: run the pure core, emit its I/O, exit with its code. */
export async function runMediateCheck(args: string[]): Promise<void> {
  const result = mediateCheck(args, { resolveActive: defaultResolveActive });
  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  process.exit(result.code);
}
