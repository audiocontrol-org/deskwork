// 026 T011 — RED tests for the `mediate-check` decision verb (contracts/cli-verbs.md):
// exit 0 permit / 1 refuse / 2 usage; strict flag parse; registry-sourced redirect on
// stderr; `--json` shape. The active-capabilities resolver is injected so the verb logic
// is exercised hermetically (no disk / installation).

import { describe, expect, it } from 'vitest';
import { mediateCheck } from '../../subcommands/mediate-check.js';

const noMarker = (): ReadonlySet<string> => new Set<string>();

describe('mediate-check verb (026 T011)', () => {
  it('permits a non-backend identity → exit 0', () => {
    const r = mediateCheck(['--surface', 'bash', '--identity', 'ls -la', '--session', 's'], {
      resolveActive: noMarker,
    });
    expect(r.code).toBe(0);
  });

  it('refuses a raw MUTATING backend → exit 1 with the redirect on stderr', () => {
    // `backlog capture` is mutating — mediation gates it. (`backlog list` is read-only and
    // FR-050-exempt; its no-marker permit is covered by read-only-exemption-live.test.ts.)
    const r = mediateCheck(['--surface', 'bash', '--identity', 'backlog capture --type bug', '--session', 's'], {
      resolveActive: noMarker,
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('/stack-control:backlog');
  });

  it('permits a backend WITH an active marker → exit 0', () => {
    const r = mediateCheck(['--surface', 'bash', '--identity', 'backlog list', '--session', 's'], {
      resolveActive: () => new Set(['backlog']),
    });
    expect(r.code).toBe(0);
  });

  it('skill surface: refuses raw speckit-implement → exit 1 names execute', () => {
    const r = mediateCheck(['--surface', 'skill', '--identity', 'speckit-implement', '--session', 's'], {
      resolveActive: noMarker,
    });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('/stack-control:execute');
  });

  it('--json emits the decision shape on stdout', () => {
    const r = mediateCheck(
      ['--surface', 'bash', '--identity', 'backlog capture --type bug', '--session', 's', '--json'],
      { resolveActive: noMarker },
    );
    expect(r.code).toBe(1);
    const decision = JSON.parse(r.stdout);
    expect(decision).toMatchObject({ verdict: 'refuse', capability: 'backlog' });
    expect(typeof decision.reason).toBe('string');
  });

  it('rejects an unknown flag → exit 2 (no silent ignore)', () => {
    expect(
      mediateCheck(['--surface', 'bash', '--identity', 'x', '--session', 's', '--bogus'], {
        resolveActive: noMarker,
      }).code,
    ).toBe(2);
  });

  it('rejects a missing required flag → exit 2', () => {
    expect(mediateCheck(['--surface', 'bash', '--identity', 'x'], { resolveActive: noMarker }).code).toBe(2);
  });

  it('rejects an invalid --surface value → exit 2', () => {
    expect(
      mediateCheck(['--surface', 'toolx', '--identity', 'x', '--session', 's'], {
        resolveActive: noMarker,
      }).code,
    ).toBe(2);
  });

  it('passes the resolved --at + session to the resolver', () => {
    let seenAt = '';
    let seenSession = '';
    mediateCheck(['--surface', 'bash', '--identity', 'backlog', '--session', 'sX', '--at', '/tmp/inst'], {
      resolveActive: (at, session) => {
        seenAt = at;
        seenSession = session;
        return new Set();
      },
    });
    expect(seenAt).toBe('/tmp/inst');
    expect(seenSession).toBe('sX');
  });
});
