/**
 * Glossary tooltip client.
 *
 * Reads inline glossary data, attaches hover/focus/touch listeners to
 * .er-gloss spans, renders tooltip cards per the markup convention in
 * docs/superpowers/frontend-design/glossary-tooltip.md, and handles
 * dismissal via Esc / click-outside / blur.
 *
 * The CSS-only animation, rotation, and pointer-triangle direction are
 * driven by the data-position attribute on the tooltip element.
 */

interface GlossaryEntry {
  term: string;
  gloss: string;
  seeAlso?: string[];
}

type Glossary = Record<string, GlossaryEntry>;

interface InitOptions {
  glossary: Glossary;
  /**
   * Path prefix for the Manual's glossary anchors. Default: '/dev/editorial-help'.
   */
  manualPath?: string;
}

let activeTip: HTMLElement | null = null;
let activeSpan: HTMLElement | null = null;

export function initGlossaryTooltips(opts: InitOptions): void {
  const { glossary, manualPath = '/dev/editorial-help' } = opts;

  function show(span: HTMLElement) {
    hide();
    const key = span.dataset.term;
    if (!key) return;
    const entry = glossary[key];
    if (!entry) {
      console.warn(`unknown glossary term: ${key}`);
      return;
    }
    const tip = renderTooltip(entry, key, manualPath);
    document.body.appendChild(tip);
    positionTooltip(tip, span);
    span.setAttribute('aria-expanded', 'true');
    activeTip = tip;
    activeSpan = span;
  }

  function hide() {
    if (activeTip) {
      activeTip.remove();
      activeTip = null;
    }
    if (activeSpan) {
      activeSpan.removeAttribute('aria-expanded');
      activeSpan = null;
    }
  }

  // Attach per-term-span listeners
  document.querySelectorAll<HTMLElement>('.er-gloss').forEach((span) => {
    span.addEventListener('mouseenter', () => show(span));
    span.addEventListener('mouseleave', () => hide());
    span.addEventListener('focus', () => show(span));
    span.addEventListener('blur', () => hide());
    // Touch — toggle on click
    span.addEventListener('click', (e) => {
      if (activeSpan === span) {
        e.preventDefault();
        hide();
      } else {
        e.preventDefault();
        show(span);
      }
    });
  });

  // Document-level dismissal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeTip) {
      hide();
    }
  });

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.er-gloss')) return;       // tap on a term — handled per-span
    if (target.closest('.er-gloss-tip')) return;   // tap inside the tooltip
    hide();
  });
}

function renderTooltip(entry: GlossaryEntry, key: string, manualPath: string): HTMLElement {
  const tip = document.createElement('aside');
  tip.className = 'er-gloss-tip';
  tip.id = `glossary-${key}`;
  tip.setAttribute('role', 'tooltip');
  tip.setAttribute('aria-hidden', 'false');
  tip.setAttribute('data-position', 'above');

  const kicker = document.createElement('p');
  kicker.className = 'er-gloss-tip-kicker';
  kicker.appendChild(document.createTextNode('Glossary · '));
  const kickerTerm = document.createElement('span');
  kickerTerm.className = 'er-gloss-tip-kicker-term';
  kickerTerm.textContent = entry.term;
  kicker.appendChild(kickerTerm);
  tip.appendChild(kicker);

  const gloss = document.createElement('p');
  gloss.className = 'er-gloss-tip-gloss';
  gloss.textContent = entry.gloss;
  tip.appendChild(gloss);

  if (entry.seeAlso && entry.seeAlso.length > 0) {
    const seeAlso = document.createElement('p');
    seeAlso.className = 'er-gloss-tip-see-also';

    const label = document.createElement('span');
    label.className = 'er-gloss-tip-see-also-label';
    label.textContent = 'see also';
    seeAlso.appendChild(label);

    for (const ref of entry.seeAlso) {
      const chip = document.createElement('a');
      chip.className = 'er-gloss-tip-chip';
      chip.href = `${manualPath}#glossary-${ref}`;
      chip.textContent = ref;
      seeAlso.appendChild(chip);
    }

    tip.appendChild(seeAlso);
  }

  return tip;
}

function positionTooltip(tip: HTMLElement, anchor: HTMLElement): void {
  // Temporarily add to DOM to measure it
  const rect = anchor.getBoundingClientRect();
  const tipWidth = tip.offsetWidth || 280; // fallback to approximate width
  const tipHeight = tip.offsetHeight || 120;

  const VIEWPORT_TOP_TOLERANCE = 80; // px — flip tooltip below if term is within this

  // Default: above the term
  let top = rect.top + window.scrollY - tipHeight - 8;
  let position: 'above' | 'below' = 'above';

  // Flip if tip would extend above the visible viewport
  if (rect.top < VIEWPORT_TOP_TOLERANCE) {
    top = rect.bottom + window.scrollY + 8;
    position = 'below';
  }

  // Default left: align tooltip's left edge with the term's left edge
  // (offset into the tip so the pointer triangle lines up — handled by CSS)
  let left = rect.left + window.scrollX - 16; // ~--er-space-3 offset

  // Horizontal clamp: keep the tooltip inside the viewport
  const rightEdge = window.scrollX + window.innerWidth - 16;
  if (left + tipWidth > rightEdge) {
    left = rightEdge - tipWidth;
  }
  if (left < window.scrollX + 8) {
    left = window.scrollX + 8;
  }

  tip.style.position = 'absolute';
  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
  tip.setAttribute('data-position', position);
}

// Auto-init when used as a script-tag entry-point
declare global {
  interface Window {
    __GLOSSARY__?: Glossary;
  }
}

if (typeof window !== 'undefined' && window.__GLOSSARY__) {
  initGlossaryTooltips({ glossary: window.__GLOSSARY__ });
}
