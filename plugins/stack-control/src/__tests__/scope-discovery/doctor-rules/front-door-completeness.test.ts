// 028 US4 T110 — the front-door-completeness doctor rule wraps check-front-door and
// reports each gap as a finding (FR-032). On a clean surface it returns no findings;
// when check-front-door reports gaps it lifts each into a ScopeDoctorFinding.

import { describe, expect, it } from 'vitest';
import { check, runFrontDoorCompleteness } from '../../../scope-discovery/doctor-rules/front-door-completeness.js';
import { SCOPE_DISCOVERY_DOCTOR_RULES } from '../../../scope-discovery/doctor-rules/index.js';

describe('front-door-completeness doctor rule (028 T110/T111; FR-032)', () => {
  it('is registered in the doctor-rules index', () => {
    expect(SCOPE_DISCOVERY_DOCTOR_RULES).toContain(check);
  });

  it('returns no findings when check-front-door reports a clean surface', async () => {
    const findings = await runFrontDoorCompleteness({
      repoRoot: '/unused',
      runCheck: () => ({ ok: true, gaps: [], checked: 42 }),
    });
    expect(findings).toEqual([]);
  });

  it('lifts each check-front-door gap into a finding', async () => {
    const findings = await runFrontDoorCompleteness({
      repoRoot: '/unused',
      runCheck: () => ({
        ok: false,
        gaps: [
          "C2a skill-exists: operation 'demo/x' requires skill 'demo' but skills/demo/SKILL.md is missing.",
          "C2b working-help: operation 'demo/y' --help does not exit 0 with a usage body.",
        ],
        checked: 42,
      }),
    });
    expect(findings.length).toBe(2);
    for (const f of findings) {
      expect(f.rule).toBe('front-door-completeness');
      expect(f.severity).toBe('error');
    }
    expect(findings.map((f) => f.message).join('\n')).toMatch(/demo\/x/);
    expect(findings.map((f) => f.message).join('\n')).toMatch(/demo\/y/);
  });

  it('the live check (no injected runner) returns an array of findings', async () => {
    const findings = await check({ repoRoot: process.cwd() });
    expect(Array.isArray(findings)).toBe(true);
  });
});
