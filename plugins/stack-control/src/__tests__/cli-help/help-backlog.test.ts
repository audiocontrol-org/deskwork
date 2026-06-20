// US1 help-probe — backlog family (028 T014; FR-001/002; SC-001).
// `backlog --help` and every sub-action `--help` exit 0 with a usage body.

import { describe, expect, it } from 'vitest';
import { buildCommandSurface } from '../../cli-help/command-surface.js';
import { isHelpConformant, probeHelp } from './command-surface-harness.js';

function backlog() {
  const d = buildCommandSurface().find((x) => x.verb === 'backlog');
  if (!d) throw new Error('test setup: backlog descriptor missing');
  return d;
}

describe('backlog --help (T014)', () => {
  it('the verb itself emits conformant help', () => {
    expect(isHelpConformant(probeHelp('backlog'))).toBe(true);
  });

  it('every sub-action emits conformant help (exit 0 + usage body)', () => {
    for (const sub of backlog().subActions) {
      const probe = probeHelp('backlog', sub.name);
      expect(isHelpConformant(probe), `backlog ${sub.name} --help (exit ${probe.status})`).toBe(true);
    }
  });
});
