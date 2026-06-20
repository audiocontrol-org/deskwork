// Phase 2 Foundational (028 US1, T010/T011; FR-001/002). The generic help
// renderer turns ANY CommandDescriptor into a usage body — so every verb's
// `--help` renders from the single descriptor source rather than a per-verb
// hand-written string.

import { describe, expect, it } from 'vitest';
import { buildCommandSurface } from '../../cli-help/command-surface.js';
import { renderSubActionHelp, renderVerbHelp } from '../../cli-help/render-help.js';

function roadmap() {
  const d = buildCommandSurface().find((x) => x.verb === 'roadmap');
  if (!d) throw new Error('test setup: roadmap descriptor missing');
  return d;
}

describe('renderVerbHelp (T010/T011 — generic verb help from a descriptor)', () => {
  it('renders a usage line, the description, and the sub-action list for a multi-action verb', () => {
    const out = renderVerbHelp(roadmap());
    expect(out).toMatch(/^Usage: stackctl roadmap/m);
    expect(out).toContain(roadmap().description);
    expect(out.toLowerCase()).toContain('subaction');
    for (const sub of roadmap().subActions) {
      expect(out, `lists ${sub.name}`).toContain(sub.name);
    }
    expect(out.trim().length).toBeGreaterThan(0);
  });
});

describe('renderSubActionHelp (T010/T011 — generic sub-action help from a descriptor)', () => {
  it('renders the sub-action usage line, description, and its flags', () => {
    const out = renderSubActionHelp(roadmap(), 'add');
    expect(out).toMatch(/^Usage: stackctl roadmap add/m);
    expect(out).toContain('--status');
    expect(out).toContain('--doc');
    expect(out.trim().length).toBeGreaterThan(0);
  });

  it('throws for an unknown sub-action (fail loud, no empty body)', () => {
    expect(() => renderSubActionHelp(roadmap(), 'does-not-exist')).toThrow(/does-not-exist/);
  });
});
