/**
 * Discovery descriptors for the long-lived bridge sidecar AND the
 * matching studio process.
 *
 * The two-process model uses a symmetric pair of descriptors under
 * `<projectRoot>/.deskwork/`:
 *
 *   - `.bridge` — written by `deskwork-bridge` at boot, consumed by
 *     `deskwork-studio` to discover the sidecar's port.
 *   - `.studio` — written by `deskwork-studio` at boot, consumed by
 *     the sidecar's reverse proxy to discover the studio's port.
 *
 * Schema: `{ port, pid, startedAt, version }` — see Phase 10a §5.
 *
 * Lifecycle:
 *   1. Process binds its loopback port FIRST.
 *   2. Process atomically writes the descriptor (`writeFile` to a
 *      pid-suffixed temp path → `rename` to the final path).
 *   3. Process removes the descriptor on graceful exit (SIGTERM/SIGINT).
 *      SIGKILL bypasses cleanup; the consumer side handles the stale-
 *      descriptor case at boot.
 *
 * The order matters: a descriptor that exists must always reflect a live
 * or recently-live process. Pre-bind health checks
 * (`GET /api/chat/state` for the sidecar) close the alive-vs-stale gap.
 */

import { mkdir, rename, unlink, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface BridgeDescriptor {
  /** Process's chosen loopback port (after bind, not the requested port). */
  readonly port: number;
  /** Process id. */
  readonly pid: number;
  /** ISO 8601 timestamp; e.g. "2026-05-07T18:42:11.039Z". */
  readonly startedAt: string;
  /** Package version (`@deskwork/bridge` for `.bridge`, `@deskwork/studio` for `.studio`). */
  readonly version: string;
}

/** Studio descriptor shares the same shape as the bridge descriptor. */
export type StudioDescriptor = BridgeDescriptor;

const DESCRIPTOR_DIR = '.deskwork';
const BRIDGE_NAME = '.bridge';
const STUDIO_NAME = '.studio';

function descriptorAt(projectRoot: string, name: string): string {
  return join(projectRoot, DESCRIPTOR_DIR, name);
}

function descriptorTempAt(projectRoot: string, name: string, pid: number): string {
  return join(projectRoot, DESCRIPTOR_DIR, `${name}.tmp-${pid}`);
}

export function descriptorPath(projectRoot: string): string {
  return descriptorAt(projectRoot, BRIDGE_NAME);
}

export function studioDescriptorPath(projectRoot: string): string {
  return descriptorAt(projectRoot, STUDIO_NAME);
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

async function writeAt(
  projectRoot: string,
  name: string,
  info: BridgeDescriptor,
): Promise<void> {
  const dir = join(projectRoot, DESCRIPTOR_DIR);
  await mkdir(dir, { recursive: true });
  const finalPath = descriptorAt(projectRoot, name);
  const tempPath = descriptorTempAt(projectRoot, name, info.pid);
  const json = JSON.stringify(info);
  await writeFile(tempPath, json, 'utf8');
  await rename(tempPath, finalPath);
}

async function removeAt(projectRoot: string, name: string): Promise<void> {
  const path = descriptorAt(projectRoot, name);
  try {
    await unlink(path);
  } catch (err) {
    if (
      isRecord(err) &&
      (err as { code?: unknown }).code === 'ENOENT'
    ) {
      return;
    }
    const reason = err instanceof Error ? err.message : String(err);
    process.stderr.write(`deskwork: failed to remove descriptor ${path}: ${reason}\n`);
  }
}

async function readAt(
  projectRoot: string,
  name: string,
): Promise<BridgeDescriptor | null> {
  const path = descriptorAt(projectRoot, name);
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

/**
 * Atomically write the bridge descriptor.
 */
export async function writeDescriptor(
  projectRoot: string,
  info: BridgeDescriptor,
): Promise<void> {
  return writeAt(projectRoot, BRIDGE_NAME, info);
}

/**
 * Best-effort bridge descriptor removal. Used by sidecar graceful-exit
 * handlers; failures must NOT prevent the process from exiting.
 */
export async function removeDescriptor(projectRoot: string): Promise<void> {
  return removeAt(projectRoot, BRIDGE_NAME);
}

/**
 * Read + validate the bridge descriptor. Returns `null` when the file is
 * missing, malformed JSON, or fails schema validation.
 */
export async function readDescriptor(
  projectRoot: string,
): Promise<BridgeDescriptor | null> {
  return readAt(projectRoot, BRIDGE_NAME);
}

/**
 * Atomically write the studio descriptor.
 */
export async function writeStudioDescriptor(
  projectRoot: string,
  info: StudioDescriptor,
): Promise<void> {
  return writeAt(projectRoot, STUDIO_NAME, info);
}

/**
 * Best-effort studio descriptor removal.
 */
export async function removeStudioDescriptor(projectRoot: string): Promise<void> {
  return removeAt(projectRoot, STUDIO_NAME);
}

/**
 * Read + validate the studio descriptor. Returns `null` when the file is
 * missing, malformed JSON, or fails schema validation. Used by the
 * sidecar's reverse-proxy at request time to discover where the studio
 * is currently bound.
 */
export async function readStudioDescriptor(
  projectRoot: string,
): Promise<StudioDescriptor | null> {
  return readAt(projectRoot, STUDIO_NAME);
}
