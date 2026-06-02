#!/usr/bin/env node
/**
 * AUDIT-20260530-05 — JSON watcher for the @deskwork/core dev script.
 *
 * `build` / `prepack` run `cp src/pipelines/*.json dist/pipelines/`,
 * but the bare `dev` script (`tsc -b --watch`) only recompiles `.ts`.
 * A preset JSON edit during `dev` never propagates to `dist/` without
 * a manual `npm run build` — surprise UX that bit the audit-barrage
 * walk.
 *
 * This script runs in parallel with `tsc -b --watch`. It:
 *
 *   1. Performs an initial `cp` of every `.json` under
 *      `src/pipelines/` to `dist/pipelines/` (so the watcher's first
 *      pass leaves the same state the build does).
 *   2. Watches `src/pipelines/` with `node:fs.watch`. On any rename
 *      or change event for a `.json` file, re-copies the file (or
 *      removes the dist counterpart if the source was deleted).
 *
 * Uses only the Node built-in `fs.watch` API — no new dependency.
 * The recursive watch flag isn't needed (the directory is flat); the
 * `persistent: true` flag keeps the process alive for the dev session.
 *
 * Quiet by default; logs each copy / unlink for the operator's
 * visibility. Errors print to stderr and exit non-zero (the dev
 * script's `&` chain will surface the failure).
 */

import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { watch } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SCRIPT_DIR, '..');
const SRC_DIR = join(PACKAGE_ROOT, 'src', 'pipelines');
const DIST_DIR = join(PACKAGE_ROOT, 'dist', 'pipelines');

function ensureDistDir() {
  if (!existsSync(DIST_DIR)) {
    mkdirSync(DIST_DIR, { recursive: true });
  }
}

function copyOne(filename) {
  const srcPath = join(SRC_DIR, filename);
  const distPath = join(DIST_DIR, filename);
  copyFileSync(srcPath, distPath);
  process.stdout.write(`[watch-pipelines] copied ${filename}\n`);
}

function removeOne(filename) {
  const distPath = join(DIST_DIR, filename);
  if (existsSync(distPath)) {
    unlinkSync(distPath);
    process.stdout.write(`[watch-pipelines] removed ${filename}\n`);
  }
}

function initialCopy() {
  ensureDistDir();
  if (!existsSync(SRC_DIR)) {
    process.stderr.write(`[watch-pipelines] src dir missing: ${SRC_DIR}\n`);
    process.exit(1);
  }
  for (const entry of readdirSync(SRC_DIR)) {
    if (!entry.endsWith('.json')) continue;
    const srcPath = join(SRC_DIR, entry);
    if (!statSync(srcPath).isFile()) continue;
    copyOne(entry);
  }
}

function startWatcher() {
  const watcher = watch(SRC_DIR, { persistent: true }, (eventType, filename) => {
    if (filename === null) return;
    if (!filename.endsWith('.json')) return;
    const srcPath = join(SRC_DIR, filename);
    if (existsSync(srcPath) && statSync(srcPath).isFile()) {
      try {
        copyOne(filename);
      } catch (err) {
        process.stderr.write(
          `[watch-pipelines] copy failed for ${filename}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    } else {
      // Source was removed; mirror the delete in dist/.
      try {
        removeOne(filename);
      } catch (err) {
        process.stderr.write(
          `[watch-pipelines] remove failed for ${filename}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    }
  });

  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    watcher.close();
    process.exit(0);
  });

  process.stdout.write(
    `[watch-pipelines] watching ${SRC_DIR}; mirroring *.json into ${DIST_DIR}\n`,
  );
}

initialCopy();
startWatcher();
