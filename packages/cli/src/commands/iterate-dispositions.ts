/**
 * Shared helper for parsing the `--dispositions <path>` JSON file passed
 * to `deskwork iterate`. Both the legacy shortform path and the
 * entry-centric longform/outline path use the same file shape:
 *
 *     {
 *       "<commentId>": { "disposition": "addressed" | "deferred" | "wontfix",
 *                        "reason"?: string }
 *     }
 *
 * Validation matches what was previously inlined in
 * `runShortformIterate` so any downstream parser sees identical error
 * messages.
 */

import { existsSync, readFileSync } from 'node:fs';
import { absolutize, fail } from '@deskwork/core/cli-args';

export type Disposition = 'addressed' | 'deferred' | 'wontfix';

export interface DispositionEntry {
  disposition: Disposition;
  reason?: string;
}

const DISPOSITIONS: ReadonlySet<Disposition> = new Set([
  'addressed',
  'deferred',
  'wontfix',
]);

function isDisposition(v: unknown): v is Disposition {
  return typeof v === 'string' && DISPOSITIONS.has(v as Disposition);
}

/**
 * Read and validate a dispositions JSON file. On any failure (missing
 * file, invalid JSON, shape error) the helper calls `fail(...)` which
 * prints the message to stderr and exits non-zero — the same behavior as
 * the previously inlined version.
 *
 * Error messages are intentionally identical to the prior shortform-only
 * implementation so any downstream tooling that grepped them keeps
 * working.
 */
export function loadDispositionsFile(
  pathArg: string,
): Record<string, DispositionEntry> {
  const path = absolutize(pathArg);
  if (!existsSync(path)) {
    fail(`--dispositions file not found: ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    fail(`--dispositions: invalid JSON at ${path}: ${reason}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(`--dispositions: expected JSON object at ${path}`);
  }

  const out: Record<string, DispositionEntry> = {};
  for (const [commentId, raw] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (typeof raw !== 'object' || raw === null) {
      fail(`--dispositions[${commentId}]: must be an object`);
    }
    const r: { disposition?: unknown; reason?: unknown } = raw as {
      disposition?: unknown;
      reason?: unknown;
    };
    if (!isDisposition(r.disposition)) {
      fail(
        `--dispositions[${commentId}].disposition: must be 'addressed' | 'deferred' | 'wontfix'`,
      );
    }
    const entry: DispositionEntry = { disposition: r.disposition };
    if (typeof r.reason === 'string' && r.reason.length > 0) {
      entry.reason = r.reason;
    }
    out[commentId] = entry;
  }
  return out;
}
