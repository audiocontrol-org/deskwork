/**
 * `check-mockup-lofi` — the lo-fi wireframe lint, axis 1 (element/attribute
 * ALLOWLIST). Built on the WHATWG-compliant parse5 tree so polish channels
 * cannot leak through parser differentials.
 *
 * "Lint green ⇒ genuinely lo-fi" only holds because every rule below is an
 * allowlist closure, not a denylist patch. Anything not enumerated in
 * `@/lint/allowlist` is rejected by the catch-all.
 *
 * SCOPE BOUNDARY (AUDIT-20260610-18): text-as-imagery composed of allowlisted
 * LETTER glyphs at structural granularity (e.g. a wordmark mosaic of one
 * letter per table cell) is OUTSIDE the lint's mechanical closure — letter
 * grids are statistically indistinguishable from legitimate Y/N feature
 * matrices, and stacking shape heuristics is the whack-a-mole the round-7
 * allowlist pivot abolished. The punctuation-density gate bounds punctuation
 * art only; general text-as-imagery is the cross-model REFEREE's gross-class
 * imagery judgment (PRD § referee, gross classes 5–7). A boundary fixture in
 * the codepoint suite pins this explicitly.
 *
 * This task ships axis 1 only. The stylesheet identity-pin (single pinned
 * `<link>` by canonical path + content hash) is task 4; the text codepoint
 * allowlist is task 5; the adversarial corpus is tasks 6–7. The pipeline shape
 * (`walk` + `checkElement`) is the seam those tasks extend.
 */

import { parse, defaultTreeAdapter as ta } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  ALLOWED_TAGS,
  GLOBAL_ATTRS,
  TAG_ATTRS,
  PRESENTATIONAL_ATTRS,
  URL_ATTRS,
  RESOURCE_URL_ATTRS,
  DATA_URI_RE,
  EXTERNAL_URL_RE,
  META_NAME_ALLOWLIST,
  INPUT_TYPE_ALLOWLIST,
  isStylesheetRel,
} from '@/lint/allowlist';

export { ALLOWED_TAGS } from '@/lint/allowlist';
export type { LintRule, LintFinding, LintResult } from '@/lint/types';

import type { LintFinding, LintResult } from '@/lint/types';
import { checkStylesheetIdentity, type StylesheetPin } from '@/lint/stylesheet-pin';
import {
  findDisallowedCodepoints,
  formatCodepoint,
  isPunctuationDense,
  punctuationRatio,
  PUNCT_DENSITY_RATIO,
} from '@/lint/codepoint';
import { SKETCH_KIT_STYLESHEET_FILENAME } from '@/wireframe-kit/sketch-kit';

type AnyNode = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export interface LintOptions {
  /**
   * REQUIRED (AUDIT-20260610-11, round-2 cross-model): the stylesheet
   * identity-pin (axis 1.5) — exactly one stylesheet `<link>`, resolving to the
   * canonical path, whose content hash matches the pinned sketch-kit.css. The
   * lo-fi guarantee ("lint green ⇒ genuinely lo-fi") is only true under the
   * pin; making it optional made the unsafe configuration the default (a
   * designed local file NAMED sketch-kit.css passed green). Callers that
   * genuinely want the filesystem-free axes use
   * {@link lintWireframeStructural}, whose name carries no identity guarantee.
   */
  readonly stylesheetPin: StylesheetPin;
}

const SCRIPT_URI_RE = /^\s*(?:javascript|vbscript):/i;
// C0 control characters (incl. parse5-decoded \n / \t). They are a scheme-
// obfuscation channel: `java&#x0a;script:` decodes to an embedded newline that
// slips a start-anchored scheme regex. Built via RegExp() to keep raw control
// bytes out of the source.
const CONTROL_CHAR_RE = new RegExp('[\\u0000-\\u001F]');

function isAllowedAttr(tag: string, attr: string): boolean {
  if (GLOBAL_ATTRS.has(attr)) return true;
  if (attr.startsWith('aria-')) return true;
  return TAG_ATTRS[tag]?.has(attr) ?? false;
}

/**
 * Lexical basename of an href: strip query/fragment, then take the segment
 * after the last separator. Backslashes count as separators because WHATWG URL
 * parsing normalizes them to `/` in special-scheme contexts — a `\`-path must
 * not hide (or fake) a kit-named basename.
 */
