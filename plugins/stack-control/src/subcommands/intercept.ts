// 026 T015 — `stackctl intercept`: the Claude PreToolUse adapter entry. Reads the hook
// payload from stdin, runs the shared interceptor logic, and (on refuse) emits the
// PreToolUse deny JSON to stdout. Always exits 0 — a PreToolUse hook denies via its
// stdout JSON, not its exit code. The plugin's `bin/intercept` dispatches here through
// `bin/stackctl` (reusing its tsx resolution). All decision logic lives in the
// vendor-neutral core (interceptDecision); this is a thin stdin→stdout shell.

import { interceptDecision, denyOutput } from '../capability/intercept.js';
import { activeCapabilities } from '../capability/marker.js';
import { findInstallation } from '../config/installation.js';

function resolveActive(cwd: string, session: string): ReadonlySet<string> {
  const installation = findInstallation(cwd);
  return installation === null ? new Set() : activeCapabilities(installation.root, session);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

export async function runIntercept(_args: string[]): Promise<void> {
  const raw = (await readStdin()).trim();
  let payload: unknown = {};
  if (raw.length > 0) {
    try {
      payload = JSON.parse(raw);
    } catch {
      // This verb runs only after bin/intercept's pre-filter matched a BACKEND-LIKE
      // payload, so a parse failure here is a malformed backend-relevant event — fail
      // CLOSED (deny), not silently permit (codex-03). The reason is diagnosable.
      process.stdout.write(
        denyOutput(
          'stack-control mediation could not parse the hook payload (a backend-like event) — failing closed. Use the capability front door (/stack-control:*).',
        ),
      );
      return;
    }
  }
  // Fail CLOSED inside the verb (claude-01): if evaluating the decision throws (e.g. a
  // malformed marker or an unsafe payload session id), emit a deny rather than letting the
  // exception bubble — so the verb is self-contained fail-closed for a backend-like event,
  // not reliant on the bash wrapper's non-zero-exit handling.
  let decision;
  try {
    decision = interceptDecision(payload as Record<string, unknown>, { resolveActive });
  } catch (err) {
    process.stdout.write(
      denyOutput(
        `stack-control mediation could not be evaluated (${err instanceof Error ? err.message : String(err)}) — failing closed. Use the capability front door (/stack-control:*).`,
      ),
    );
    return;
  }
  if (decision.verdict === 'refuse') {
    process.stdout.write(denyOutput(decision.reason));
  }
  // permit → no output; the PreToolUse tool call proceeds.
}
