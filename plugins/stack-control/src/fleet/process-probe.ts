/**
 * specs/036-fleet-control-plane — T006, PT-002.
 *
 * PID-reuse-safe process liveness. A bare PID is unsound: the OS recycles
 * PIDs, so a stale PID may now belong to an entirely unrelated process.
 * `ProcessProbe` answers "is the process that had this PID *and* this
 * start-time still alive?" — never merely "does something with this PID
 * exist?". Node has no native `flock` (open since 2014), so liveness of a
 * specific process INSTANCE has to be reconstructed in userspace from
 * PID + start-time (research.md PT-002).
 *
 * `StartTimeSource` is the platform seam (Constitution Principle VI, DI
 * with interface types): `ProcessProbe`'s reuse-defeating semantics are
 * entirely platform-independent and testable against a fake; only the
 * concrete start-time READ is platform-specific.
 *
 * Platform coverage: Linux (`/proc/<pid>/stat` field 22, clock-tick
 * resolution) and macOS (`ps -o lstart=`, second resolution). Windows has
 * NO implementation — `createSystemStartTimeSource` fails loud rather than
 * fabricating unverified behavior; callers on an unsupported platform must
 * inject their own `StartTimeSource`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Reads a value that uniquely identifies the process instance CURRENTLY
 * running at `pid` — changing whenever the OS assigns that PID to a
 * different process. Returns `undefined` when no process exists at `pid`
 * right now.
 */
export interface StartTimeSource {
  read(pid: number): string | undefined;
}

/** A specific process instance: the PID plus the start-time it had when captured. */
export interface ProcessIdentity {
  readonly pid: number;
  readonly startTime: string;
}

/**
 * Reconstructs process-instance liveness from PID + start-time. Two
 * captures of the same PID with different start-times are, by definition,
 * two different process instances — the second is a stale identity even
 * though the PID matches.
 */
export class ProcessProbe {
  constructor(private readonly startTimeSource: StartTimeSource) {}

  /**
   * Captures the identity of whatever process currently exists at `pid`,
   * or `undefined` if none does.
   */
  capture(pid: number): ProcessIdentity | undefined {
    const startTime = this.startTimeSource.read(pid);
    return startTime === undefined ? undefined : { pid, startTime };
  }

  /**
   * True iff the SAME process instance captured in `identity` is still
   * alive: a process still exists at `identity.pid` AND its current
   * start-time still matches. A PID reused by a different process reports
   * `false`, never `true`.
   */
  isAlive(identity: ProcessIdentity): boolean {
    const current = this.startTimeSource.read(identity.pid);
    return current !== undefined && current === identity.startTime;
  }
}

/**
 * Parses field 22 (`starttime`, ticks since boot) out of the content of
 * `/proc/<pid>/stat`. Exported as a pure function so its parsing rules are
 * testable via fixtures on hosts (including this dev machine) that have no
 * `/proc` at all.
 *
 * Per `man proc`, the `comm` field (2) is parenthesized and MAY itself
 * contain spaces and `)` characters, so field-splitting must key off the
 * LAST `)` in the line, not the first.
 */
export function parseLinuxProcStat(content: string): string {
  const closeParen = content.lastIndexOf(')');
  if (closeParen === -1) {
    throw new Error(
      `malformed /proc/<pid>/stat content: no ')' terminating the comm field: ${JSON.stringify(content)}`,
    );
  }
  const rest = content.slice(closeParen + 1).trim().split(/\s+/);
  // rest[0] is field 3 (state); starttime is field 22, i.e. rest[19].
  const starttime = rest[19];
  if (starttime === undefined || starttime.length === 0) {
    throw new Error(
      `malformed /proc/<pid>/stat content: could not locate field 22 (starttime): ${JSON.stringify(content)}`,
    );
  }
  return starttime;
}

/** Linux start-time source: reads `/proc/<pid>/stat` field 22. */
export function createLinuxStartTimeSource(): StartTimeSource {
  return {
    read(pid: number): string | undefined {
      let content: string;
      try {
        content = readFileSync(`/proc/${pid}/stat`, 'utf8');
      } catch {
        // ENOENT (no such process) and any other read failure both mean
        // "cannot vouch this process exists" — fail closed to undefined.
        return undefined;
      }
      return parseLinuxProcStat(content);
    },
  };
}

/**
 * macOS start-time source. macOS has no `/proc`; `ps -o lstart=` is the
 * portable read (second-resolution wall-clock start time, formatted by the
 * OS — treated as an opaque comparison key, never parsed as a date here).
 */
export function createDarwinStartTimeSource(): StartTimeSource {
  return {
    read(pid: number): string | undefined {
      let output: string;
      try {
        output = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
          encoding: 'utf8',
          // Explicit pipe on stderr too: ps prints a diagnostic (e.g. "process
          // id too large") for an out-of-range pid, which would otherwise leak
          // onto this process's stderr. Captured-but-discarded on the
          // undefined-return path below; the caller only needs the boolean
          // "does a process exist here", not the diagnostic text.
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch {
        // Non-zero exit (no such pid) or any spawn failure: no process to vouch for.
        return undefined;
      }
      const trimmed = output.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    },
  };
}

/**
 * Selects the `StartTimeSource` for `platform` (defaults to the running
 * process's own `process.platform`). Fails loud for any platform without
 * an implemented, verified source — in particular Windows, which is NOT
 * faked here. Callers on an unsupported platform must inject their own
 * `StartTimeSource` into `ProcessProbe` rather than relying on this factory.
 */
export function createSystemStartTimeSource(
  platform: NodeJS.Platform = process.platform,
): StartTimeSource {
  if (platform === 'linux') return createLinuxStartTimeSource();
  if (platform === 'darwin') return createDarwinStartTimeSource();
  throw new Error(
    `ProcessProbe has no start-time source implemented for platform "${platform}" — ` +
      'only "linux" (/proc/<pid>/stat) and "darwin" (ps -o lstart=) are implemented and ' +
      'verified. This is a deliberate scope limit (PT-002), not an oversight: fabricating ' +
      'an unverified Windows path would be worse than refusing. Inject a custom ' +
      'StartTimeSource for this platform instead of calling this factory.',
  );
}
