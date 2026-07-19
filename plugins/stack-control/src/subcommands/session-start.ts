// 011 T012 — `stackctl session-start` (read-only boot orientation). Resolves the
// enclosing installation (--at override, else cwd), assembles the orientation,
// prints the report, and STOPS — no authoring/implementation step fires (the
// two-session boundary; FR-002/FR-021). Strictly read-only w.r.t. the
// REPOSITORY: 0 on-disk changes there (SC-008) — the machine-local
// current-session record (below) lives OUTSIDE the repo (never git-tracked,
// `machine-state/current-session.ts`'s durable dir) and is unaffected by that
// guarantee. Fails loud outside any installation directing to `stackctl setup`
// (FR-014; no bundled-copy fallback). See contracts/session-start-cli.md.
//
// specs/037-instance-observability T026 — session lifecycle telemetry
// (contracts/telemetry-events.md § session.started; data-model.md D9;
// FR-007/FR-009a). After orienting, this verb MINTS the machine-local
// current-session record and emits `session.started{sessionId,startedAt}`.
// SUPERSEDE (FR-009a): if a session was already open, `mint()` returns its
// old id — emit `session.ended{reason:'abandoned'}` for it FIRST, then treat
// the newly-minted session as open. Both the mint/emit pair are FAIL-OPEN
// (`.claude/rules/session-skills-never-block.md`): any failure degrades to a
// silent no-op — this verb must always complete.
//
// Exit codes: 0 oriented; 1 fail-loud (outside an installation / malformed
// config); 2 usage error (unknown flag).

import { resolveInstallation } from '../config/installation.js';
import { InstallationError } from '../config/errors.js';
import { orient } from '../session/orient.js';
import { renderOrientation } from '../session/report.js';
import { mint as mintCurrentSession } from '../machine-state/current-session.js';
import { mintUuidV7 } from '../fleet/types.js';
import { emitSessionEvent } from '../telemetry/session-events.js';

interface StartFlags {
  readonly at: string | null;
  readonly json: boolean;
}

function usage(message: string): never {
  process.stderr.write(`session-start: ${message}\n`);
  process.stderr.write('usage: stackctl session-start [--at <dir>] [--json]\n');
  process.exit(2);
}

function parseFlags(args: readonly string[]): StartFlags {
  let at: string | null = null;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--json') {
      json = true;
    } else if (arg === '--at') {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) usage('--at requires a <dir> value');
      at = value;
      i++;
    } else if (arg.startsWith('--at=')) {
      at = arg.slice('--at='.length);
      if (at.length === 0) usage('--at requires a <dir> value');
    } else {
      usage(`unexpected argument '${arg}'`);
    }
  }
  return { at, json };
}

export async function runSessionStartCli(args: string[]): Promise<void> {
  const flags = parseFlags(args);
  const startDir = flags.at ?? process.cwd();

  let installation;
  try {
    installation = resolveInstallation(startDir);
  } catch (err) {
    if (err instanceof InstallationError) {
      process.stderr.write(`session-start: ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const report = orient({ installation, repoRoot: installation.root });

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderOrientation(report));
  }
  // Read-only w.r.t. the repo + STOP: no /speckit-* step fires (FR-002/FR-021).

  // Session lifecycle telemetry (specs/037 T026, D9, FR-007/FR-009a) — the
  // ENTIRE block is fail-open: a throw anywhere here must never surface to
  // this verb's caller (`session-skills-never-block`).
  try {
    const sessionId = mintUuidV7();
    const startedAt = new Date().toISOString();
    // AUDIT-20260719-02: record the open session under the SAME installation the
    // event is emitted for (the `--at`-resolved target), not the caller's cwd.
    const priorSessionId = mintCurrentSession(sessionId, startedAt, installation.root);
    if (priorSessionId !== undefined) {
      // SUPERSEDE (FR-009a): close the old session before the new one is
      // treated as open.
      await emitSessionEvent(installation.root, 'session.ended', priorSessionId, {
        sessionId: priorSessionId,
        endedAt: startedAt,
        reason: 'abandoned',
      });
    }
    await emitSessionEvent(installation.root, 'session.started', sessionId, {
      sessionId,
      startedAt,
    });
  } catch {
    // Fail-open: session telemetry must never block/throw session-start.
  }
}
