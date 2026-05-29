/**
 * plugins/dw-lifecycle/src/__tests__/scope-discovery/adopter-manifests.gate-mode.test.ts
 *
 * Phase 6 acceptance criterion: `--gate-mode` flag on check-* commands
 * exits non-zero on violations. This file asserts the flag delta for
 * check-adopters:
 *
 *   (a) Without --gate-mode (default informational mode): holdouts
 *       present → process exits 0 + the report still prints on stdout.
 *   (b) With --gate-mode: holdouts present → process exits 1.
 */

import { describe, it, expect } from 'vitest';
import {
  args,
  argsInformational,
  cleanup,
  makeFixture,
  runScanner,
  SOURCE_PAYLOADS,
  writeRegistry,
  writeSource,
} from './adopter-manifests.fixtures.js';

const REGISTRY_YAML = `adopter_manifests:
  - id: slide-drawer-adopters
    introduced_in: cafef00d
    primitive: SlideDrawer
    from: '@/components/SlideDrawer'
    expected_adopters_glob:
      - 'modules/**/SlideDrawer-using/*.tsx'
    message: |
      Files matching this glob must import SlideDrawer.
`;

async function planFixture(label: string) {
  const fixture = await makeFixture(label);
  await writeRegistry(fixture, REGISTRY_YAML);
  await writeSource(
    fixture,
    'modules/m1/SlideDrawer-using/holdout.tsx',
    SOURCE_PAYLOADS.HOLDOUT,
  );
  return fixture;
}

describe('check-adopters — --gate-mode flag', () => {
  it('without --gate-mode: holdouts present, exits 0, full report on stdout', async () => {
    const fixture = await planFixture('informational');
    try {
      const run = await runScanner(argsInformational(fixture));
      expect(
        run.code,
        `informational default should exit 0 on holdouts; stdout=${run.stdout}; stderr=${run.stderr}`,
      ).toBe(0);
      expect(run.stdout).toContain('slide-drawer-adopters');
    } finally {
      await cleanup(fixture);
    }
  });

  it('with --gate-mode: holdouts present, exits 1, full report on stdout', async () => {
    const fixture = await planFixture('gated');
    try {
      // args() includes --gate-mode by default.
      const run = await runScanner(args(fixture));
      expect(run.code, `stdout=${run.stdout}; stderr=${run.stderr}`).toBe(1);
      expect(run.stdout).toContain('slide-drawer-adopters');
    } finally {
      await cleanup(fixture);
    }
  });
});
