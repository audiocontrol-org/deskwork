// Phase 2 Foundational (028 US1/US4, T004/T006/T008/T010; FR-003/050/001/002).
//
// buildCommandSurface() walks the live commander tree and projects each mounted
// verb into a CommandDescriptor. At this phase only `roadmap` is mounted (the
// 027 migration); Phase 3 mounts the remaining families and they appear here for
// free. These tests pin the projection contract against the single-sourced
// roadmap grammar (SUBACTION_SPECS) so the descriptor cannot drift from what the
// parser actually accepts.

import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import {
  assertSurfaceComplete,
  buildCommandSurface,
  buildSurfaceFrom,
  type CommandDescriptor,
} from '../../cli-help/command-surface.js';
import { flagNamesFor } from '../../cli-help/roadmap-help.js';
import { SUBACTION_SPECS } from '../../subcommands/roadmap.js';

describe('buildCommandSurface (T004 — commander-tree walk → CommandDescriptor[])', () => {
  it('returns one descriptor per mounted verb, including the mounted `roadmap`', () => {
    const surface = buildCommandSurface();
    const verbs = surface.map((d) => d.verb);
    expect(verbs).toContain('roadmap');
  });

  it('projects roadmap sub-actions 1:1 with SUBACTION_SPECS (no missing, no extra)', () => {
    const roadmap = buildCommandSurface().find((d) => d.verb === 'roadmap');
    expect(roadmap).toBeDefined();
    const subNames = roadmap!.subActions.map((s) => s.name).sort();
    expect(subNames).toEqual(Object.keys(SUBACTION_SPECS).sort());
  });

  it('derives each sub-action flag set from the grammar (matches flagNamesFor)', () => {
    const roadmap = buildCommandSurface().find((d) => d.verb === 'roadmap');
    expect(roadmap).toBeDefined();
    for (const sub of roadmap!.subActions) {
      const grammar = SUBACTION_SPECS[sub.name];
      expect(grammar, `grammar for ${sub.name}`).toBeDefined();
      const expected = [...flagNamesFor(grammar!)].sort();
      const actual = sub.flags.map((f) => `--${f.name}`).sort();
      expect(actual, `flags for ${sub.name}`).toEqual(expected);
    }
  });

  it('derives positionals from the grammar arity (one `<identifier>` or none)', () => {
    const roadmap = buildCommandSurface().find((d) => d.verb === 'roadmap');
    expect(roadmap).toBeDefined();
    for (const sub of roadmap!.subActions) {
      const grammar = SUBACTION_SPECS[sub.name];
      // Exact count, not collapsed to a boolean — a future multi-positional
      // sub-action must assert its real arity (AUDIT-BARRAGE-claude-03, Phase 2).
      expect(sub.positionals.length, `positionals for ${sub.name}`).toBe(grammar?.positionals ?? 0);
    }
  });

  it('marks roadmap multi-action: verb-level mediationClass is null', () => {
    const roadmap = buildCommandSurface().find((d) => d.verb === 'roadmap');
    expect(roadmap).toBeDefined();
    expect(roadmap!.subActions.length).toBeGreaterThan(0);
    expect(roadmap!.mediationClass).toBeNull();
  });

  it('every sub-action carries a non-empty description (no drift)', () => {
    const roadmap = buildCommandSurface().find((d) => d.verb === 'roadmap');
    expect(roadmap).toBeDefined();
    for (const sub of roadmap!.subActions) {
      expect(sub.description.trim().length, `description for ${sub.name}`).toBeGreaterThan(0);
    }
  });
});

describe('assertSurfaceComplete (T006/T007 — completeness guard)', () => {
  it('throws when a verb has an empty description', () => {
    const bad: CommandDescriptor[] = [
      { verb: 'x', description: '  ', subActions: [], flags: [], mediationClass: 'read-only', deprecatedAliasOf: null },
    ];
    expect(() => assertSurfaceComplete(bad)).toThrow(/x/);
  });

  it('throws when a sub-action has an empty description', () => {
    const bad: CommandDescriptor[] = [
      {
        verb: 'x',
        description: 'a verb',
        subActions: [{ name: 's', description: '', positionals: [], flags: [], mediationClass: 'read-only' }],
        flags: [],
        mediationClass: null,
        deprecatedAliasOf: null,
      },
    ];
    expect(() => assertSurfaceComplete(bad)).toThrow(/x\/s|s\b/);
  });

  it('does not throw for the live (fully described) surface', () => {
    expect(() => assertSurfaceComplete(buildCommandSurface())).not.toThrow();
  });
});

describe('mediationClass declaration (T008/T009 — declared, not inferred)', () => {
  it('projects the DECLARED class per roadmap sub-action (read query vs mutating write)', () => {
    const roadmap = buildCommandSurface().find((d) => d.verb === 'roadmap');
    expect(roadmap).toBeDefined();
    const cls = (n: string) => roadmap!.subActions.find((s) => s.name === n)?.mediationClass;
    expect(cls('next')).toBe('read-only');
    expect(cls('order')).toBe('read-only');
    expect(cls('add')).toBe('mutating');
    expect(cls('advance')).toBe('mutating');
  });

  it('fails loud when a mounted sub-action is unclassified (no silent default)', () => {
    const build = () => {
      const cmd = new Command('fake').description('a fixture verb');
      cmd.command('mystery').description('an unclassified sub-action');
      return cmd;
    };
    // meta declares NO mediation for `mystery` → projection must throw, not
    // silently default to read-only (the mis-classification claude-01 warned of).
    expect(() => buildSurfaceFrom([{ build, meta: { deprecatedAliasOf: null, subActionMediation: {} } }])).toThrow(
      /mystery/,
    );
  });

  it('fails loud when a single-action verb is unclassified', () => {
    const build = () => new Command('lonely').description('a single-action verb');
    expect(() => buildSurfaceFrom([{ build, meta: { deprecatedAliasOf: null } }])).toThrow(/lonely/);
  });
});

describe('selfHandlesHelp (AUDIT-20260619-71 / TASK-308 — opt-out lives on the descriptor)', () => {
  it('roadmap declares selfHandlesHelp (its handler renders the status-vocabulary --help)', () => {
    const roadmap = buildCommandSurface().find((d) => d.verb === 'roadmap');
    expect(roadmap).toBeDefined();
    expect(roadmap!.selfHandlesHelp).toBe(true);
  });

  it('every other mounted verb defaults to descriptor-rendered help (selfHandlesHelp false)', () => {
    for (const d of buildCommandSurface()) {
      if (d.verb === 'roadmap') continue;
      expect(d.selfHandlesHelp, `verb ${d.verb}`).toBe(false);
    }
  });

  it('a verb that does NOT declare it defaults to false (forgetting → descriptor help, no silent override)', () => {
    const build = () => new Command('plainv').description('a fixture verb');
    const [d] = buildSurfaceFrom([{ build, meta: { deprecatedAliasOf: null, verbMediation: 'read-only' } }]);
    expect(d!.selfHandlesHelp).toBe(false);
  });

  it('projects an explicit selfHandlesHelp opt-in from the verb metadata', () => {
    const build = () => new Command('selfv').description('a self-help fixture verb');
    const [d] = buildSurfaceFrom([
      { build, meta: { deprecatedAliasOf: null, verbMediation: 'read-only', selfHandlesHelp: true } },
    ]);
    expect(d!.selfHandlesHelp).toBe(true);
  });
});
