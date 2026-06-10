// `stackctl version` — prints the plugin's lockstep version (T011).
//
// Reads .claude-plugin/plugin.json#version. Fails loud (Principle V) if the
// manifest is unreadable or the version field is absent — never prints a
// fabricated or fallback version.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_JSON = resolve(here, '..', '..', '.claude-plugin', 'plugin.json');

export function readPluginVersion(): string {
  const parsed: unknown = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new Error(`stackctl version: FATAL — ${PLUGIN_JSON} missing a 'version' field`);
  }
  const version: unknown = parsed.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`stackctl version: FATAL — ${PLUGIN_JSON}#version is not a non-empty string`);
  }
  return version;
}

export async function runVersion(_args: string[]): Promise<void> {
  process.stdout.write(`${readPluginVersion()}\n`);
}
