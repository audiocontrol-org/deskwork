import { describe, it, expect } from 'vitest';
import { layout } from '../src/pages/layout.ts';

describe('layout glossary wiring', () => {
  it('inlines window.__GLOSSARY__ in every page', () => {
    const html = layout({
      title: 'Test',
      cssHrefs: [],
      bodyHtml: '<main>hello</main>',
      scriptModules: [],
    });
    expect(html).toContain('window.__GLOSSARY__');
    expect(html).toContain('"press-check"'); // a known glossary key
  });

  it('properly inlines glossary JSON into script tag', () => {
    const html = layout({
      title: 'Test',
      cssHrefs: [],
      bodyHtml: '<main>hello</main>',
      scriptModules: [],
    });
    // Verify the glossary inline script is properly formed
    const glossaryScriptMatch = html.match(
      /<script>window\.__GLOSSARY__[^]*?<\/script>/
    );
    expect(glossaryScriptMatch).toBeTruthy();
    const glossaryContent = glossaryScriptMatch![0];
    // Should be valid JSON inside the window.__GLOSSARY__ assignment
    expect(glossaryContent).toMatch(/window\.__GLOSSARY__ = {.*};/);
    // Should contain glossary entries
    expect(glossaryContent).toContain('press-check');
    expect(glossaryContent).toContain('gloss');
  });

  it('loads the glossary-tooltip client script', () => {
    const html = layout({
      title: 'Test',
      cssHrefs: [],
      bodyHtml: '<main>hello</main>',
      scriptModules: [],
    });
    // Check for the glossary-tooltip script tag
    expect(html).toContain('glossary-tooltip.js');
    expect(html).toMatch(/glossary-tooltip\.js['"]\s*><\/script>/);
  });

  it('includes glossary inline in head', () => {
    const html = layout({
      title: 'Test',
      cssHrefs: [],
      bodyHtml: '<main>hello</main>',
      scriptModules: [],
    });
    // Glossary should be in <head>
    const headMatch = html.match(/<head>[\s\S]*?<\/head>/);
    expect(headMatch).toBeTruthy();
    expect(headMatch![0]).toContain('window.__GLOSSARY__');
  });

  it('includes glossary-tooltip client script', () => {
    const html = layout({
      title: 'Test',
      cssHrefs: [],
      bodyHtml: '<main>hello</main>',
      scriptModules: [],
    });
    // Glossary tooltip client should be included
    expect(html).toContain('glossary-tooltip.js');
    // It should be a module script
    expect(html).toMatch(/<script[^>]*type="module"[^>]*src="[^"]*glossary-tooltip\.js"/);
  });
});
