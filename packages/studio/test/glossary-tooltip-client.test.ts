/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initGlossaryTooltips } from '../../../plugins/deskwork-studio/public/src/glossary-tooltip';

const MOCK_GLOSSARY = {
  'press-check': {
    term: 'press-check',
    gloss: 'A pre-press review.',
    seeAlso: ['galley'],
  },
  'galley': {
    term: 'galley',
    gloss: 'A column proof.',
  },
};

function makeGlossSpan(termKey: string, label: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'er-gloss';
  span.dataset.term = termKey;
  span.tabIndex = 0;
  span.setAttribute('role', 'button');
  span.setAttribute('aria-describedby', `glossary-${termKey}`);
  span.textContent = label;
  return span;
}

describe('initGlossaryTooltips', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.setAttribute('data-review-ui', 'studio');
  });

  it('shows tooltip on mouseenter; dismisses on Esc', () => {
    const span = makeGlossSpan('press-check', 'press-check');
    document.body.appendChild(span);

    initGlossaryTooltips({ glossary: MOCK_GLOSSARY });

    span.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    const tip = document.querySelector('.er-gloss-tip');
    expect(tip, 'tooltip should be in DOM after mouseenter').toBeTruthy();
    expect(tip!.textContent).toContain('A pre-press review.');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.er-gloss-tip')).toBeFalsy();
  });

  it('shows tooltip on focus; dismisses on blur', () => {
    const span = makeGlossSpan('press-check', 'press-check');
    document.body.appendChild(span);

    initGlossaryTooltips({ glossary: MOCK_GLOSSARY });

    span.dispatchEvent(new FocusEvent('focus'));
    expect(document.querySelector('.er-gloss-tip')).toBeTruthy();

    span.dispatchEvent(new FocusEvent('blur'));
    expect(document.querySelector('.er-gloss-tip')).toBeFalsy();
  });

  it('renders see-also chips when entry has seeAlso list', () => {
    const span = makeGlossSpan('press-check', 'press-check');
    document.body.appendChild(span);

    initGlossaryTooltips({ glossary: MOCK_GLOSSARY });

    span.dispatchEvent(new MouseEvent('mouseenter'));
    const chips = document.querySelectorAll('.er-gloss-tip-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toBe('galley');
    expect(chips[0].getAttribute('href')).toContain('#glossary-galley');
  });

  it('does NOT render see-also chips for entries without seeAlso', () => {
    const span = makeGlossSpan('galley', 'galley');
    document.body.appendChild(span);

    initGlossaryTooltips({ glossary: MOCK_GLOSSARY });

    span.dispatchEvent(new MouseEvent('mouseenter'));
    const seeAlsoBlock = document.querySelector('.er-gloss-tip-see-also');
    expect(seeAlsoBlock).toBeFalsy();
  });

  it('replaces existing tooltip when a different term is hovered (single-tooltip invariant)', () => {
    const a = makeGlossSpan('press-check', 'press-check');
    const b = makeGlossSpan('galley', 'galley');
    document.body.append(a, b);

    initGlossaryTooltips({ glossary: MOCK_GLOSSARY });

    a.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelectorAll('.er-gloss-tip').length).toBe(1);

    b.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.querySelectorAll('.er-gloss-tip').length).toBe(1);
    const tip = document.querySelector('.er-gloss-tip')!;
    expect(tip.textContent).toContain('A column proof.');
  });

  it('logs a warning and does not crash on unknown term', () => {
    const span = makeGlossSpan('not-a-term', 'not-a-term');
    document.body.appendChild(span);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    initGlossaryTooltips({ glossary: MOCK_GLOSSARY });

    expect(() => span.dispatchEvent(new MouseEvent('mouseenter'))).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/unknown glossary term/i));
    warnSpy.mockRestore();
  });
});
