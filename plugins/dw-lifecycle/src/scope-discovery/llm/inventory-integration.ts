/**
 * plugins/dw-lifecycle/src/scope-discovery/llm/inventory-integration.ts
 *
 * scope-inventory ↔ LLM ensemble integration.
 *
 * The scope-inventory orchestrator runs:
 *
 *   - BEFORE agent fan-out: `readPendingAuditUpdatesForInventory()` —
 *     surface auditor findings since the last run so the run report
 *     includes them.
 *
 *   - AFTER synthesis: `fireAuditForInventory()` — emit an audit-request
 *     artifact so the external auditor process picks it up + writes
 *     findings back to the audit-log for the next run.
 *
 * Both are SILENTLY skipped when `.dw-lifecycle/scope-discovery/` isn't
 * installed (the operator hasn't opted into scope-discovery; the plugin
 * shouldn't write to `.dw-lifecycle/` without explicit consent).
 *
 * CLI opt-out: `--no-audit-fire` (skip the fire) and `--no-audit-read`
 * (skip the read) are operator escape hatches; the integration treats
 * them as "skip without warning."
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadLlmConfig } from './config.js';
import {
  persistAuditWatermark,
  readAuditLogUpdates,
} from './audit-log-reader.js';
import { fireExternalAudit } from './auditor.js';
import { errorMessage } from '../util/typeguards.js';
import type {
  AuditLogEntry,
  AuditorInput,
  CatalogStateSummary,
} from './types.js';

const SCOPE_DISCOVERY_INSTALL_MARKER = '.dw-lifecycle/scope-discovery';

/**
 * Is scope-discovery installed in this project? The orchestrator
 * presence-checks the directory; the LLM ensemble's writes (the
 * pending-audits dir, the orchestrator-runtime dir) all live inside
 * this tree, so absence means "operator hasn't opted in."
 */
export function isScopeDiscoveryInstalled(repoRoot: string): boolean {
  return existsSync(resolve(repoRoot, SCOPE_DISCOVERY_INSTALL_MARKER));
}

export interface InventoryAuditReadOptions {
  /** Absolute path to the audit-log markdown. */
  readonly auditLogPath: string;
  /** Skip when true (operator passed --no-audit-read). */
  readonly skip: boolean;
  /** Emit a one-line summary via this callback. */
  readonly emitNote: (msg: string) => void;
}

export interface InventoryAuditReadResult {
  readonly entries: ReadonlyArray<AuditLogEntry>;
  readonly newWatermark: string | null;
  readonly skipped: boolean;
  readonly skipReason?: string;
}

/**
 * Read audit-log updates before the agent fan-out.
 *
 * Returns the surfaced entries + a `newWatermark` the caller persists
 * after the orchestrator has acted on the entries (we don't persist
 * here — the caller decides when the entries are durable in the
 * downstream artifacts).
 */
export async function readPendingAuditUpdatesForInventory(args: {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly options: InventoryAuditReadOptions;
}): Promise<InventoryAuditReadResult> {
  if (args.options.skip) {
    return {
      entries: [],
      newWatermark: null,
      skipped: true,
      skipReason: '--no-audit-read flag set',
    };
  }
  if (!isScopeDiscoveryInstalled(args.repoRoot)) {
    return {
      entries: [],
      newWatermark: null,
      skipped: true,
      skipReason: 'scope-discovery not installed',
    };
  }
  try {
    const config = await loadLlmConfig(args.repoRoot);
    const result = await readAuditLogUpdates({
      repoRoot: args.repoRoot,
      featureSlug: args.featureSlug,
      auditLogPath: args.options.auditLogPath,
      configOverride: config,
    });
    if (result.entries.length > 0) {
      args.options.emitNote(
        `read ${result.entries.length} new audit-log entries (watermark → ${result.watermark})`,
      );
    }
    return {
      entries: result.entries,
      newWatermark: result.watermark,
      skipped: false,
    };
  } catch (err) {
    // Per CLAUDE.md no-fallback: surface failures loudly. The
    // orchestrator decides whether to abort or proceed (it's a
    // pre-flight read; failures shouldn't block the manifest write).
    args.options.emitNote(
      `audit-log read failed (continuing without it): ${errorMessage(err)}`,
    );
    return {
      entries: [],
      newWatermark: null,
      skipped: true,
      skipReason: 'audit-log read error',
    };
  }
}

