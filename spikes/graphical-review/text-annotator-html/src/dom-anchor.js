// Hand-rolled DOM-selector layer for non-text regions.
//
// @recogito/text-annotator anchors annotations to text Ranges (quote / start /
// end). For non-text DOM regions (icon buttons, <img>, decorative <div>s),
// the spike layers a thin DOM-selector resolver on top, emitting a
// W3C-compatible target with three selectors:
//
//   1. CssSelector — primary anchor (W3C Web Annotation § 4.2.1).
//   2. TextQuoteSelector — fallback when an element has *some* text content.
//   3. FragmentSelector — pixel offset (xywh=pixel:...) within the iframe
//      viewport, as a last-resort spatial fallback.
//
// The resolver re-applies the same precedence on read: try CSS selector;
// if no match, search by text quote; if no match, place a marker at the
// pixel offset. Each fallback that fires is logged in the resolved
// annotation's `__resolvedVia` field so the spike's findings can report
// which fallback path actually triggered.

const CSS_INVALID_TOKEN_CHARS = /[^a-zA-Z0-9_-]/;

function escapeCssIdent(token) {
  if (!token) return token;
  if (CSS_INVALID_TOKEN_CHARS.test(token)) {
    return token.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
  }
  return token;
}

/**
 * Walk up the DOM tree to find the most useful anchor element for a pin.
 * Precedence: explicit id > interactive element (button, a, img, figure) >
 * the element itself. Skips through SVG inner elements (text, circle, etc.)
 * which are rarely useful pin targets.
 */
export function findAnchorAncestor(el) {
  if (!el || el.nodeType !== 1) return el;
  let cursor = el;
  while (cursor && cursor.nodeType === 1 && cursor.tagName !== 'BODY') {
    if (cursor.id) return cursor;
    const tag = cursor.tagName.toLowerCase();
    if (
      tag === 'button' ||
      tag === 'a' ||
      tag === 'img' ||
      tag === 'figure'
    ) {
      return cursor;
    }
    cursor = cursor.parentElement;
  }
  return el;
}

/**
 * Compute a stable-ish CSS selector for an element. Prefers id; falls back to
 * a path of tagName + nth-of-type up to the document body.
 */
export function selectorFor(el) {
  if (!el || el.nodeType !== 1) {
    throw new Error('selectorFor: argument must be an Element node');
  }
  if (el.id) {
    return `#${escapeCssIdent(el.id)}`;
  }
  const parts = [];
  let cursor = el;
  while (cursor && cursor.nodeType === 1 && cursor.tagName !== 'BODY') {
    let part = cursor.tagName.toLowerCase();
    const cls = cursor.getAttribute('class');
    if (cls) {
      const classes = cls
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(escapeCssIdent);
      if (classes.length > 0) {
        part += '.' + classes.join('.');
      }
    }
    const parent = cursor.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(
        (c) => c.tagName === cursor.tagName
      );
      if (sameTag.length > 1) {
        const idx = sameTag.indexOf(cursor) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    cursor = parent;
  }
  return parts.join(' > ');
}

/**
 * Compute a text-quote selector if the element has direct or descendant text.
 * Returns null when there is no usable text.
 */
export function textQuoteFor(el) {
  const raw = el.textContent ?? '';
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Clip to first 80 chars; gives a recognizable but bounded payload.
  const exact = trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
  return { type: 'TextQuoteSelector', exact };
}

/**
 * Compute a FragmentSelector pixel-offset for an element relative to the
 * iframe document's viewport (NOT the host page). Uses xywh=pixel: per
 * W3C media-frags. Returns null on zero-area elements.
 */
export function fragmentFor(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x = Math.round(rect.left);
  const y = Math.round(rect.top);
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  return {
    type: 'FragmentSelector',
    conformsTo: 'http://www.w3.org/TR/media-frags/',
    value: `xywh=pixel:${x},${y},${w},${h}`
  };
}

/**
 * Build a full W3C Web Annotation for a DOM region pin. Source is the
 * fixture's URI; container is the iframe document (used for pixel-offset
 * calculation).
 */
export function buildDomAnnotation(el, source) {
  if (!el || el.nodeType !== 1) {
    throw new Error('buildDomAnnotation: el must be an Element');
  }
  const anchor = findAnchorAncestor(el);
  const selectors = [{ type: 'CssSelector', value: selectorFor(anchor) }];
  const quote = textQuoteFor(anchor);
  if (quote) selectors.push(quote);
  const frag = fragmentFor(anchor);
  if (frag) selectors.push(frag);
  return {
    '@context': 'http://www.w3.org/ns/anno.jsonld',
    id: `urn:uuid:${cryptoRandomUuid()}`,
    type: 'Annotation',
    body: [],
    target: {
      source,
      type: 'SpecificResource',
      selector: selectors
    },
    created: new Date().toISOString()
  };
}

/**
 * Resolve an annotation back to an element. Walks the selector list in
 * precedence order:
 *   1. CssSelector → document.querySelector
 *   2. TextQuoteSelector → text search
 *   3. FragmentSelector → spatial marker (returns the topmost element at
 *      the centre of the bounding box, if any)
 *
 * Returns { element, resolvedVia } where resolvedVia is one of
 * 'css' | 'quote' | 'fragment' | null.
 */
export function resolveDomAnnotation(doc, annotation) {
  const selectors = Array.isArray(annotation?.target?.selector)
    ? annotation.target.selector
    : [];
  const css = selectors.find((s) => s.type === 'CssSelector');
  if (css) {
    try {
      const el = doc.querySelector(css.value);
      if (el) return { element: el, resolvedVia: 'css' };
    } catch (err) {
      // Invalid selector — fall through.
    }
  }
  const quote = selectors.find((s) => s.type === 'TextQuoteSelector');
  if (quote && quote.exact) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      const txt = (node.textContent ?? '').trim();
      if (txt.startsWith(quote.exact) || txt === quote.exact) {
        return { element: node, resolvedVia: 'quote' };
      }
      node = walker.nextNode();
    }
  }
  const frag = selectors.find((s) => s.type === 'FragmentSelector');
  if (frag && /^xywh=pixel:(\d+),(\d+),(\d+),(\d+)$/.test(frag.value)) {
    const [, x, y, w, h] = frag.value.match(
      /^xywh=pixel:(\d+),(\d+),(\d+),(\d+)$/
    );
    const cx = Number(x) + Number(w) / 2;
    const cy = Number(y) + Number(h) / 2;
    const el = doc.elementFromPoint(cx, cy);
    if (el) return { element: el, resolvedVia: 'fragment' };
  }
  return { element: null, resolvedVia: null };
}

function cryptoRandomUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error(
    'dom-anchor: crypto.randomUUID() is unavailable in this runtime. ' +
      'The spike requires a UUID source per the no-fallback rule; ' +
      'browser context must expose crypto.randomUUID.'
  );
}
