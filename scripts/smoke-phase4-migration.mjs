#!/usr/bin/env node
/**
 * Phase 4 lane-migration smoke — sandbox clone of `.deskwork/`,
 * run `migrateLaneMembership`, report deltas. Read-only against the
 * live repo; the sandbox is wiped at the end.
 */

import { readdir, readFile, copyFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const projectRoot = process.cwd();
const coreDist = join(projectRoot, 'packages/core/dist');
const { migrateLaneMembership } = await import(join(coreDist, 'doctor/lane-migration.js'));

async function copyDirectory(src, dest) {
  await mkdir(dest, { recursive: true });
  const items = await readdir(src, { withFileTypes: true });
  for (const it of items) {
    const s = join(src, it.name);
    const d = join(dest, it.name);
    if (it.isDirectory()) await copyDirectory(s, d);
    else if (it.isFile()) await copyFile(s, d);
  }
}

const sandbox = await mkdtemp(join(tmpdir(), 'dw-smoke-mig-'));
await mkdir(join(sandbox, '.deskwork'), { recursive: true });
await copyDirectory(join(projectRoot, '.deskwork'), join(sandbox, '.deskwork'));

console.log('[Phase 4 Task 4.4] Dry-run lane migration...');
const dry = await migrateLaneMembership(sandbox, { dryRun: true });
console.log('  examined:', dry.entriesExamined);
console.log('  defaultLaneCreated (would):', dry.defaultLaneCreated);
console.log('  entriesLaneBackfilled (would):', dry.entriesLaneBackfilled);
console.log('  entriesArtifactKindBackfilled (would):', dry.entriesArtifactKindBackfilled);

console.log('\n[Phase 4 Task 4.4] Apply lane migration...');
const applied = await migrateLaneMembership(sandbox);
console.log('  examined:', applied.entriesExamined);
console.log('  defaultLaneCreated:', applied.defaultLaneCreated);
console.log('  entriesLaneBackfilled:', applied.entriesLaneBackfilled);
console.log('  entriesArtifactKindBackfilled:', applied.entriesArtifactKindBackfilled);

console.log('\n[Phase 4 Task 4.4] Verify idempotence — second apply is a no-op...');
const second = await migrateLaneMembership(sandbox);
const idempotent =
  second.defaultLaneCreated === false
  && second.entriesLaneBackfilled === 0
  && second.entriesArtifactKindBackfilled === 0;
console.log('  defaultLaneCreated:', second.defaultLaneCreated, '(expected false)');
console.log('  entriesLaneBackfilled:', second.entriesLaneBackfilled, '(expected 0)');
console.log('  entriesArtifactKindBackfilled:', second.entriesArtifactKindBackfilled, '(expected 0)');
console.log(idempotent ? '  PASS: idempotent.' : '  FAIL: not idempotent.');

await rm(sandbox, { recursive: true, force: true });
process.exit(idempotent ? 0 : 1);
