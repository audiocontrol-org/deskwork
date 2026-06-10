/**
 * Stylesheet identity-pin — axis 1.5 of the `check-mockup-lofi` lint
 * (round-8(i)). The element/attribute allowlist (axis 1) permits arbitrary
 * `class` VALUES because, under this pin, a class either binds to nothing
 * (truly inert) or to the kit's CLOSED, operator-sanctioned `.sk-*` vocabulary
 * — including the three `.sk-theme-*` lo-fi languages (AUDIT-20260610-02;
 * mockups/sketch-kit/DECISION.md). That guarantee holds ONLY while the single
 * linked stylesheet is exactly the sketch-kit CSS. This module enforces that
 * precondition: exactly one stylesheet `<link>`, resolving to the canonical
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

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parse, defaultTreeAdapter as ta } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import type { LintFinding } from '@/lint/types';
import { isStylesheetRel } from '@/lint/allowlist';
import {
  SKETCH_KIT_CSS_PATH,
  SKETCH_KIT_DIR,
  SKETCH_KIT_FONTS,
  SKETCH_KIT_STYLESHEET_FILENAME,
} from '@/wireframe-kit/sketch-kit';

type AnyNode = DefaultTreeAdapterMap['node'];

/** SRI hash algorithms, strongest first (the order the SRI spec selects by). */
export const SRI_ALGOS = ['sha512', 'sha384', 'sha256'] as const;
export type SriAlgo = (typeof SRI_ALGOS)[number];

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
  /** Expected SRI-format sha256 digest of the kit — used for the content check. */
  readonly expectedHash: string;
  /** Kit digest at EACH SRI algorithm, so a stronger-algorithm integrity can be verified. */
  readonly expectedSri: Readonly<Record<SriAlgo, string>>;
  /** Directory the wireframe's relative hrefs resolve against. */
  readonly baseDir: string;
  /**
   * Expected sha256 (SRI format) of each SHIPPED kit font, keyed by the
   * kit-relative file path the pinned CSS references via `@font-face`
   * (AUDIT-20260610-03): the pin certifies the CSS bytes, and the CSS names
   * these files, so a wireframe-side font at one of these paths must carry the
   * kit's bytes. Verified only when PRESENT — an absent font falls back to a
   * system stack (no foreign bytes load); a designed font planted at the path
   * is present-but-different and is caught.
   */
  readonly expectedFonts: ReadonlyArray<{ readonly file: string; readonly sha256: string }>;
}

/** SRI-format digest of stylesheet bytes (`<algo>-<base64>`); defaults to sha256. */
export function hashStylesheet(content: string | Buffer, algo: SriAlgo = 'sha256'): string {
  return `${algo}-` + createHash(algo).update(content).digest('base64');
}

/**
 * Build a {@link StylesheetPin} from the shipped sketch-kit.css. `baseDir` is
 * the wireframe's directory; `canonicalPath` defaults to the kit stylesheet
 * sitting next to the wireframe (the conventional adopter layout).
 */
export function buildSketchKitPin(baseDir: string, canonicalPath?: string): StylesheetPin {
  const content = readFileSync(SKETCH_KIT_CSS_PATH);
  return {
    baseDir,
    canonicalPath: canonicalPath ?? resolve(baseDir, SKETCH_KIT_STYLESHEET_FILENAME),
    expectedHash: hashStylesheet(content, 'sha256'),
    expectedSri: {
      sha256: hashStylesheet(content, 'sha256'),
      sha384: hashStylesheet(content, 'sha384'),
      sha512: hashStylesheet(content, 'sha512'),
    },
    // Same trusted source as the CSS: the plugin's SHIPPED font files
    // (AUDIT-20260610-03). Reads fail loud — a missing shipped font is a
    // broken kit install, not a skippable check.
    expectedFonts: SKETCH_KIT_FONTS.map((font) => ({
      file: font.file,
      sha256: hashStylesheet(readFileSync(join(SKETCH_KIT_DIR, font.file)), 'sha256'),
    })),
  };
}

/**
 * Normalize one SRI token (`<algo>-<base64>[?options]`) for comparison: strip a
 * trailing `?options` (browser-ignored) and lowercase ONLY the algorithm prefix
 * (ASCII-case-insensitive per SRI) while preserving the case-sensitive base64
 * payload.
 */
function normalizeSriToken(token: string): string {
  const noOptions = token.split('?')[0];
  const dash = noOptions.indexOf('-');
  if (dash < 0) return noOptions.toLowerCase();
  return noOptions.slice(0, dash).toLowerCase() + noOptions.slice(dash);
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
  // SRI is STRONGEST-ALGORITHM-WINS (W3C SRI "get the strongest metadata from
  // set"): when `integrity` lists digests of different algorithms, the browser
  // validates against ONLY the strongest algorithm present. So we determine the
  // strongest algorithm in the attribute and check that one of its tokens equals
  // the kit's digest AT THAT ALGORITHM (the pin holds the kit hash for each
  // algorithm). This accepts a legitimately-stronger pin
  // (`sha384-<kit-sha384> sha256-<kit-sha256>`) and rejects both a wrong digest
  // and an unrecognized-algorithm-only integrity (AUDIT-20260606-15; the prior
  // sha256-only guard over-rejected genuine stronger pins).
  if (link.integrity !== undefined) {
    // Normalize each token before comparison: the algorithm prefix is ASCII-
    // case-insensitive (W3C SRI), and a trailing `?options` is stripped by the
    // browser — but the base64 payload is case-sensitive, so only the prefix is
    // lowercased (AUDIT-20260606-18 case, -19 options).
    const tokens = link.integrity.split(/\s+/).filter(Boolean).map(normalizeSriToken);
    const strongest = SRI_ALGOS.find((algo) => tokens.some((t) => t.startsWith(`${algo}-`)));
    if (!strongest) {
      findings.push({
        rule: 'stylesheet-sri-mismatch',
        attr: 'integrity',
        message: `SRI integrity "${link.integrity}" carries no recognized sha256/sha384/sha512 digest`,
      });
    } else {
      const strongestTokens = tokens.filter((t) => t.startsWith(`${strongest}-`));
      if (!strongestTokens.includes(pin.expectedSri[strongest])) {
        findings.push({
          rule: 'stylesheet-sri-mismatch',
          attr: 'integrity',
          message: `SRI integrity's ${strongest} digest does not match the kit (${pin.expectedSri[strongest]})`,
        });
      }
    }
  }

  // Transitive font pinning (AUDIT-20260610-03): the pinned CSS names the kit's
  // @font-face files; any file PRESENT at one of those baseDir-relative paths
  // must carry the shipped kit's bytes. Absent files are clean (the browser
  // falls back; no foreign bytes load) — a swapped designed font is
  // present-but-different and is rejected here.
  for (const font of pin.expectedFonts) {
    const fontPath = resolve(pin.baseDir, font.file);
    if (!existsSync(fontPath)) continue;
    const actual = hashStylesheet(readFileSync(fontPath), 'sha256');
    if (actual !== font.sha256) {
      findings.push({
        rule: 'font-hash-mismatch',
        message: `kit font ${font.file} does not match the shipped kit bytes (a swapped font renders designed typography under a green pin)`,
      });
    }
  }
  return findings;
}
