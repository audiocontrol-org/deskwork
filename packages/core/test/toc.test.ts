import { describe, expect, it } from 'vitest';
import { extractToc } from '@/review/toc';
import { renderMarkdownToHtml } from '@/review/render';

describe('extractToc', () => {
  it('returns an empty list when there are no h2/h3/h4 headings', () => {
    expect(extractToc('<p>just prose, no headings.</p>')).toEqual([]);
  });

  it('reads depth + id + text from the rendered HTML', () => {
    const html = `
      <h2 id="intro">Intro</h2>
      <p>x</p>
      <h3 id="sub">Sub-section</h3>
      <h4 id="leaf">Leaf</h4>
    `;
    expect(extractToc(html)).toEqual([
      { depth: 2, id: 'intro', text: 'Intro' },
      { depth: 3, id: 'sub', text: 'Sub-section' },
      { depth: 4, id: 'leaf', text: 'Leaf' },
    ]);
  });

  it('skips headings without an id (defense — rehype-slug should always set one)', () => {
    const html = '<h2>No id here</h2><h2 id="ok">Has id</h2>';
    expect(extractToc(html)).toEqual([{ depth: 2, id: 'ok', text: 'Has id' }]);
  });

  it('strips inner HTML tags from heading text', () => {
    const html = '<h2 id="x">Plain <em>and</em> <code>code</code></h2>';
    expect(extractToc(html)[0]?.text).toBe('Plain and code');
  });

  it('decodes the small set of entities rehype-stringify emits', () => {
    const html = '<h2 id="x">Tom &amp; Jerry &lt;3</h2>';
    expect(extractToc(html)[0]?.text).toBe('Tom & Jerry <3');
  });

  it('integrates with the renderer (rehype-slug assigns ids)', async () => {
    const md = `
## First section

prose

### Subsection

more prose

## Second section
`;
    const html = await renderMarkdownToHtml(md);
    const toc = extractToc(html);
    expect(toc.map((e) => e.text)).toEqual([
      'First section',
      'Subsection',
      'Second section',
    ]);
    expect(toc.every((e) => /^[a-z0-9-]+$/.test(e.id))).toBe(true);
  });
});
