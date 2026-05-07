/**
 * Discovery descriptor for the long-lived bridge sidecar.
 *
 * Path: `<projectRoot>/.deskwork/.bridge`
 * Schema: `{ port, pid, startedAt, version }` — see Phase 10a §5.
 *
 * Lifecycle:
 *   1. Sidecar binds its loopback port FIRST.
 *   2. Sidecar atomically writes the descriptor (`writeFile` to a
 *      pid-suffixed temp path → `rename` to the final path).
 *   3. Sidecar removes the descriptor on graceful exit (SIGTERM/SIGINT).
 *      SIGKILL bypasses cleanup; the studio handles the stale-descriptor
 *      case at boot in Phase 10c.
 *
 * The order matters: a descriptor that exists must always reflect a live
 * or recently-live sidecar. The studio's pre-bind health check
 * (`GET /api/chat/state`) closes the alive-vs-stale gap.
 */

import { mkdir, rename, unlink, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface BridgeDescriptor {
  /** Sidecar's chosen loopback port (after bind, not the requested port). */
  readonly port: number;
  /** Sidecar process id. */
  readonly pid: number;
  /** ISO 8601 timestamp; e.g. "2026-05-07T18:42:11.039Z". */
  readonly startedAt: string;
  /** `@deskwork/bridge` package version. */
  readonly version: string;
}

const DESCRIPTOR_DIR = '.deskwork';
const DESCRIPTOR_NAME = '.bridge';

export function descriptorPath(projectRoot: string): string {
  return join(projectRoot, DESCRIPTOR_DIR, DESCRIPTOR_NAME);
}

function descriptorTempPath(projectRoot: string, pid: number): string {
  return join(projectRoot, DESCRIPTOR_DIR, `${DESCRIPTOR_NAME}.tmp-${pid}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asDescriptor(value: unknown): BridgeDescriptor | null {
  if (!isRecord(value)) return null;
  const port = value['port'];
  const pid = value['pid'];
  const startedAt = value['startedAt'];
  const version = value['version'];
  if (typeof port !== 'number' || !Number.isInteger(port) || port <= 0) return null;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null;
  if (typeof startedAt !== 'string' || startedAt.length === 0) return null;
  if (typeof version !== 'string' || version.length === 0) return null;
  return { port, pid, startedAt, version };
}

/**
 * Atomically write the descriptor. Ensures the parent directory exists,
 * writes to a pid-suffixed temp file, then renames into place.
 */
export async function writeDescriptor(
  projectRoot: string,
  info: BridgeDescriptor,
): Promise<void> {
  const dir = join(projectRoot, DESCRIPTOR_DIR);
  await mkdir(dir, { recursive: true });
  const finalPath = descriptorPath(projectRoot);
  const tempPath = descriptorTempPath(projectRoot, info.pid);
  const json = JSON.stringify(info);
  await writeFile(tempPath, json, 'utf8');
  await rename(tempPath, finalPath);
}

/**
 * Best-effort descriptor removal. Used by sidecar graceful-exit handlers;
 * a failure here (file already gone, permission churn) must NOT prevent
 * the process from exiting.
 */
export async function removeDescriptor(projectRoot: string): Promise<void> {
  const path = descriptorPath(projectRoot);
  try {
    await unlink(path);
  } catch (err) {
    // ENOENT → descriptor already gone, fine. Other errors → log and
    // swallow; the process is on its way out.
    if (
      isRecord(err) &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return;
    }
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`deskwork-bridge: failed to remove descriptor: ${reason}\n`);
  }
}

/**
 * Read + validate the descriptor. Returns `null` when the file is
 * missing, malformed JSON, or fails schema validation. Used by the
 * studio in Phase 10c (pre-bind discovery) and by the sidecar's own
 * collision-detection at boot (10b).
 */
export async function readDescriptor(
  projectRoot: string,
): Promise<BridgeDescriptor | null> {
  const path = descriptorPath(projectRoot);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (
      isRecord(err) &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return null;
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return asDescriptor(parsed);
}
