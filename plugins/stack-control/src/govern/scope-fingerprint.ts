// Content-addressed fingerprint of a governed scope (a set of installation-relative
// paths). A SHA-256 over the canonicalized path set + each path's bytes — used by the
// whole-feature convergence record to detect when governed work has changed since it was
// last audited. Extracted from the retired per-phase `checkpoint-state.ts` (030 T085); the
// fingerprint itself is store-agnostic and survives the clean break.

import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export function computeScopeFingerprint(
  installationRoot: string,
  paths: readonly string[],
): string {
  const canonical = canonicalizeScopePaths(paths);
  if (canonical.length === 0) {
    // An empty scope hashes to the stable SHA-256 of nothing — a record bound to it can
    // never go stale against implementation edits, silently bypassing the freshness
    // contract (AUDIT-BARRAGE-codex-01). Reject it loudly instead.
    throw new Error(
      'governed scope requires at least one path; ' +
        'an empty scope cannot produce a meaningful fingerprint',
    );
  }
  const digest = createHash('sha256');
  for (const rel of canonical) {
    digestScopedPath(digest, installationRoot, rel);
  }
  return digest.digest('hex');
}

function canonicalizeScopePaths(paths: readonly string[]): readonly string[] {
  const normalized = Array.from(
    new Set(
      paths
        .map((path) => path.split('\\').join('/').replace(/\/+$/, ''))
        .filter((path) => path.length > 0),
    ),
  ).sort();
  const canonical: string[] = [];
  for (const path of normalized) {
    if (canonical.some((kept) => path === kept || path.startsWith(`${kept}/`))) {
      continue;
    }
    canonical.push(path);
  }
  return canonical;
}

function digestScopedPath(
  digest: ReturnType<typeof createHash>,
  installationRoot: string,
  rel: string,
): void {
  const canonicalRel = rel.split('\\').join('/');
  const abs = resolveScopedPath(installationRoot, canonicalRel);
  digest.update('\0');
  digest.update(canonicalRel);
  if (!existsSync(abs)) {
    digest.update('\0MISSING\0');
    return;
  }
  const stat = lstatSync(abs);
  if (stat.isSymbolicLink()) {
    throw new Error(
      `governed path must not be a symlink: ${canonicalRel} -> ${readlinkSync(abs)}`,
    );
  }
  if (stat.isDirectory()) {
    digest.update('\0DIR\0');
    for (const child of readdirSync(abs).sort()) {
      digestScopedPath(digest, installationRoot, join(canonicalRel, child));
    }
    return;
  }
  digest.update('\0');
  digest.update(readFileSync(abs));
}

function resolveScopedPath(installationRoot: string, rel: string): string {
  if (rel.length === 0) {
    throw new Error('governed path must be non-empty');
  }
  if (rel === '.' || rel === '..') {
    throw new Error(`governed path must not be '.' or '..': ${rel}`);
  }
  const components = rel.split(/[\\/]+/);
  if (components.some((component) => component === '.' || component === '..')) {
    throw new Error(`governed path must not contain dot segments: ${rel}`);
  }
  const abs = resolve(installationRoot, rel);
  const relToRoot = relative(installationRoot, abs).split('\\').join('/');
  if (relToRoot === '..' || relToRoot.startsWith('../')) {
    throw new Error(`governed path escapes the installation root: ${rel}`);
  }
  const rootReal = realpathSync(installationRoot);
  const currentSegments: string[] = [];
  for (const component of components) {
    currentSegments.push(component);
    const candidate = resolve(installationRoot, currentSegments.join('/'));
    if (!existsSync(candidate)) {
      continue;
    }
    const stat = lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `governed path must not be a symlink: ${currentSegments.join('/')}` +
          ` -> ${readlinkSync(candidate)}`,
      );
    }
    const candidateReal = realpathSync(candidate);
    const relToRealRoot = relative(rootReal, candidateReal).split('\\').join('/');
    if (relToRealRoot === '..' || relToRealRoot.startsWith('../')) {
      throw new Error(`governed path escapes the installation root: ${rel}`);
    }
  }
  return abs;
}
