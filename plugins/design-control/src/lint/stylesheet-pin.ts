/**
 * Stylesheet identity-pin — axis 1.5 of the `check-mockup-lofi` lint
 * (round-8(i)). The element/attribute allowlist (axis 1) permits arbitrary
 * `class` VALUES because they are inert; that inertness holds ONLY while the
 * single linked stylesheet is exactly the sketch-kit CSS. This module enforces
 * that precondition: exactly one stylesheet `<link>`, resolving to the canonical
 * path, whose CONTENT hash matches the pinned sketch-kit.css — "not merely at
 * most one stylesheet."
 *
 * Identity is verified by CONTENT (a sha256 of the resolved file) so a renamed
 * or relocated copy still passes as long as its bytes are the kit's; the path
 * check additionally ensures the link points where the wireframe expects. An
 * optional SRI `integrity` attribute, when present, must also match.
 *
 * Filesystem access lives here (not in the pure axis-1 lint) and is opt-in: the
 * lint only performs the identity check when a caller supplies a `StylesheetPin`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parse, defaultTreeAdapter as ta } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { LintFinding } from '@/lint/types';
import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_STYLESHEET_FILENAME } from '@/wireframe-kit/sketch-kit';

type AnyNode = DefaultTreeAdapterMap['node'];

export interface StylesheetPin {
  /** Absolute path the single stylesheet `<link>` href must resolve to. */
  readonly canonicalPath: string;
  /** Expected SRI-format content hash (`sha256-<base64>`) of that stylesheet. */
  readonly expectedHash: string;
  /** Directory the wireframe's relative hrefs resolve against. */
  readonly baseDir: string;
}

/** SRI-format sha256 digest of stylesheet bytes (`sha256-<base64>`). */
export function hashStylesheet(content: string | Buffer): string {
  return 'sha256-' + createHash('sha256').update(content).digest('base64');
}

/**
 * Build a {@link StylesheetPin} from the shipped sketch-kit.css. `baseDir` is
 * the wireframe's directory; `canonicalPath` defaults to the kit stylesheet
 * sitting next to the wireframe (the conventional adopter layout).
 */
export function buildSketchKitPin(baseDir: string, canonicalPath?: string): StylesheetPin {
  return {
    baseDir,
    canonicalPath: canonicalPath ?? resolve(baseDir, SKETCH_KIT_STYLESHEET_FILENAME),
    expectedHash: hashStylesheet(readFileSync(SKETCH_KIT_CSS_PATH)),
  };
}

interface StylesheetLink {
  readonly href: string;
  readonly integrity: string | undefined;
}

function collectStylesheetLinks(node: AnyNode, out: StylesheetLink[]): void {
  if (ta.isElementNode(node) && ta.getTagName(node).toLowerCase() === 'link') {
    const attrs = ta.getAttrList(node);
    const rel = (attrs.find((a) => a.name.toLowerCase() === 'rel')?.value ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (rel.includes('stylesheet')) {
      out.push({
        href: attrs.find((a) => a.name.toLowerCase() === 'href')?.value ?? '',
        integrity: attrs.find((a) => a.name.toLowerCase() === 'integrity')?.value,
      });
    }
  }
  if ('childNodes' in node) {
    for (const child of node.childNodes) collectStylesheetLinks(child, out);
  }
}

/**
 * Verify the wireframe links exactly one stylesheet and that it IS the pinned
 * sketch-kit.css (canonical path + content hash, plus SRI when present).
 */
export function checkStylesheetIdentity(html: string, pin: StylesheetPin): LintFinding[] {
  const links: StylesheetLink[] = [];
  collectStylesheetLinks(parse(html), links);

  if (links.length === 0) {
    return [{ rule: 'stylesheet-missing', message: 'no sketch-kit stylesheet <link> found' }];
  }
  if (links.length > 1) {
    return [{
      rule: 'stylesheet-not-singleton',
      message: `exactly one stylesheet <link> is permitted; found ${links.length}`,
    }];
  }

  const findings: LintFinding[] = [];
  const link = links[0];
  const resolved = resolve(pin.baseDir, link.href);
  if (resolved !== pin.canonicalPath) {
    findings.push({
      rule: 'stylesheet-path-mismatch',
      attr: 'href',
      message: `stylesheet href resolves to ${resolved}, not the pinned ${pin.canonicalPath}`,
    });
  }

  let content: Buffer;
  try {
    content = readFileSync(resolved);
  } catch {
    findings.push({
      rule: 'stylesheet-unresolvable',
      attr: 'href',
      message: `stylesheet href ${link.href} does not resolve to a readable file at ${resolved}`,
    });
    return findings;
  }

  const actualHash = hashStylesheet(content);
  if (actualHash !== pin.expectedHash) {
    findings.push({
      rule: 'stylesheet-hash-mismatch',
      message: `stylesheet content hash ${actualHash} does not match the pinned ${pin.expectedHash}`,
    });
  }
  if (link.integrity !== undefined && link.integrity !== pin.expectedHash) {
    findings.push({
      rule: 'stylesheet-sri-mismatch',
      attr: 'integrity',
      message: `SRI integrity ${link.integrity} does not match the pinned ${pin.expectedHash}`,
    });
  }
  return findings;
}
