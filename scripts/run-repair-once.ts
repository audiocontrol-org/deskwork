#!/usr/bin/env tsx
/**
 * One-shot harness for `repairAll` — bypasses the legacy doctor's
 * interactive orphan-id prompts so the new entry-centric repairs
 * (#182 artifactPath backfill + calendar regeneration) can run
 * non-interactively.
 *
 * Used during the Phase 34 ship-pass to clear the
 * source-shipped-deskwork-plan sidecar's missing artifactPath
 * surfaced by the post-pivot audit. Safe to delete after use; kept
 * for future operators who hit the same shape.
 */

import { repairAll } from '@deskwork/core/doctor/repair';
import { resolve } from 'node:path';

async function main(): Promise<void> {
  const projectRoot = resolve(process.argv[2] ?? process.cwd());
  const result = await repairAll(projectRoot, { destructive: false });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

void main();
