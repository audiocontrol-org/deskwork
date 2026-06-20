// US1 help-probe — inbox family (028 T016; FR-001/002; SC-001).

import { describe, expect, it } from 'vitest';
import { buildCommandSurface } from '../../cli-help/command-surface.js';
import { isHelpConformant, probeHelp } from './command-surface-harness.js';

function inbox() {
  const d = buildCommandSurface().find((x) => x.verb === 'inbox');
  if (!d) throw new Error('test setup: inbox descriptor missing');
  return d;
}

describe('inbox --help (T016)', () => {
  it('the verb itself emits conformant help', () => {
    expect(isHelpConformant(probeHelp('inbox'))).toBe(true);
  });

  it('every sub-action emits conformant help (exit 0 + usage body)', () => {
    for (const sub of inbox().subActions) {
      const probe = probeHelp('inbox', sub.name);
      expect(isHelpConformant(probe), `inbox ${sub.name} --help (exit ${probe.status})`).toBe(true);
    }
  });
});
