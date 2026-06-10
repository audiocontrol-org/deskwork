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
 * deliberately unconstrained here — the round-8 invariant, stated precisely
 * (AUDIT-20260610-02): under a verified pin, a class value either (a) matches
 * nothing in the kit CSS — truly inert — or (b) is part of the CLOSED `.sk-*`
 * vocabulary, the kit's operator-sanctioned lo-fi visual surface (including the
 * three `.sk-theme-*` lo-fi languages per mockups/sketch-kit/DECISION.md).
 * Theme selection is an authoring decision inside the sanctioned kit, not a
 * polish leak; pinning an EXPECTED theme per surface is a referee-manifest
 * concern (Phase 4), not a lint concern.
 */

/** The closed set of structural tags a wireframe may use. */
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  // document structure
  'html', 'head', 'body', 'meta', 'title', 'link',
  // sectioning + grouping
  'div', 'span', 'header', 'footer', 'main', 'nav', 'section', 'article', 'aside',
  // headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // text-level structure. NOTE: `pre` is deliberately ABSENT (AUDIT-20260610-04,
  // gpt-5-03 + fable-07): preserved whitespace renders ASCII-art logos/wordmarks
  // from purely allowlisted codepoints — a text-channel image the codepoint axis
  // cannot see. Outside <pre>, whitespace collapsing destroys the art (and
  // nbsp-style spacers are codepoint-rejected). A code-sample REGION in a
  // wireframe is a `.sk-img` placeholder; inline `code` stays (collapsing).
  'p', 'strong', 'em', 'small', 'br', 'hr', 'a', 'button', 'label',
  'blockquote', 'code', 'figure', 'figcaption',
  // lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // tables
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
]);

/**
 * Each allowlisted attribute declares its KIND at the single point of
 * declaration (AUDIT-20260606-07 / ex-#428):
 *
 * - `'plain'` — the value is inert text; no URL-shape scanning.
 * - `'url'` — the value is a URL and MUST be scheme/control-scanned; membership
 *   in {@link URL_ATTRS} / {@link URL_ATTR_PAIRS} is DERIVED from this tag.
 *
 * Deriving (rather than hand-maintaining a parallel `URL_ATTRS` set) makes the
 * "every URL-bearing allowlisted attr is scanned" invariant hold by
 * construction: an attr cannot be added to the allowlist without an explicit
 * kind decision, and a `'url'` decision automatically extends scanning. The
 * remaining reviewable judgment is the kind itself — a behavioral test loops
 * every url-kind pair through the lint to keep the pipeline honest.
 */
type AttrKind = 'plain' | 'url';

const GLOBAL_ATTR_SPECS: Readonly<Record<string, AttrKind>> = {
  class: 'plain', id: 'plain', title: 'plain', lang: 'plain', dir: 'plain', role: 'plain',
};

const TAG_ATTR_SPECS: Readonly<Record<string, Readonly<Record<string, AttrKind>>>> = {
  meta: { charset: 'plain', name: 'plain', content: 'plain' },
  // `media` deliberately ABSENT (AUDIT-20260610-13, gpt-5-04 + fable-07a):
  // media="print" mutes the pinned kit for screen rendering, so green would no
  // longer mean the kit is IN EFFECT. Wireframes have no print-styling case.
  // `integrity` is plain-kind (AUDIT-20260610-20, fable-04 + gpt-5-codex-03):
  // its value is verified by the pin's SRI branch (axis 1.5), which was
  // unreachable while axis-1 rejected the attr outright.
  link: { rel: 'plain', href: 'url', integrity: 'plain' },
  a: { href: 'url' },
  button: { type: 'plain' },
  ol: { start: 'plain', reversed: 'plain' },
  li: { value: 'plain' },
  td: { colspan: 'plain', rowspan: 'plain', headers: 'plain' },
  th: { colspan: 'plain', rowspan: 'plain', headers: 'plain', scope: 'plain' },
  col: { span: 'plain' },
  colgroup: { span: 'plain' },
};

/** Attributes permitted on ANY allowed element. `aria-*` is handled by prefix. */
export const GLOBAL_ATTRS: ReadonlySet<string> = new Set(Object.keys(GLOBAL_ATTR_SPECS));

/** Per-tag attributes permitted in addition to {@link GLOBAL_ATTRS}. Derived. */
export const TAG_ATTRS: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries(TAG_ATTR_SPECS).map(([tag, specs]) => [tag, new Set(Object.keys(specs))]),
);

/**
 * Every url-kind `(tag, attr)` pair in the allowlist — the behavioral-test
 * surface for the allowlist→scanning direction (each pair must be value-scanned
 * by the lint).
 */
export const URL_ATTR_PAIRS: ReadonlyArray<readonly [string, string]> = Object.entries(
  TAG_ATTR_SPECS,
).flatMap(([tag, specs]) =>
  Object.entries(specs)
    .filter(([, kind]) => kind === 'url')
    .map(([attr]) => [tag, attr] as const),
);

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
 * value-shape checks on — NOT a hardcoded `'href'` literal — so a future
 * URL-bearing attr automatically extends scheme coverage (AUDIT-20260606-04).
 *
 * DERIVED from the url-kind entries of the attr specs above (AUDIT-20260606-07
 * / ex-#428): every URL-bearing attribute in the allowlist is a member by
 * construction — an allowlisted attr cannot skip scanning without an explicit
 * `'plain'` kind decision at its declaration site. The allowlist→scanning
 * direction is additionally behavior-tested over {@link URL_ATTR_PAIRS}.
 */
export const URL_ATTRS: ReadonlySet<string> = new Set(URL_ATTR_PAIRS.map(([, attr]) => attr));

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
