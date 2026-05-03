import { describe, it, expect } from 'vitest';
import { gloss } from '@/lib/glossary-helper';

describe('gloss() template helper', () => {
  it('emits an er-gloss span with data-term', () => {
    const result = gloss('press-check').__raw;
    expect(result).toMatch(/<span\s+class="er-gloss"\s+data-term="press-check"[^>]*>press-check<\/span>/);
  });

  it('uses the gloss term verbatim', () => {
    expect(gloss('press-check').__raw).toContain('>press-check<');
    expect(gloss('marginalia').__raw).toContain('>margin notes<');
  });

  it('throws on unknown term-key', () => {
    expect(() => gloss('not-a-real-term' as never)).toThrow(/unknown glossary term/i);
  });

  it('emits aria-describedby to the glossary anchor id', () => {
    const result = gloss('press-check').__raw;
    expect(result).toMatch(/aria-describedby="glossary-press-check"/);
  });

  it('emits tabindex and role for accessibility', () => {
    const result = gloss('press-check').__raw;
    expect(result).toContain('tabindex="0"');
    expect(result).toContain('role="button"');
  });
});
