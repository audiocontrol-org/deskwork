import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  NO_PRIOR_RECOMMENDATION_MESSAGE,
  readPriorRecommendation,
} from '../lifecycle-integration/session-start-recommendation.js';

interface Fixture {
  root: string;
  journalPath: string;
}

function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'dw-session-start-hyg-'));
  return { root, journalPath: join(root, 'DEVELOPMENT-NOTES.md') };
}

describe('readPriorRecommendation', () => {
  let fx: Fixture;

  beforeEach(() => {
    fx = makeFixture();
  });
  afterEach(() => rmSync(fx.root, { recursive: true, force: true }));

  it('surfaces the friendly message when DEVELOPMENT-NOTES.md is missing', () => {
    const result = readPriorRecommendation({
      journalPath: fx.journalPath,
      slug: 'hygiene',
    });
    expect(result.found).toBe(false);
    expect(result.block).toBe(NO_PRIOR_RECOMMENDATION_MESSAGE);
  });

  it('surfaces the friendly message when no entry matches the slug', () => {
    writeFileSync(
      fx.journalPath,
      [
        '# Notes',
        '',
        '## 2026-05-27: Earlier session',
        '### Feature: other-feature',
        '',
        'Goal: ...',
        '',
      ].join('\n'),
      'utf8',
    );
    const result = readPriorRecommendation({
      journalPath: fx.journalPath,
      slug: 'hygiene',
    });
    expect(result.found).toBe(false);
  });

  it('extracts the prior recommendation when present in the latest entry', () => {
    writeFileSync(
      fx.journalPath,
      [
        '# Notes',
        '',
        '## 2026-05-27: Phase 5',
        '### Feature: hygiene',
        '',
        'Goal: ship close-shipped.',
        '',
        '### Hygiene observations',
        '',
        '- commit abc — `TBD` in subject',
        '',
        '### Next session recommendation (hygiene)',
        '',
        '- Resume: Task 1 — Phase 6',
        '- Triage: #333',
        '- Address TBD markers: line 12: bare TBD here',
        '',
      ].join('\n'),
      'utf8',
    );
    const result = readPriorRecommendation({
      journalPath: fx.journalPath,
      slug: 'hygiene',
    });
    expect(result.found).toBe(true);
    expect(result.block).toContain('### Hygiene observations');
    expect(result.block).toContain('### Next session recommendation (hygiene)');
    expect(result.block).toContain('Resume: Task 1');
  });

  it('picks the LATEST matching entry when multiple sessions are present', () => {
    writeFileSync(
      fx.journalPath,
      [
        '# Notes',
        '',
        '## 2026-05-26: Phase 4',
        '### Feature: hygiene',
        '',
        '### Hygiene observations',
        '',
        '- old observation from phase 4',
        '',
        '### Next session recommendation (hygiene)',
        '',
        '- Resume: old phase-4 task',
        '',
        '## 2026-05-27: Phase 5',
        '### Feature: hygiene',
        '',
        '### Hygiene observations',
        '',
        '- new observation from phase 5',
        '',
        '### Next session recommendation (hygiene)',
        '',
        '- Resume: new phase-5 task',
        '',
      ].join('\n'),
      'utf8',
    );
    const result = readPriorRecommendation({
      journalPath: fx.journalPath,
      slug: 'hygiene',
    });
    expect(result.found).toBe(true);
    expect(result.block).toContain('new observation');
    expect(result.block).toContain('new phase-5 task');
    expect(result.block).not.toContain('old observation');
  });

  it('returns the friendly message when the latest entry has no hygiene block', () => {
    writeFileSync(
      fx.journalPath,
      [
        '# Notes',
        '',
        '## 2026-05-27: Pre-Phase-6',
        '### Feature: hygiene',
        '',
        'Goal: ship phase 5.',
        '',
        '### Insights',
        '',
        '- Insights body',
        '',
      ].join('\n'),
      'utf8',
    );
    const result = readPriorRecommendation({
      journalPath: fx.journalPath,
      slug: 'hygiene',
    });
    expect(result.found).toBe(false);
    expect(result.block).toBe(NO_PRIOR_RECOMMENDATION_MESSAGE);
  });
});
