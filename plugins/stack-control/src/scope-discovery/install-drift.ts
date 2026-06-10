// plugins/stack-control/src/scope-discovery/install-drift.ts
//
// US8 (010 / FR-033 / R6): an ADVISORY drift check. When a project carries
// locally-sourced `.specify` extension copies (the deskwork-governance /
// spec-governance Spec Kit extensions this plugin ships), those copies can
// silently fall behind the plugin's source of truth across a marketplace
// update. This verb compares each installed extension copy to its plugin source
// file-by-file (content hash) and WARNS (never blocks) when they diverge — an
// in-sync copy is silent. Non-blocking by design: exit 0 always.
//
// It compares the PLUGIN-SOURCE file set (the canonical files under
// `<pluginRoot>/spec-kit/<name>/`) against the installed copies at
// `<projectRoot>/.specify/extensions/<name>/`. Files the installer generates on
// top of the source (e.g. `.specify-dev/...`) are not part of the source set and
// are not compared.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface ExtensionDrift {
  readonly extension: string;
  /** Source files whose installed copy differs from the plugin source. */
  readonly drifted: string[];
  /** Source files with no installed copy at all. */
  readonly missing: string[];
}

export interface InstallDriftReport {
  /** Extensions that have any drifted or missing file. */
  readonly drifted: ExtensionDrift[];
  /** Extensions compared and found fully in sync. */
  readonly inSync: string[];
}

/**
 * Compare every plugin-sourced extension (a dir under `<pluginRoot>/spec-kit/`)
 * that is also installed at `<projectRoot>/.specify/extensions/<name>/`, file by
 * file. Returns a structured report; the caller renders + warns.
 */
export function computeInstallDrift(opts: {
  readonly pluginRoot: string;
  readonly projectRoot: string;
}): InstallDriftReport {
  const specKitDir = join(opts.pluginRoot, 'spec-kit');
  const installedExtDir = join(opts.projectRoot, '.specify', 'extensions');
  const drifted: ExtensionDrift[] = [];
  const inSync: string[] = [];

  if (!existsSync(specKitDir)) return { drifted, inSync };

  for (const name of listDirs(specKitDir)) {
    const sourceDir = join(specKitDir, name);
    const installedDir = join(installedExtDir, name);
    if (!existsSync(installedDir)) continue; // not installed → not its concern

    const driftedFiles: string[] = [];
    const missingFiles: string[] = [];
    for (const rel of listFilesRecursive(sourceDir)) {
      const sourceFile = join(sourceDir, rel);
      const installedFile = join(installedDir, rel);
      if (!existsSync(installedFile)) {
        missingFiles.push(rel);
        continue;
      }
      if (hashFile(sourceFile) !== hashFile(installedFile)) driftedFiles.push(rel);
    }

    if (driftedFiles.length === 0 && missingFiles.length === 0) {
      inSync.push(name);
    } else {
      drifted.push({ extension: name, drifted: driftedFiles.sort(), missing: missingFiles.sort() });
    }
  }
  return { drifted, inSync };
}

/** Render the report to `write`. Returns true iff any drift was found. */
export function renderInstallDrift(report: InstallDriftReport, write: (s: string) => void): boolean {
  if (report.drifted.length === 0) {
    write(
      `install-drift: ${report.inSync.length} extension copy(ies) in sync with the plugin source.\n`,
    );
    return false;
  }
  for (const ext of report.drifted) {
    write(`install-drift: WARNING — extension '${ext.extension}' has drifted from the plugin source:\n`);
    for (const f of ext.drifted) write(`  changed: ${f}\n`);
    for (const f of ext.missing) write(`  missing in install: ${f}\n`);
  }
  write(
    'install-drift: advisory only (non-blocking). Re-run the plugin install to refresh the ' +
      'local extension copies.\n',
  );
  return true;
}

function hashFile(path: string): string {
  return createHash('sha1').update(readFileSync(path)).digest('hex');
}

function listDirs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (statSync(full).isFile()) out.push(relative(root, full));
    }
  };
  walk(root);
  return out;
}
