import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = resolve(here, '..', '..');

export function readPluginFile(rel: string): string {
  return readFileSync(join(PLUGIN_ROOT, rel), 'utf8');
}

export function expectThinAdapterSkill(
  rel: string,
  requiredPhrases: readonly (string | RegExp)[],
): void {
  const body = readPluginFile(rel);
  expect(body).toMatch(/does not reimplement|thin adapter|CLI-first/i);
  for (const phrase of requiredPhrases) {
    if (typeof phrase === 'string') {
      expect(body).toContain(phrase);
    } else {
      expect(body).toMatch(phrase);
    }
  }
}
