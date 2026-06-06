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
} from '@/lint/allowlist';

export { ALLOWED_TAGS } from '@/lint/allowlist';
export type { LintRule, LintFinding, LintResult } from '@/lint/types';

import type { LintFinding, LintResult } from '@/lint/types';
import { checkStylesheetIdentity, type StylesheetPin } from '@/lint/stylesheet-pin';

type AnyNode = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];

export interface LintOptions {
  /**
   * When supplied, additionally enforce the stylesheet identity-pin (axis 1.5):
   * exactly one stylesheet `<link>`, resolving to the canonical path, whose
   * content hash matches the pinned sketch-kit.css. Omit for the pure,
   * filesystem-free element/attribute lint (axis 1 only).
   */
  readonly stylesheetPin?: StylesheetPin;
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

  // Only the pinned sketch-kit stylesheet link is permitted. The rel token set
  // must be EXACTLY ['stylesheet'] — a mixed rel like "stylesheet icon" still
  // pulls a non-CSS resource (AUDIT-20260606-02/codex-01). The exact path+hash
  // identity-pin is task 4.
  if (tag === 'link') {
    const rel = (ta.getAttrList(el).find((a) => a.name.toLowerCase() === 'rel')?.value ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (rel.length !== 1 || rel[0] !== 'stylesheet') {
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
export function lintWireframe(html: string, options?: LintOptions): LintResult {
  const findings: LintFinding[] = [];
  walk(parse(html), findings);
  if (options?.stylesheetPin) {
    findings.push(...checkStylesheetIdentity(html, options.stylesheetPin));
  }
  return { ok: findings.length === 0, findings };
}
