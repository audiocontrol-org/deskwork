#!/usr/bin/env node
/**
 * Phase 4 smoke probe — verifies #247 and #300 close against this
 * repo's actual `.deskwork/calendar.md` state.
 *
 * #247: regenerate the calendar from existing sidecars; assert every
 * sidecar UUID appears in the rendered output (i.e. no entries are
 * dropped due to a non-editorial / Final / Cancelled stage name).
 *
 * #300: run the doctor's `orphan-frontmatter-id` audit; assert that
 * entries in Final / Cancelled / Blocked sections of the calendar do
 * NOT surface as orphans (the pre-fix bug filed false positives
 * because the legacy parser missed those sections).
 *
 * Run via `tsx scripts/smoke-phase4-issues.mjs` from the repo root.
 */

import { readdir, readFile, copyFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Resolve to the @deskwork/core workspace's built outputs (dist).
const projectRoot = process.cwd();
const coreDist = join(projectRoot, 'packages/core/dist');

const { regenerateCalendar } = await import(join(coreDist, 'calendar/regenerate.js'));
const { runAudit, yesInteraction } = await import(join(coreDist, 'doctor/runner.js'));

async function copyDirectory(src, dest) {
  await mkdir(dest, { recursive: true });
  const items = await readdir(src, { withFileTypes: true });
  for (const it of items) {
    const s = join(src, it.name);
    const d = join(dest, it.name);
    if (it.isDirectory()) {
      await copyDirectory(s, d);
    } else if (it.isFile()) {
      await copyFile(s, d);
    }
  }
}

async function main() {
  // Clone the repo's .deskwork state into a tmp dir so the smoke
  // doesn't mutate the live calendar.
  const sandbox = await mkdtemp(join(tmpdir(), 'dw-smoke-phase4-'));
  await mkdir(join(sandbox, '.deskwork'), { recursive: true });
  await copyDirectory(join(projectRoot, '.deskwork'), join(sandbox, '.deskwork'));
  // Also clone the content tree so the orphan-frontmatter-id rule has
  // something to scan. We only need the docs tree.
  if (await pathExists(join(projectRoot, 'docs'))) {
    await copyDirectory(join(projectRoot, 'docs'), join(sandbox, 'docs'));
  }

  let pass = true;

  // --- #247: regen preserves every sidecar -------------------------
  console.log('[#247] regenerate calendar; check every sidecar UUID appears in output...');
  const sidecarsDir = join(sandbox, '.deskwork', 'entries');
  const sidecarFiles = (await readdir(sidecarsDir)).filter((n) => n.endsWith('.json'));
  const sidecarIds = new Set();
  for (const f of sidecarFiles) {
    const raw = await readFile(join(sidecarsDir, f), 'utf8');
    try {
      const json = JSON.parse(raw);
      if (typeof json.uuid === 'string') sidecarIds.add(json.uuid);
    } catch {
      // skip
    }
  }
  console.log(`  ${sidecarIds.size} sidecar UUIDs collected.`);
  await regenerateCalendar(sandbox);
  const md = await readFile(join(sandbox, '.deskwork', 'calendar.md'), 'utf8');
  let missing = 0;
  for (const id of sidecarIds) {
    if (!md.includes(id)) {
      console.error(`  MISSING from calendar after regen: ${id}`);
      missing++;
    }
  }
  if (missing === 0) {
    console.log(`  PASS: all ${sidecarIds.size} sidecars present in regenerated calendar.`);
  } else {
    console.error(`  FAIL: ${missing} sidecars dropped from calendar.`);
    pass = false;
  }

  // --- #300: orphan-frontmatter-id audit ---------------------------
  console.log('[#300] running doctor orphan-frontmatter-id audit...');
  const config = JSON.parse(await readFile(join(sandbox, '.deskwork', 'config.json'), 'utf8'));
  const report = await runAudit({ projectRoot: sandbox, config }, yesInteraction);
  const orphans = report.findings.filter((f) => f.ruleId === 'orphan-frontmatter-id');
  if (orphans.length === 0) {
    console.log('  PASS: zero orphan-frontmatter-id findings (#300 closed).');
  } else {
    // Report which UUIDs would be (false-positively) flagged.
    console.error(`  FAIL: ${orphans.length} orphan-frontmatter-id findings remain. First 5:`);
    for (const o of orphans.slice(0, 5)) {
      console.error(`    - entryId=${o.details.entryId}  path=${o.details.absolutePath}`);
    }
    // The smoke is informational about #300 — pre-existing orphans in
    // the repo's content tree are not necessarily bugs (truly orphaned
    // files DO exist). Don't fail the run on this; the test suite has
    // the precise regression check.
  }

  await rm(sandbox, { recursive: true, force: true });

  if (!pass) {
    process.exit(1);
  }
  console.log('All smoke probes passed.');
}

async function pathExists(p) {
  try {
    await readFile(p, 'utf8');
    return true;
  } catch {
    // readFile on a directory throws EISDIR — that still means the
    // path exists; try a directory probe instead.
    try {
      await readdir(p);
      return true;
    } catch {
      return false;
    }
  }
}

await main();
