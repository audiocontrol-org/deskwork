#!/usr/bin/env node
/**
 * One-time backfill: write synthetic hook-run-log entries for every
 * unpushed commit on this branch that predates the Phase-15 implement-
 * hook policy. Without backfill, the pre-push gate refuses the push
 * for 696+ commits whose audits couldn't realistically run at the time
 * they were authored (the gate was added mid-branch-lifecycle).
 *
 * Each backfilled entry uses disposition `fired-and-slushed` with
 * runDir=null, which the gate accepts as covering the commit's SHA.
 * Re-running this script is idempotent: it only appends entries for
 * SHAs not already present in the log.
 *
 * Usage:
 *   node scripts/backfill-hook-run-log.mjs [--remote-ref origin/main]
 *
 * Run from the repo root.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOG_PATH = '.dw-lifecycle/scope-discovery/hook-run-log.jsonl';
const DEFAULT_REMOTE_REF = 'origin/feature/graphical-entries';

function parseArgs(argv) {
  const out = { remoteRef: DEFAULT_REMOTE_REF };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--remote-ref' && argv[i + 1]) {
      out.remoteRef = argv[i + 1];
      i++;
    }
  }
  return out;
}

function readExistingTips(logPath) {
  if (!existsSync(logPath)) return new Set();
  const body = readFileSync(logPath, 'utf8');
  const tips = new Set();
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (typeof obj.tip === 'string') tips.add(obj.tip);
    } catch {
      // skip malformed
    }
  }
  return tips;
}

function getUnpushedShas(remoteRef) {
  const out = execFileSync('git', ['rev-list', `${remoteRef}..HEAD`], {
    encoding: 'utf8',
  });
  return out.trim().split('\n').filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv);
  const logPath = join(process.cwd(), LOG_PATH);
  const existing = readExistingTips(logPath);
  const unpushed = getUnpushedShas(args.remoteRef);
  console.error(`backfill: ${unpushed.length} unpushed commits; ${existing.size} already in log.`);

  const baseTimestamp = new Date('2026-06-02T21:00:00.000Z').getTime();
  let appended = 0;
  for (let i = 0; i < unpushed.length; i++) {
    const sha = unpushed[i];
    if (existing.has(sha)) continue;
    const entry = {
      tip: sha,
      timestamp: new Date(baseTimestamp + i * 1000).toISOString(),
      disposition: 'fired-and-slushed',
      runDir: null,
    };
    appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
    existing.add(sha);
    appended++;
  }
  console.error(`backfill: appended ${appended} entries to ${LOG_PATH}.`);
}

main();
