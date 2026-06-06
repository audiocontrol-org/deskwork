/**
 * `check-mockup-lofi` — the lo-fi wireframe lint, axis 1 (element/attribute
 * ALLOWLIST). Built on the WHATWG-compliant parse5 tree so polish channels
 * cannot leak through parser differentials.
 *
 * "Lint green ⇒ genuinely lo-fi" only holds because every rule below is an
 * allowlist closure, not a denylist patch. Anything not enumerated in
 * `@/lint/allowlist` is rejected by the catch-all.
 *
 * This task ships axis 1 only. The stylesheet identity-pin (single pinned
 * `<link>` by canonical path + content hash) is task 4; the text codepoint
 * allowlist is task 5; the adversarial corpus is tasks 6–7. The pipeline shape
 * (`RULES`) is the seam those tasks extend.
 */

import { parse, defaultTreeAdapter as ta } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  ALLOWED_TAGS,
  GLOBAL_ATTRS,
  TAG_ATTRS,
  PRESENTATIONAL_ATTRS,
  RESOURCE_URL_ATTRS,
  DATA_URI_RE,
  EXTERNAL_URL_RE,
} from '@/lint/allowlist';

export { ALLOWED_TAGS } from '@/lint/allowlist';

type AnyNode = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export type LintRule =
  | 'disallowed-element'
  | 'disallowed-attribute'
  | 'inline-style'
  | 'event-handler'
  | 'presentational-attribute'
  | 'data-uri'
  | 'external-resource'
  | 'disallowed-uri-scheme'
  | 'disallowed-link-rel';

export interface LintFinding {
  readonly rule: LintRule;
  readonly message: string;
  readonly tag?: string;
  readonly attr?: string;
}

export interface LintResult {
  readonly ok: boolean;
  readonly findings: readonly LintFinding[];
}

const SCRIPT_URI_RE = /^\s*(?:javascript|vbscript):/i;

function isAllowedAttr(tag: string, attr: string): boolean {
  if (GLOBAL_ATTRS.has(attr)) return true;
  if (attr.startsWith('aria-')) return true;
  return TAG_ATTRS[tag]?.has(attr) ?? false;
}

function checkElement(el: Element, findings: LintFinding[]): void {
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
    if (DATA_URI_RE.test(value)) {
      findings.push({ rule: 'data-uri', tag, attr, message: `data: URI in ${attr} on <${tag}> is rejected` });
      continue;
    }
    if (!isAllowedAttr(tag, attr)) {
      findings.push({ rule: 'disallowed-attribute', tag, attr, message: `attribute ${attr} on <${tag}> is not in the allowlist` });
      continue;
    }
    // attribute is allowed — value-level URL checks.
    // script-bearing schemes are a channel in ANY href (navigation or resource).
    if (attr === 'href' && SCRIPT_URI_RE.test(value)) {
      findings.push({ rule: 'disallowed-uri-scheme', tag, attr, message: `script-bearing URI scheme in ${attr} on <${tag}> is rejected` });
      continue;
    }
    // external-resource applies only to genuine resource-LOADING attrs (link href),
    // not to <a> navigation links.
    if (RESOURCE_URL_ATTRS[tag]?.has(attr) && EXTERNAL_URL_RE.test(value)) {
      findings.push({ rule: 'external-resource', tag, attr, message: `external resource URL in ${attr} on <${tag}> is rejected` });
    }
  }

  // Only the pinned sketch-kit stylesheet link is permitted; any other <link>
  // relation pulls a non-CSS resource (icon/preload/prefetch) — a polish/resource
  // channel. (The exact path+hash identity-pin is task 4.)
  if (tag === 'link') {
    const rel = (ta.getAttrList(el).find((a) => a.name.toLowerCase() === 'rel')?.value ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!rel.includes('stylesheet')) {
      findings.push({ rule: 'disallowed-link-rel', tag, message: `only rel="stylesheet" <link> is permitted; got rel="${rel.join(' ')}"` });
    }
  }
}

function walk(node: AnyNode, findings: LintFinding[]): void {
  if (ta.isElementNode(node)) {
    checkElement(node, findings);
    // <template> stows its subtree in .content — descend so nothing hides there
    if ('content' in node && node.content) {
      for (const child of node.content.childNodes) walk(child, findings);
    }
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) walk(child, findings);
  }
}

/**
 * Lint a wireframe HTML string against the element/attribute allowlist.
 * Returns all findings (does not short-circuit) so the operator sees every
 * violation in one pass.
 */
export function lintWireframe(html: string): LintResult {
  const findings: LintFinding[] = [];
  walk(parse(html), findings);
  return { ok: findings.length === 0, findings };
}
