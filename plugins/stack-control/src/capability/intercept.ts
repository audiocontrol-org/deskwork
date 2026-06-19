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

/** Injectable seams (the only side-effecting dependencies) — keeps the logic pure.
 *  - `resolveActive`: the active front-door capabilities for (installation@cwd, session),
 *    keyed by the RESOLVED installation root (the cwd linchpin reconcile, FR-023).
 *  - `resolveInstalled`: whether an enclosing installation exists at `cwd`. Optional for
 *    back-compat (defaults to `true`); the production adapter supplies the real probe so
 *    the no-installation short-circuit-to-permit (FR-020) fires symmetrically with
 *    `mediate-check`. */
export interface InterceptDeps {
  readonly resolveActive: (cwd: string, session: string) => ReadonlySet<string>;
  readonly resolveInstalled?: (cwd: string) => boolean;
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

  // No-installation short-circuit-to-permit (FR-020, T1) — mirrors `mediate-check`. With
  // no enclosing installation, an adopter's own backend call is PERMITTED (mediation fires
  // only inside an installation). FR-REQUIRED deliberate permit, not a silent fallback: a
  // refusal therefore implies an installation exists, so the `setup` redirect is always
  // satisfiable. Resolved BEFORE the marker read (a non-installed context needs no marker).
  const installed = deps.resolveInstalled?.(cwd) ?? true;
  if (!installed) {
    return {
      verdict: 'permit',
      capability: null,
      reason: 'no stack-control installation — mediation fires only inside an installation (FR-020)',
    };
  }

  return decideMediation(registry, surface, identity, deps.resolveActive(cwd, session));
}

/**
 * The OBSERVABLE fail-open notice (028 T092, FR-025). When the interceptor cannot REACH
 * `stackctl` (spawn / runtime failure — distinct from the verb running and returning a
 * decision), the adapter permits best-effort (026 FR-014 — the load-bearing guarantee is
 * the per-phase graduate gate, not the interceptor), but it must NEVER do so SILENTLY:
 * this notice is emitted so the skipped mediation is visible and diagnosable. FR-REQUIRED
 * loud fail-open, NOT a hidden fallback. `reason` carries the underlying failure detail.
 */
export function failOpenSignal(reason: string): string {
  return (
    `stack-control: WARNING — capability mediation was SKIPPED (could not reach stackctl: ${reason}). ` +
    `The backend call is permitted best-effort; this is NOT a silent bypass — the per-phase graduate ` +
    `gate remains the load-bearing guarantee. Fix bin/intercept / stackctl to restore mediation.`
  );
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
