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
import { isStylesheetRel } from '@/lint/allowlist';
import { SKETCH_KIT_CSS_PATH, SKETCH_KIT_STYLESHEET_FILENAME } from '@/wireframe-kit/sketch-kit';

type AnyNode = DefaultTreeAdapterMap['node'];

export interface StylesheetPin {
  /**
   * Absolute path the single stylesheet `<link>` href must LEXICALLY resolve to
   * (via `path.resolve(baseDir, href)` — no `realpathSync`/symlink
   * normalization). With the default {@link buildSketchKitPin} this is derived
   * from the same `baseDir` the href resolves against, so a symlinked layout
   * (worktrees, `/var`→`/private/var`) can't produce a spurious mismatch; pass
   * an explicit `canonicalPath` only when you've matched its symlink form to
   * `baseDir`'s. Content identity is anchored by the hash regardless.
   */
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
    // Same EXACT-`['stylesheet']` predicate axis-1 uses, so the two axes can't
    // disagree on what counts as a stylesheet link (AUDIT-20260606-08): a mixed
    // rel="stylesheet icon" is not a clean stylesheet and is not collected.
    const relValue = attrs.find((a) => a.name.toLowerCase() === 'rel')?.value ?? '';
    if (isStylesheetRel(relValue)) {
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
  // If the href resolves off the pinned path, the link is already known-wrong;
  // report and STOP without reading. Reading first would let an absolute or
  // `../`-escaping href pull arbitrary files off disk (AUDIT-20260606-10).
  if (resolved !== pin.canonicalPath) {
    return [{
      rule: 'stylesheet-path-mismatch',
      attr: 'href',
      message: `stylesheet href resolves to ${resolved}, not the pinned ${pin.canonicalPath}`,
    }];
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
  // SRI is STRONGEST-ALGORITHM-WINS, not any-match: when `integrity` lists
  // digests of different algorithms, the browser validates against ONLY the
  // strongest algorithm present and discards the weaker ones (W3C SRI
  // "get the strongest metadata from set"). The pin carries a sha256, so the
  // integrity meaningfully enforces our pin ONLY IF sha256 is the strongest
  // algorithm present AND the pinned digest is among its tokens. A stronger
  // sha384/sha512 token would override the sha256 in the browser, defeating the
  // pin — flag it rather than greenlight a page whose effective SRI isn't the kit
  // (AUDIT-20260606-13; corrects the earlier any-match reading in -12).
  if (link.integrity !== undefined) {
    const tokens = link.integrity.split(/\s+/).filter(Boolean);
    const hasStrongerAlgo = tokens.some((t) => /^sha(?:384|512)-/i.test(t));
    if (hasStrongerAlgo || !tokens.includes(pin.expectedHash)) {
      findings.push({
        rule: 'stylesheet-sri-mismatch',
        attr: 'integrity',
        message: hasStrongerAlgo
          ? `SRI integrity "${link.integrity}" carries a stronger-than-sha256 token that overrides the pinned ${pin.expectedHash} in the browser`
          : `SRI integrity "${link.integrity}" does not assert the pinned ${pin.expectedHash}`,
      });
    }
  }
  return findings;
}