function hrefBasename(href: string): string {
  const noSuffix = href.split(/[?#]/)[0];
  const segments = noSuffix.split(/[/\\]/);
  return segments[segments.length - 1] ?? '';
}

/** Per-document state threaded through the walk (axis-1 needs a link census). */
interface WalkContext {
  readonly findings: LintFinding[];
  stylesheetLinkCount: number;
}

/**
 * Block-level containers whose AGGREGATE descendant text gets the
 * punctuation-density check (AUDIT-20260610-17, round-3 gpt-5-01/-02): a
 * per-text-node check is defeated by sharding — adjacent inline shards each
 * below the length floor, or one glyph per table cell. These are the rendered
 * row/region granularities the shards visually reassemble at. The per-node
 * check is kept alongside: an inline island inside a letter-diluted block
 * (prose + one dense button) only trips at the node level.
 */
const DENSITY_BLOCK_TAGS: ReadonlySet<string> = new Set([
  'body', 'main', 'header', 'footer', 'nav', 'section', 'article', 'aside',
  'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
]);

/** Concatenated descendant text of an element (template content included). */
function aggregateText(el: Element): string {
  let out = '';
  const visit = (node: AnyNode): void => {
    if (ta.isTextNode(node)) out += ta.getTextNodeContent(node);
    if ('content' in node && node.content) {
      for (const child of node.content.childNodes) visit(child);
    }
    if ('childNodes' in node) {
      for (const child of node.childNodes) visit(child);
    }
  };
  visit(el);
  return out;
}

function checkElement(el: Element, ctx: WalkContext): void {
  const { findings } = ctx;
  const tag = ta.getTagName(el).toLowerCase();

  if (!ALLOWED_TAGS.has(tag)) {
    findings.push({
      rule: 'disallowed-element',
      tag,
      message: `<${tag}> is not in the lo-fi element allowlist`,
    });
    return; // the element itself is the violation; don't double-report its attrs
  }

  for (const { name, value } of ta.getAttrList(el)) {
    const attr = name.toLowerCase();

    // Named-attribute channels first (these are about the attr NAME).
    if (attr === 'style') {
      findings.push({ rule: 'inline-style', tag, attr, message: `inline style= on <${tag}> is a polish channel` });
      continue;
    }
    if (attr.startsWith('on')) {
      findings.push({ rule: 'event-handler', tag, attr, message: `event-handler ${attr} on <${tag}> is not lo-fi` });
      continue;
    }
    if (PRESENTATIONAL_ATTRS.has(attr)) {
      findings.push({ rule: 'presentational-attribute', tag, attr, message: `presentational attribute ${attr} on <${tag}> is rejected` });
      continue;
    }
    // Allowlist MEMBERSHIP is decided before any value-shape rule, so a value
    // that merely looks like a URI on a disallowed attribute is reported as
    // disallowed-attribute (AUDIT-20260606-01/claude-02), not mislabeled.
    if (!isAllowedAttr(tag, attr)) {
      findings.push({ rule: 'disallowed-attribute', tag, attr, message: `attribute ${attr} on <${tag}> is not in the allowlist` });
      continue;
    }
    // Human-visible attribute VALUES pass the codepoint allowlist
    // (AUDIT-20260610-19): `title` renders as a tooltip and `aria-*` is
    // announced/displayable — the designed-glyph channel axis-2 closes for
    // text nodes must not survive in attributes the operator can see.
    // class/id stay value-unconstrained (inert under the pin, round-8).
    if (attr === 'title' || attr.startsWith('aria-')) {
      for (const { codepoint, char } of findDisallowedCodepoints(value)) {
        findings.push({
          rule: 'disallowed-codepoint',
          tag,
          attr,
          message: `disallowed codepoint ${formatCodepoint(codepoint)} (${JSON.stringify(char)}) in ${attr} on <${tag}> — visible attribute values follow the lo-fi codepoint allowlist`,
        });
      }
      // Visible attr values get the density gate too (AUDIT-20260610-21):
      // a tooltip is a hover-rendered surface for the same punctuation art.
      if (isPunctuationDense(value)) {
        findings.push({
          rule: 'punctuation-density',
          tag,
          attr,
          message: `${attr} on <${tag}> is punctuation-dense (imagery-shaped) — tooltip/announced text follows the same anti-art gate as text content`,
        });
      }
    }
    // `input type` is an enumerated structural set (AUDIT-20260610-24):
    // image loads a resource; color/file/range open visual chrome.
    if (tag === 'input' && attr === 'type' && !INPUT_TYPE_ALLOWLIST.has(value.toLowerCase())) {
      findings.push({
        rule: 'disallowed-input-type',
        tag,
        attr,
        message: `input type="${value}" is not in the enumerated structural set (${[...INPUT_TYPE_ALLOWLIST].join(', ')})`,
      });
    }
    // `meta name` is an enumerated set (AUDIT-20260610-19): theme-color /
    // color-scheme are visual channels carried by NAME.
    if (tag === 'meta' && attr === 'name' && !META_NAME_ALLOWLIST.has(value.toLowerCase())) {
      findings.push({
        rule: 'disallowed-meta-name',
        tag,
        attr,
        message: `meta name="${value}" is not in the enumerated allowlist (${[...META_NAME_ALLOWLIST].join(', ')}) — theme-color/color-scheme are browser-chrome visual channels`,
      });
    }
    // Value-level URL checks apply ONLY to URL-bearing attrs (URL_ATTRS, the
    // SSOT — currently just href). Scanning every value for "data:" over-
    // rejected inert class/meta/title prose and contradicted the round-8 inert-
    // class invariant (AUDIT-20260606-01). Gating on URL_ATTRS rather than a
    // hardcoded 'href' keeps coverage in lockstep with the allowlist so a future
    // URL attr is auto-scanned (AUDIT-20260606-04).
    if (URL_ATTRS.has(attr)) {
      if (CONTROL_CHAR_RE.test(value)) {
        findings.push({ rule: 'disallowed-uri-scheme', tag, attr, message: `control character in ${attr} on <${tag}> (scheme-obfuscation channel) is rejected` });
        continue;
      }
      if (DATA_URI_RE.test(value)) {
        findings.push({ rule: 'data-uri', tag, attr, message: `data: URI in ${attr} on <${tag}> is rejected` });
        continue;
      }
      if (SCRIPT_URI_RE.test(value)) {
        findings.push({ rule: 'disallowed-uri-scheme', tag, attr, message: `script-bearing URI scheme in ${attr} on <${tag}> is rejected` });
        continue;
      }
      // external-resource applies only to genuine resource-LOADING attrs (link
      // href), not <a> navigation links.
      if (RESOURCE_URL_ATTRS[tag]?.has(attr) && EXTERNAL_URL_RE.test(value)) {
        findings.push({ rule: 'external-resource', tag, attr, message: `external resource URL in ${attr} on <${tag}> is rejected` });
      }
    }
  }

  // Block-aggregate punctuation density (AUDIT-20260610-17): the rendered
  // row/region is what sharded punctuation art reassembles at.
  if (DENSITY_BLOCK_TAGS.has(tag) && isPunctuationDense(aggregateText(el))) {
    findings.push({
      rule: 'punctuation-density',
      tag,
      message: `aggregate text of <${tag}> is punctuation-dense (imagery-shaped, not copy-shaped) — sharded pixel/ASCII-art channels are rejected; use the .sk-img placeholder for image regions`,
    });
  }

  // Sibling-RUN density (AUDIT-20260610-22, round-5): stacked sibling blocks
  // each below the per-node floor (7-char rows) reassemble vertically while a
  // prose sibling dilutes the parent aggregate. Consecutive density-shaped
  // element children (punctuation ratio >= the gate's ratio, any length) are
  // accumulated as a run; the length floor applies to the run's combined text.
  // A prose sibling breaks the run, so interleaved copy stays green.
  if (DENSITY_BLOCK_TAGS.has(tag)) {
    let run = '';
    const flush = (): void => {
      if (run !== '' && isPunctuationDense(run)) {
        findings.push({
          rule: 'punctuation-density',
          tag,
          message: `a run of consecutive punctuation-dense child blocks of <${tag}> is imagery-shaped (stacked pixel/ASCII-art rows) — use the .sk-img placeholder for image regions`,
        });
      }
      run = '';
    };
    for (const child of el.childNodes) {
      if (!ta.isElementNode(child)) continue;
      const text = aggregateText(child);
      const trimmed = text.replace(/[\s]/g, '');
      if (trimmed.length > 0 && punctuationRatio(text) >= PUNCT_DENSITY_RATIO) {
        run += text;
      } else if (trimmed.length > 0) {
        flush();
      }
    }
    flush();
  }

  // Only the pinned sketch-kit stylesheet link is permitted. The rel token set
  // must be EXACTLY ['stylesheet'] — a mixed rel like "stylesheet icon" still
  // pulls a non-CSS resource (AUDIT-20260606-02/codex-01). The exact path+hash
  // identity-pin is axis 1.5.
  if (tag === 'link') {
    const attrs = ta.getAttrList(el);
    const relValue = attrs.find((a) => a.name.toLowerCase() === 'rel')?.value ?? '';
    if (!isStylesheetRel(relValue)) {
      findings.push({ rule: 'disallowed-link-rel', tag, message: `only rel="stylesheet" <link> is permitted; got rel="${relValue}"` });
    } else {
      // Axis-1 stylesheet narrowing (AUDIT-20260610-01, gpt-5-02 + fable-02):
      // the stylesheet link must lexically reference the kit filename, and the
      // document census (post-walk) enforces a singleton. Filesystem-free —
      // byte identity remains axis-1.5's job (the pin); a local non-kit file
      // NAMED sketch-kit.css passes here by design and only the pin catches it.
      ctx.stylesheetLinkCount += 1;
      const href = attrs.find((a) => a.name.toLowerCase() === 'href')?.value ?? '';
      if (hrefBasename(href) !== SKETCH_KIT_STYLESHEET_FILENAME) {
        findings.push({
          rule: 'stylesheet-filename-mismatch',
          tag,
          attr: 'href',
          message: `stylesheet href "${href}" does not reference ${SKETCH_KIT_STYLESHEET_FILENAME} — only the sketch-kit stylesheet may be linked`,
        });
      }
    }
  }
}

function checkText(node: DefaultTreeAdapterMap['textNode'], findings: LintFinding[]): void {
  const content = ta.getTextNodeContent(node);
  for (const { codepoint, char } of findDisallowedCodepoints(content)) {
    findings.push({
      rule: 'disallowed-codepoint',
      message: `disallowed codepoint ${formatCodepoint(codepoint)} (${JSON.stringify(char)}) in text content — outside the lo-fi codepoint allowlist`,
    });
  }
  // AUDIT-20260610-12: imagery-shaped punctuation mass (pixel-art rows) is
  // rejected per text node — see isPunctuationDense for the channel rationale.
  if (isPunctuationDense(content)) {
    findings.push({
      rule: 'punctuation-density',
      message: `text content is punctuation-dense (imagery-shaped, not copy-shaped) — pixel/ASCII-art channels are rejected; use the .sk-img placeholder for image regions`,
    });
  }
}

function walk(node: AnyNode, ctx: WalkContext): void {
  if (ta.isElementNode(node)) {
    checkElement(node, ctx);
    // <template> stows its subtree in .content — descend so nothing hides there
    if ('content' in node && node.content) {
      for (const child of node.content.childNodes) walk(child, ctx);
    }
  } else if (ta.isTextNode(node)) {
    checkText(node, ctx.findings);
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) walk(child, ctx);
  }
}

/**
 * STRUCTURAL lint only — axes 1 (element/attribute allowlist) + 2 (text
 * codepoint allowlist), filesystem-free. The name deliberately carries NO
 * lo-fi-guarantee claim: without the identity pin, a designed local stylesheet
 * named like the kit passes these axes (AUDIT-20260610-01/-11). Use
 * {@link lintWireframe} for the guarantee-bearing check.
 */
export function lintWireframeStructural(html: string): LintResult {
  const ctx: WalkContext = { findings: [], stylesheetLinkCount: 0 };
  walk(parse(html), ctx);
  const { findings } = ctx;
  // Axis-1 singleton census (AUDIT-20260610-01): more than one stylesheet link
  // is a smuggling channel regardless of what each names. Zero links is NOT an
  // axis-1 violation (an unstyled fragment renders browser-default, not
  // polish); the pin's stylesheet-missing covers presence in pinned mode.
  if (ctx.stylesheetLinkCount > 1) {
    findings.push({
      rule: 'stylesheet-not-singleton',
      tag: 'link',
      message: `${ctx.stylesheetLinkCount} stylesheet links found — exactly one (the sketch-kit stylesheet) is permitted`,
    });
  }
  return { ok: findings.length === 0, findings };
}

/**
 * Lint a wireframe HTML string with the FULL lo-fi guarantee: structural axes
 * plus the stylesheet identity-pin (axis 1.5). The pin is required — the
 * guarantee is false without it, so a pin-less call throws instead of
 * silently degrading to the filename-only check (AUDIT-20260610-11; no
 * fallbacks). Returns all findings (does not short-circuit) so the operator
 * sees every violation in one pass.
 */
export function lintWireframe(html: string, options: LintOptions): LintResult {
  if (!options?.stylesheetPin) {
    throw new Error(
      'lintWireframe requires options.stylesheetPin — the lo-fi guarantee is false without the identity pin. ' +
        'Use lintWireframeStructural(html) for the filesystem-free axes (no guarantee claim).',
    );
  }
  const structural = lintWireframeStructural(html);
  const findings = [...structural.findings, ...checkStylesheetIdentity(html, options.stylesheetPin)];
  return { ok: findings.length === 0, findings };
}
