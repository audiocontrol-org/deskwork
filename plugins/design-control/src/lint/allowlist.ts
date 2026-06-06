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

/** Resource-loading URL attributes, by tag — checked for external/data schemes. */
export const RESOURCE_URL_ATTRS: Readonly<Record<string, ReadonlySet<string>>> = {
  link: new Set(['href']),
};

/** A value carries a `data:` URI scheme (delimiter-anchored to avoid "metadata"). */
export const DATA_URI_RE = /(?:^|[\s"'(;,])data:/i;

/** A value points at an external resource (absolute or protocol-relative URL). */
export const EXTERNAL_URL_RE = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;
