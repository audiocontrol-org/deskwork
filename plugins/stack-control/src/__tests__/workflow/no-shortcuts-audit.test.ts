// 025 US5 (T024) — the shortcut-affordance audit. RED first.
//
// contracts/speckit-wrapper.md + FR-015/SC-005: a doctor-style phrase scan over the
// plugin's shipped prompt surfaces (skills/*/SKILL.md AND commands/*.md, per codex-02)
// flags an agent-OFFERED skip/defer/shortcut, and passes on a clean tree. It must NOT
// flag prose that DESCRIBES the no-shortcuts rule ("does not offer to skip/defer") —
// only an actual offer (a question / "want me to …" presented to the operator).

import { describe, expect, it } from 'vitest';
import { scanShortcutAffordances } from '../../subcommands/no-shortcuts-audit.js';

describe('shortcut-affordance audit (FR-015/SC-005)', () => {
  it('flags an agent-offered defer/skip', () => {
    const offers = [
      'Want me to defer this step?',
      'Should I skip the governance step?',
      'Defer governance for now and wrap the session?',
      'Would you like me to shortcut this and proceed?',
    ];
    for (const body of offers) {
      const findings = scanShortcutAffordances(body, 'skills/x/SKILL.md');
      expect(findings.length).toBeGreaterThan(0);
    }
  });

  it('does NOT flag prose that PROHIBITS shortcuts (no false positive)', () => {
    const clean = [
      'There is no skip/defer/shortcut branch anywhere in this loop (US5).',
      'It does not offer to skip/defer it; a heavy step is done, not deferred.',
      'No skip/defer affordance. Operator-facing branches are scope decisions only.',
      'Run the step. Do not present a "defer this step?" option — that IS the offroad.',
    ];
    for (const body of clean) {
      expect(scanShortcutAffordances(body, 'skills/x/SKILL.md')).toEqual([]);
    }
  });

  it('reports the file + line of a flagged offer', () => {
    const body = ['# Skill', '', 'Do the work.', 'Want me to skip this step?', ''].join('\n');
    const findings = scanShortcutAffordances(body, 'skills/x/SKILL.md');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('skills/x/SKILL.md');
    expect(findings[0]!.line).toBe(4);
  });
});
