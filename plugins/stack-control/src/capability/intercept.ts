// 026 T015 — the vendor-neutral interceptor logic (research D7, contracts/interceptor-hook.md).
// Maps a PreToolUse hook payload → a MediationDecision via the shared decision core. The
// Claude adapter (bin/intercept) and any other vendor adapter are thin shells over this;
// they contain NO decision logic (Principle III). A cheap local pre-filter (no backend
// name present anywhere → permit without resolving the marker) bounds per-call latency,
// since this fires on EVERY Bash/Skill tool use.

import { matchCapability } from './identity.js';
import { decideMediation, type MediationDecision } from './mediate.js';
import { CAPABILITY_REGISTRY, type CapabilityRegistry, type Surface } from './registry.js';

/** The PreToolUse stdin payload fields this adapter reads (`Skill` → `tool_input.skill`,
 *  proven by the skill-surface-mediation live spike 2026-06-18; the T002 spike's `skill_name`
 *  was falsified — Claude Code does not send that field). */
export interface HookPayload {
  readonly tool_name?: unknown;
  readonly tool_input?: unknown;
  readonly session_id?: unknown;
  readonly cwd?: unknown;
}

/** Injectable marker resolver (the only side-effecting dependency) — keeps the logic pure. */
export interface InterceptDeps {
  readonly resolveActive: (cwd: string, session: string) => ReadonlySet<string>;
  readonly registry?: CapabilityRegistry;
}

// hooks.json registers PreToolUse matchers by TOOL NAME ("Bash", "Skill") — the
// documented matcher semantics (the matcher filters on the tool name, not the skill
// name). ALL skill-name filtering happens HERE in interceptDecision, reading the
// registry — so there is no skill list in hooks.json to drift from the registry (FR-011
// is satisfied by construction: hooks.json is a constant, the registry is the source).

/** Every backend identity (skill + cli) across the registry — the pre-filter alphabet. */
export function backendNames(registry: CapabilityRegistry): string[] {
  return registry.capabilities.flatMap((c) => [...c.backendIdentities.skills, ...c.backendIdentities.cliArgv0]);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Decide an intercepted PreToolUse call. Resolves surface + identity from the payload
 * (`Bash` → `tool_input.command`; `Skill` → `tool_input.skill`), applies the cheap
 * pre-filter, and defers to the shared decision core. A non-Bash/Skill tool, or an
 * identity naming no fronted backend, permits without touching the marker.
 */
export function interceptDecision(payload: HookPayload, deps: InterceptDeps): MediationDecision {
  const registry = deps.registry ?? CAPABILITY_REGISTRY;
  const toolName = str(payload.tool_name);
  const input =
    typeof payload.tool_input === 'object' && payload.tool_input !== null
      ? (payload.tool_input as Record<string, unknown>)
      : {};

  let surface: Surface;
  let identity: string;
  if (toolName === 'Bash') {
    surface = 'bash';
    identity = str(input.command);
  } else if (toolName === 'Skill') {
    surface = 'skill';
    identity = str(input.skill);
  } else {
    return { verdict: 'permit', capability: null, reason: 'not an intercepted tool' };
  }

  // Match the identity FIRST — pure, no I/O (research D7). Only a real fronted backend
  // needs the marker resolved, so a non-backend (`ls`, or `cat backlog.md` whose argv[0]
  // is `cat`) permits WITHOUT reading the marker. That also means a malformed marker file
  // cannot cause a false denial of an unrelated command (codex-02): we never read it
  // unless the precise match already found a backend.
  if (matchCapability(registry, surface, identity) === null) {
    return { verdict: 'permit', capability: null, reason: 'not a fronted backend' };
  }

  const session = str(payload.session_id);
  const cwd = str(payload.cwd, process.cwd());
  return decideMediation(registry, surface, identity, deps.resolveActive(cwd, session));
}

/** The PreToolUse hook stdout that DENIES a tool call with a reason (T002 spike contract). */
export function denyOutput(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}
