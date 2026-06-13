import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { deriveGitToplevel } from '../scope-discovery/util/git-toplevel.js';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', '.runtime-cache']);

export function discoverCandidateDomains(startDir: string): readonly string[] {
  const gitRoot = deriveGitToplevel(startDir);
  if (gitRoot === null) return [];

  const out = new Set<string>();
  walk(gitRoot, out);
  return [...out].sort();
}

function walk(dir: string, out: Set<string>): void {
  if (existsSync(join(dir, '.stack-control', 'config.yaml'))) {
    out.add(realpathSync(dir));
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    walk(join(dir, entry.name), out);
  }
}
