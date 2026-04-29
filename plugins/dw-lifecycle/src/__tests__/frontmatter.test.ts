import { describe, it, expect } from 'vitest';
import { parseFrontmatter, writeFrontmatter, updateFrontmatter } from '../frontmatter.js';

describe('frontmatter', () => {
  it('parses YAML frontmatter and body', () => {
    const md = `---\ntitle: Test\nstate: draft\n---\n\n# Body\n\nContent.\n`;
    const { data, body } = parseFrontmatter(md);
    expect(data).toEqual({ title: 'Test', state: 'draft' });
    expect(body).toBe('# Body\n\nContent.\n');
  });

  it('handles a file with no frontmatter', () => {
    const md = '# Body only\n';
    const { data, body } = parseFrontmatter(md);
    expect(data).toEqual({});
    expect(body).toBe('# Body only\n');
  });

  it('preserves quoted scalars on round-trip', () => {
    const md = `---\ndate: "2026-04-29"\nname: 'foo'\n---\n\nbody\n`;
    const { data, body } = parseFrontmatter(md);
    const out = writeFrontmatter(data, body);
    expect(out).toBe(md);
  });

  it('updateFrontmatter mutates only the named keys', () => {
    const md = `---\ntitle: Old\nstate: draft\n---\n\nbody\n`;
    const out = updateFrontmatter(md, { state: 'published' });
    expect(out).toContain('title: Old');
    expect(out).toContain('state: published');
    expect(out).toContain('\n\nbody\n');
  });
});