/**
 * Persist the watermark advanced by the orchestrator. Called by the
 * caller AFTER it has acted on the surfaced entries. Silently no-op
 * when the watermark is null (read was skipped or surfaced nothing).
 */
export async function persistInventoryWatermark(args: {
  readonly repoRoot: string;
  readonly featureSlug: string;
  readonly newWatermark: string | null;
}): Promise<void> {
  if (args.newWatermark === null) return;
  if (!isScopeDiscoveryInstalled(args.repoRoot)) return;
  try {
    const config = await loadLlmConfig(args.repoRoot);
    await persistAuditWatermark(
      args.repoRoot,
      args.featureSlug,
      args.newWatermark,
      config,
    );
  } catch (err) {
    // Persisting the watermark is best-effort — a failure here means
    // the next run reprocesses the same entries. Surface the message
    // so the operator sees it; do not throw.
    process.stderr.write(
      `scope-inventory: failed to persist audit watermark: ${errorMessage(err)}\n`,
    );
  }
}

export interface InventoryAuditFireOptions {
  /** Skip when true (operator passed --no-audit-fire). */
  readonly skip: boolean;
  /** Emit a one-line summary via this callback. */
  readonly emitNote: (msg: string) => void;
  /** Catalog-state summary the orchestrator already computed. */
  readonly catalogState: CatalogStateSummary;
  /** Feature slug (mirrors the manifest's). */
  readonly featureSlug: string;
}

export interface InventoryAuditFireResult {
  readonly skipped: boolean;
  readonly skipReason?: string;
  readonly artifactPath?: string;
}

/**
 * Fire the external auditor at the end of the scope-inventory run.
 *
 * The auditor input passes (a) the feature slug + (b) the catalog
 * state + (c) an empty judge-proposals list (the in-band judge work
 * is downstream — Task 6 implement-skill augmentation). This dispatch
 * is the SHELL of the fire step that Task 6's implement-skill will
 * augment with real judge proposals when it lands.
 */
export async function fireAuditForInventory(args: {
  readonly repoRoot: string;
  readonly options: InventoryAuditFireOptions;
}): Promise<InventoryAuditFireResult> {
  if (args.options.skip) {
    return { skipped: true, skipReason: '--no-audit-fire flag set' };
  }
  if (!isScopeDiscoveryInstalled(args.repoRoot)) {
    return { skipped: true, skipReason: 'scope-discovery not installed' };
  }
  try {
    const input: AuditorInput = {
      featureSlug: args.options.featureSlug,
      recentWork: {
        extraContext: [
          'scope-inventory run completed; auditor should review the synthesized manifest',
        ],
      },
      judgeProposals: [],
      catalogState: args.options.catalogState,
    };
    const path = await fireExternalAudit(input, {
      repoRoot: args.repoRoot,
    });
    args.options.emitNote(
      `fired external audit request → ${path}`,
    );
    return { skipped: false, artifactPath: path };
  } catch (err) {
    args.options.emitNote(
      `external audit fire failed (continuing): ${errorMessage(err)}`,
    );
    return { skipped: true, skipReason: 'audit fire error' };
  }
}

/**
 * Helper: synthesize a CatalogStateSummary stub for use by callers that
 * haven't yet computed the per-status counts (Task 4 metrics work).
 * The structure is correct + the totals are zero; the controller
 * (Task 5) is what makes use of the counts.
 */
export function emptyCatalogState(): CatalogStateSummary {
  return {
    statusCounts: {
      pending: 0,
      blessed: 0,
      cursed: 0,
      ignore: 0,
      'tracked-holdout': 0,
      withdrawn: 0,
    },
    totalEntries: 0,
  };
}
