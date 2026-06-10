// T016 (RED-first, US3, 012) — the two tiers must explicitly reference each
// other (FR-012, the #443 ask). The backlog SKILL documents the promote seam
// (three targets, record-don't-create, dry-run/apply) and links to the feature
// tier; the feature/roadmap-tier SKILL references the backlog as a promotion
// origin. Both point at one canonical description (no drift). A doc-presence
// check is the mechanized proxy for SC-004's "a reader can describe the seam".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills');
const read = (rel: string): string => readFileSync(join(SKILLS, rel), 'utf8');

describe('promote docs — backlog tier documents the seam (T016, FR-012)', () => {
  const doc = read('backlog/SKILL.md');

  it('documents the promote subaction', () => {
    expect(doc).toMatch(/backlog promote/);
  });

  it('names all three graduation targets', () => {
    expect(doc).toMatch(/spec:/);
    expect(doc).toMatch(/tasks:/);
    expect(doc).toMatch(/roadmap:/);
  });

  it('states the record-don\'t-create contract', () => {
    expect(doc).toMatch(/record-only|record-don't-create|does not create/i);
  });

  it('documents dry-run-by-default + --apply', () => {
    expect(doc).toMatch(/dry-run/);
    expect(doc).toMatch(/--apply/);
  });

  it('references the feature-rigor tier (links to define/roadmap)', () => {
    expect(doc).toMatch(/\.\.\/(define|roadmap)\/SKILL\.md/);
  });
});

describe('promote docs — feature/roadmap tier references the backlog origin (T016, FR-012)', () => {
  it('the roadmap SKILL references the backlog as a promotion origin', () => {
    const doc = read('roadmap/SKILL.md');
    expect(doc).toMatch(/backlog/i);
    expect(doc).toMatch(/promot/i); // promote / promotion
    expect(doc).toMatch(/\.\.\/backlog\/SKILL\.md/); // navigable back to the canonical description
  });

  // AUDIT-BARRAGE claude-02: define/SKILL.md also carries the cross-reference
  // (spec: targets graduate via define). Guard it so the discovery gap can't
  // silently re-open at the define entry point if that prose is later removed.
  it('the define SKILL references the backlog as a promotion origin', () => {
    const doc = read('define/SKILL.md');
    expect(doc).toMatch(/backlog/i);
    expect(doc).toMatch(/promot/i);
    expect(doc).toMatch(/\.\.\/backlog\/SKILL\.md/);
  });
});
