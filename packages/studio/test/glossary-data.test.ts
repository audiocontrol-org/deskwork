import { describe, it, expect } from 'vitest';
import glossary from '@/data/glossary.json';

describe('glossary.json', () => {
  it('has required initial terms', () => {
    const required = ['press-check', 'galley', 'compositor', 'proof', 'marginalia', 'stamp', 'kicker', 'flat-plan', 'desk-inset', 'dispatch', 'stet', 'scrapbook'];
    for (const key of required) {
      expect(glossary, `missing key: ${key}`).toHaveProperty(key);
      const entry = (glossary as Record<string, { term: string; gloss: string }>)[key];
      expect(entry).toMatchObject({ term: expect.any(String), gloss: expect.any(String) });
    }
  });

  it('every entry has term + gloss; seeAlso entries reference real keys', () => {
    const g = glossary as Record<string, { term: string; gloss: string; seeAlso?: string[] }>;
    for (const [key, entry] of Object.entries(g)) {
      expect(entry.term, `${key}.term`).toBeTruthy();
      expect(entry.gloss, `${key}.gloss`).toBeTruthy();
      if (entry.seeAlso) {
        for (const ref of entry.seeAlso) {
          expect(g, `${key}.seeAlso[${ref}] not found`).toHaveProperty(ref);
        }
      }
    }
  });
});
