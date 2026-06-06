/**
 * The element/attribute ALLOWLIST for the `check-mockup-lofi` lint (axis 1).
 *
 * Per the converged design (round-7): the lint is an allowlist, NOT a forbid-
 * list. A denylist is whack-a-mole — each round closes one polish channel while
 * others stay open. An allowlist closes the whole class, making the guarantee
 * "lint green ⇒ genuinely lo-fi" trustworthy. Anything not enumerated here is
 * rejected.
 *
 * Scope: this module is axis 1 (which TAGS and ATTRIBUTES may appear). The
 * stylesheet identity-pin (single pinned `<link>` by path+hash) is axis-1.5
 * (task 4); the text codepoint allowlist is axis 2 (task 5). Class *values* are
 * deliberately unconstrained here — they are permitted-but-inert because the
 * pinned stylesheet is the sole CSS source (round-8 invariant).
 */

/** The closed set of structural tags a wireframe may use. */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  // document structure
  'html', 'head', 'body', 'meta', 'title', 'link',
  // sectioning + grouping
  'div', 'span', 'header', 'footer', 'main', 'nav', 'section', 'article', 'aside',
  // headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // text-level structure
  'p', 'strong', 'em', 'small', 'br', 'hr', 'a', 'button', 'label',
  'blockquote', 'code', 'pre', 'figure', 'figcaption',
  // lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
]);

/** Attributes permitted on ANY allowed element. `aria-*` is handled by prefix. */
export const GLOBAL_ATTRS: ReadonlySet<string> = new Set([
  'class', 'id', 'title', 'lang', 'dir', 'role',
]);

/** Per-tag attributes permitted in addition to {@link GLOBAL_ATTRS}. */
export const TAG_ATTRS: Readonly<Record<string, ReadonlySet<string>>> = {
  meta: new Set(['charset', 'name', 'content']),
  link: new Set(['rel', 'href', 'media']),
  a: new Set(['href']),
  button: new Set(['type']),
  ol: new Set(['start', 'reversed']),
  li: new Set(['value']),
  td: new Set(['colspan', 'rowspan', 'headers']),
  th: new Set(['colspan', 'rowspan', 'headers', 'scope']),
  col: new Set(['span']),
  colgroup: new Set(['span']),
};

/**
 * Presentational attributes that get a distinct, clearer rejection message than
 * the generic disallowed-attribute catch-all. (They would be rejected anyway —
 * they are not in the allowlist — but the named class aids the operator.)
 */
export const PRESENTATIONAL_ATTRS: ReadonlySet<string> = new Set([
  'background', 'bgcolor', 'width', 'height', 'align', 'valign', 'border',
  'cellpadding', 'cellspacing', 'color', 'face', 'size', 'nowrap', 'hspace',
  'vspace', 'frame', 'rules', 'char', 'charoff', 'clear', 'noshade', 'compact',
]);

/**
 * Attributes whose VALUE is a URL and must be scheme/control-scanned (data:,
 * javascript:, control-char obfuscation). This is the SSOT the lint gates its
 * value-shape checks on — NOT a hardcoded `'href'` literal — so adding a future
 * URL-bearing attr here automatically extends scheme coverage to it
 * (AUDIT-20260606-04).
 *
 * INVARIANT (AUDIT-20260606-07): every URL-bearing attribute in the allowlist
 * ({@link TAG_ATTRS} / {@link GLOBAL_ATTRS}) is a member of this set, so its
 * values are scheme/control-scanned. Today that holds because the allowlist's
 * only URL attr is `href`, which is present here. The test-enforced half covers
 * the RESOURCE direction (every {@link RESOURCE_URL_ATTRS} attr is here); the
 * non-resource direction (a navigation-URL attr such as `a ping` / `form action`
 * / `q cite`) is currently vacuous — no such attr is in the allowlist. The patch
 * that first adds a non-resource URL attr to the allowlist adds it here in the
 * same change AND replaces this hand-maintained coupling with URL-tagged
 * allowlist entries that derive this set; until such an attr exists the
 * invariant is complete as stated.
 */
export const URL_ATTRS: ReadonlySet<string> = new Set(['href']);

/**
 * Resource-LOADING URL attributes, by tag — the subset of {@link URL_ATTRS}
 * that fetch a resource (vs. `<a href>` navigation), additionally checked for
 * external (absolute / protocol-relative) URLs.
 */
export const RESOURCE_URL_ATTRS: Readonly<Record<string, ReadonlySet<string>>> = {
  link: new Set(['href']),
};

/**
 * A `rel` attribute value names EXACTLY a stylesheet — the normalized token set
 * is `['stylesheet']`, nothing more. A mixed `rel="stylesheet icon"` /
 * `"stylesheet preload"` still pulls a non-CSS resource, so it is NOT a clean
 * stylesheet link. Shared by axis-1's link-rel gate and the identity-pin's link
 * collector so the two cannot disagree (AUDIT-20260606-08).
 */
export function isStylesheetRel(relValue: string): boolean {
  const tokens = relValue.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.length === 1 && tokens[0] === 'stylesheet';
}

/** A value carries a `data:` URI scheme (delimiter-anchored to avoid "metadata"). */
export const DATA_URI_RE = /(?:^|[\s"'(;,])data:/i;

/** A value points at an external resource (absolute or protocol-relative URL). */
export const EXTERNAL_URL_RE = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;
