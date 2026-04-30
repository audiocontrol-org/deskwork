#!/usr/bin/env tsx
/**
 * bump-version — atomically update every version-bearing manifest in
 * the deskwork monorepo to a single target version.
 *
 * Usage:
 *   npm run version:bump <semver>
 *   tsx scripts/bump-version.ts <semver>
 *
 * Files updated (relative to repo root):
 *   - package.json
 *   - packages/{core,cli,studio}/package.json
 *   - plugins/{deskwork,deskwork-studio,dw-lifecycle}/package.json
 *   - plugins/{deskwork,deskwork-studio,dw-lifecycle}/.claude-plugin/plugin.json
 *   - .claude-plugin/marketplace.json (top-level metadata.version + each
 *     plugin entry's version)
 *
 * Intentionally manual: writes the files, you review the diff, then
 * commit + tag yourself. No "auto-publish on every merge" semantics.
 *
 * Excludes:
 *   - .audiocontrol.org/package.json — that's the gitignored sandbox
 *     clone; not part of the deskwork release surface.
 *   - node_modules/, dist/, bundle/ — build outputs, no version field.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface VersionedManifest {
  /** Path relative to repo root. */
  readonly path: string;
  /** A short label for the report. */
  readonly label: string;
  /**
   * For marketplace.json, we update top-level `metadata.version` AND
   * each plugin entry's `version`. For lockstep-package-json, we
   * update `version` AND any `dependencies['@deskwork/*']` entries —
   * applies both to plugin shells (whose bin shim first-run-installs
   * @deskwork/<pkg>@<version>) AND to inter-package deps within
   * `packages/` (e.g. @deskwork/cli depends on @deskwork/core; both
   * must move together to avoid the wildcard-resolution failure mode
   * documented in #101). For everything else, just `version`.
   */
  readonly kind: 'package-json' | 'lockstep-package-json' | 'plugin-json' | 'marketplace-json';
}

const MANIFESTS: readonly VersionedManifest[] = [
  { path: 'package.json', label: 'root package.json', kind: 'package-json' },
  { path: 'packages/core/package.json', label: '@deskwork/core', kind: 'package-json' },
  { path: 'packages/cli/package.json', label: '@deskwork/cli', kind: 'lockstep-package-json' },
  { path: 'packages/studio/package.json', label: '@deskwork/studio', kind: 'lockstep-package-json' },
  { path: 'plugins/deskwork/package.json', label: 'deskwork plugin shell', kind: 'lockstep-package-json' },
  { path: 'plugins/deskwork-studio/package.json', label: 'deskwork-studio plugin shell', kind: 'lockstep-package-json' },
  { path: 'plugins/dw-lifecycle/package.json', label: 'dw-lifecycle plugin shell', kind: 'package-json' },
  { path: 'plugins/deskwork/.claude-plugin/plugin.json', label: 'deskwork plugin.json', kind: 'plugin-json' },
  { path: 'plugins/deskwork-studio/.claude-plugin/plugin.json', label: 'deskwork-studio plugin.json', kind: 'plugin-json' },
  { path: 'plugins/dw-lifecycle/.claude-plugin/plugin.json', label: 'dw-lifecycle plugin.json', kind: 'plugin-json' },
  { path: '.claude-plugin/marketplace.json', label: 'marketplace manifest', kind: 'marketplace-json' },
];

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

function fail(message: string): never {
  process.stderr.write(`bump-version: ${message}\n`);
  process.exit(1);
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function writeJson(path: string, value: Record<string, unknown>): Promise<void> {
  // Two-space indent + trailing newline matches the convention of the
  // files we're editing (npm-init style).
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, text, 'utf-8');
}

async function bumpFile(manifest: VersionedManifest, version: string): Promise<string> {
  const abs = join(REPO_ROOT, manifest.path);
  const data = await readJson(abs);

  switch (manifest.kind) {
    case 'package-json':
    case 'plugin-json': {
      const before = data.version;
      data.version = version;
      await writeJson(abs, data);
      return `  ${manifest.label.padEnd(36)} ${String(before)} -> ${version}`;
    }
    case 'lockstep-package-json': {
      const before = data.version;
      data.version = version;
      const lines: string[] = [
        `  ${manifest.label.padEnd(36)} ${String(before)} -> ${version}`,
      ];
      // Lockstep packages pin @deskwork/* deps at the same version
      // they themselves declare. Two cases share the same shape:
      //   1. Plugin shells (bin-shim first-run-installs @deskwork/<pkg>@<v>).
      //   2. Inter-package deps in packages/* (e.g. @deskwork/cli ->
      //      @deskwork/core). Wildcards here let npm resolve to a
      //      stale on-disk version, breaking the lockstep contract
      //      (issue #101). Pin every dep whose name starts with
      //      "@deskwork/" to the same version.
      const deps = data.dependencies as Record<string, unknown> | undefined;
      if (deps && typeof deps === 'object') {
        for (const [name, before] of Object.entries(deps)) {
          if (!name.startsWith('@deskwork/')) continue;
          deps[name] = version;
          lines.push(
            `  ${manifest.label} dep ${name.padEnd(20)} ${String(before)} -> ${version}`,
          );
        }
      }
      await writeJson(abs, data);
      return lines.join('\n');
    }
    case 'marketplace-json': {
      const metadata = data.metadata as Record<string, unknown> | undefined;
      const beforeMeta = metadata?.version;
      if (!metadata || typeof metadata !== 'object') {
        fail(`marketplace.json missing 'metadata' object`);
      }
      metadata.version = version;
      const plugins = data.plugins as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(plugins)) {
        fail(`marketplace.json missing 'plugins' array`);
      }
      const lines: string[] = [
        `  ${manifest.label} (metadata) ${String(beforeMeta)} -> ${version}`,
      ];
      // Phase 26e (v0.9.5+): source.ref is no longer pinned per release.
      // The vendor materialization that motivated the pin is gone — plugin
      // shells now first-run-install @deskwork/<pkg>@<plugin-manifest-
      // version> from npm, so the version coupling lives in the plugin
      // shell's plugin.json, not in marketplace.json's git-subdir ref.
      // git-subdir sources omit `ref` and resolve to the repository's
      // default branch.
      for (const entry of plugins) {
        const before = entry.version;
        entry.version = version;
        const name = typeof entry.name === 'string' ? entry.name : '?';
        lines.push(
          `  marketplace plugin ${name.padEnd(20)} ${String(before)} -> ${version}`,
        );
      }
      await writeJson(abs, data);
      return lines.join('\n');
    }
  }
}

async function main(): Promise<void> {
  const [, , versionArg] = process.argv;
  if (!versionArg) {
    fail('usage: tsx scripts/bump-version.mjs <semver>');
  }
  if (!SEMVER_RE.test(versionArg)) {
    fail(`"${versionArg}" is not a valid semver (expected MAJOR.MINOR.PATCH[-prerelease][+build])`);
  }

  const reports: string[] = [];
  for (const m of MANIFESTS) {
    reports.push(await bumpFile(m, versionArg));
  }

  process.stdout.write(`bumped to ${versionArg}:\n`);
  for (const line of reports) {
    process.stdout.write(`${line}\n`);
  }
  process.stdout.write(
    '\nReview the diff, then commit + tag:\n' +
      '  git diff\n' +
      `  git commit -am "chore: release v${versionArg}"\n` +
      `  git tag v${versionArg}\n` +
      `  git push && git push --tags\n`,
  );
}

main().catch((err: unknown) => {
  const reason = err instanceof Error ? err.message : String(err);
  process.stderr.write(`bump-version: ${reason}\n`);
  process.exit(1);
});
