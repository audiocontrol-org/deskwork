// 028 T052/T053 — capability-id coverage: every capability in CAPABILITY_REGISTRY
// names a front-door skill whose `skills/<name>/SKILL.md` exists, and that skill's
// frontmatter `name:` matches the interface id. Skills declare their capability
// linkage through the registry `interface` field (`stack-control:<name>` →
// `skills/<name>/SKILL.md`), NOT a separate frontmatter capability id; this test
// pins that mapping so a registry entry can never name a missing/renamed skill
// (and vice-versa) without a RED test.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAPABILITY_REGISTRY } from '../../capability/registry.js';

const PLUGIN_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const SKILLS_DIR = join(PLUGIN_ROOT, 'skills');

const INTERFACE_PREFIX = 'stack-control:';

/** The skill directory name an interface id maps to (`stack-control:backlog` → `backlog`). */
function skillNameFromInterface(iface: string): string {
  if (!iface.startsWith(INTERFACE_PREFIX)) {
    throw new Error(`interface '${iface}' does not use the '${INTERFACE_PREFIX}' namespace`);
  }
  return iface.slice(INTERFACE_PREFIX.length);
}

/** Read the YAML frontmatter `name:` field from a SKILL.md (the skill's declared id). */
function frontmatterName(skillMdPath: string): string | undefined {
  const src = readFileSync(skillMdPath, 'utf8');
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (match === null) return undefined;
  const nameLine = match[1].split(/\r?\n/).find((line) => /^name:\s*/.test(line));
  if (nameLine === undefined) return undefined;
  return nameLine.replace(/^name:\s*/, '').trim().replace(/^["']|["']$/g, '');
}

describe('capability-id coverage — every capability fronts a real skill (028 T052/T053)', () => {
  it('every capability interface names a skill whose SKILL.md exists', () => {
    for (const cap of CAPABILITY_REGISTRY.capabilities) {
      for (const iface of cap.interface) {
        const name = skillNameFromInterface(iface);
        const skillMd = join(SKILLS_DIR, name, 'SKILL.md');
        expect(existsSync(skillMd), `capability '${cap.id}' interface '${iface}' → ${skillMd} missing`).toBe(true);
      }
    }
  });

  it('each fronted skill\'s frontmatter name matches its interface id', () => {
    for (const cap of CAPABILITY_REGISTRY.capabilities) {
      for (const iface of cap.interface) {
        const name = skillNameFromInterface(iface);
        const skillMd = join(SKILLS_DIR, name, 'SKILL.md');
        if (!existsSync(skillMd)) continue; // covered by the existence assertion above
        const declared = frontmatterName(skillMd);
        expect(declared, `${skillMd} has no frontmatter name:`).toBe(name);
      }
    }
  });

  it('every capability declares at least one interface', () => {
    for (const cap of CAPABILITY_REGISTRY.capabilities) {
      expect(cap.interface.length, `capability '${cap.id}' has no interface`).toBeGreaterThan(0);
    }
  });
});
