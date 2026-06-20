// US1 full-surface help-probe (028 T036; FR-001/002/003; SC-001 — the 100% bar).
//
// Enumerate the LIVE verb set (parsed from `stackctl --help`) and assert EVERY
// verb AND every sub-action emits `--help` at exit 0 with a usage body, driven
// end-to-end through the real cli.ts dispatcher (probeHelp spawns the CLI). This
// is the SC-001 gate: 100% of the command surface is self-documenting.

import { describe, expect, it } from 'vitest';
import { buildCommandSurface } from '../../cli-help/command-surface.js';
import { isHelpConformant, liveVerbs, probeHelp } from './command-surface-harness.js';

describe('SC-001 — every live verb + sub-action emits conformant --help (T036)', () => {
  it('mounts a descriptor for every live verb (no gap vs stackctl --help)', () => {
    const mounted = new Set(buildCommandSurface().map((d) => d.verb));
    const missing = liveVerbs().filter((v) => !mounted.has(v));
    expect(missing, `verbs with no command-surface descriptor: ${missing.join(', ')}`).toEqual([]);
  });

  it('every verb emits --help exit 0 with a usage body', () => {
    for (const verb of liveVerbs()) {
      const probe = probeHelp(verb);
      expect(isHelpConformant(probe), `${verb} --help (exit ${probe.status})`).toBe(true);
    }
  });

  it('every sub-action emits --help exit 0 with a usage body', () => {
    for (const descriptor of buildCommandSurface()) {
      for (const sub of descriptor.subActions) {
        const probe = probeHelp(descriptor.verb, sub.name);
        expect(isHelpConformant(probe), `${descriptor.verb} ${sub.name} --help (exit ${probe.status})`).toBe(true);
      }
    }
  });
});
