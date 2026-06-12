import { describe, expect, it } from 'vitest';
import { expectThinAdapterSkill, readPluginFile } from './portability-helpers.js';

const FRONT_DOOR_SKILLS = [
  {
    path: 'skills/define/SKILL.md',
    required: ['stackctl spec-check', /Claude Code and Codex are the\s+current portability targets/],
  },
  {
    path: 'skills/extend/SKILL.md',
    required: ['stackctl spec-check', /Claude Code and Codex are the\s+current portability targets/],
  },
  {
    path: 'skills/execute/SKILL.md',
    required: ['stackctl execute-check', /Claude Code and Codex are the\s+current portability targets/],
  },
] as const;

describe('front-door host portability contract', () => {
  it('Claude-facing adapter assets stay thin and bind to shared-core checks', () => {
    for (const skill of FRONT_DOOR_SKILLS) {
      expectThinAdapterSkill(skill.path, skill.required);
    }
  });

  it('Codex host surface reuses the same shared skills tree instead of forking business logic', () => {
    const codexManifest = readPluginFile('.codex-plugin/plugin.json');
    expect(codexManifest).toContain('"skills": "./skills/"');
    expect(codexManifest).toContain('"name": "stack-control"');
  });

  it('front-door skills fail loudly on missing host capabilities rather than inventing workarounds', () => {
    for (const path of ['skills/define/SKILL.md', 'skills/extend/SKILL.md', 'skills/execute/SKILL.md']) {
      const body = readPluginFile(path);
      expect(body).toMatch(/fail loud|STOP and report|cannot proceed|surface the underlying error/i);
    }
  });
});
