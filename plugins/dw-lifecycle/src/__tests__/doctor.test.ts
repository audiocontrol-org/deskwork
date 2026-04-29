import { describe, it, expect } from 'vitest';
import { runDoctor } from '../subcommands/doctor.js';

describe('doctor', () => {
  it('returns no findings when peers and config are present', async () => {
    // Phase 2 doctor only checks peer plugins; mock detection returns true.
    const findings = await runDoctor({
      projectRoot: process.cwd(),
      detectPeerPlugin: () => true,
      checkConfig: () => true,
    });
    expect(findings).toEqual([]);
  });

  it('flags missing required peer plugin (superpowers)', async () => {
    const findings = await runDoctor({
      projectRoot: process.cwd(),
      detectPeerPlugin: (name) => name !== 'superpowers',
      checkConfig: () => true,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'peer-plugins', severity: 'error' })
    );
  });

  it('flags missing recommended peer plugin (feature-dev) as warning', async () => {
    const findings = await runDoctor({
      projectRoot: process.cwd(),
      detectPeerPlugin: (name) => name !== 'feature-dev',
      checkConfig: () => true,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'peer-plugins', severity: 'warning' })
    );
  });

  it('flags missing config', async () => {
    const findings = await runDoctor({
      projectRoot: process.cwd(),
      detectPeerPlugin: () => true,
      checkConfig: () => false,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ rule: 'missing-config', severity: 'error' })
    );
  });
});
