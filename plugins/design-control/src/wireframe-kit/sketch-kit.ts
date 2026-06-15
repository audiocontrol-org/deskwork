/**
 * Sketch-kit — the lo-fi wireframe vocabulary for design-control.
 *
 * This module is the single source of truth for:
 *   - the canonical on-disk paths of the kit's static assets (the one
 *     identity-pinnable `sketch-kit.css` stylesheet, the bundled OFL fonts, and
 *     the example wireframe),
 *   - the CLOSED `.sk-*` class vocabulary the Phase-1 allowlist lint permits,
 *   - the three adopter-selectable visual-language themes.
 *
 * Multi-theme decision (2026-06-05, operator): the kit ships THREE lo-fi visual
 * languages as adopter-selectable themes rather than one picked aesthetic. The
 * converged spec's hard invariant — exactly one identity-pinned sketch-kit
 * `<link rel=stylesheet>` — is preserved: all three themes live in the single
 * `sketch-kit.css`, selected by a `.sk-theme-*` root class. See
 * `plugins/design-control/specs/001-design-control/mockups/sketch-kit/DECISION.md`.
 *
 * The module exports DATA + PATHS only; it performs no file IO at import time.
 * Callers (the lint, the authoring skill, tests) read the assets themselves.
 */

import { fileURLToPath } from 'node:url';

/** Absolute path to the `assets/sketch-kit/` directory. Trailing slash. */
export const SKETCH_KIT_DIR = fileURLToPath(
  new URL('../../assets/sketch-kit/', import.meta.url),
);

/** The single, identity-pinnable stylesheet. */
export const SKETCH_KIT_STYLESHEET_FILENAME = 'sketch-kit.css';
export const SKETCH_KIT_CSS_PATH = fileURLToPath(
  new URL('../../assets/sketch-kit/sketch-kit.css', import.meta.url),
);

/** A canonical example wireframe that loads the kit (positive-corpus seed). */
export const SKETCH_KIT_SAMPLE_PATH = fileURLToPath(
  new URL('../../assets/sketch-kit/example-wireframe.html', import.meta.url),
);

/** Root class applied to the wireframe's `<body>`. */
export const SKETCH_KIT_ROOT_CLASS = 'sk';

/** The self-labeling banner: class + the literal label that announces lo-fi. */
export const SKETCH_KIT_BANNER_CLASS = 'sk-banner';
export const SKETCH_KIT_BANNER_LABEL = 'WIREFRAME';

/** The fixed image placeholder (rendered as a crossed box by the stylesheet). */
export const SKETCH_KIT_IMG_CLASS = 'sk-img';

/**
 * The three adopter-selectable themes. The adopter picks one by adding the
 * class to `<body>` alongside {@link SKETCH_KIT_ROOT_CLASS}.
 */
export const SKETCH_KIT_THEMES = [
  'sk-theme-marker',
  'sk-theme-blueprint',
  'sk-theme-grayscale',
] as const;
export type SketchKitTheme = (typeof SKETCH_KIT_THEMES)[number];

/** Applied when no explicit `.sk-theme-*` is set — the most neutral language. */
export const DEFAULT_SKETCH_KIT_THEME: SketchKitTheme = 'sk-theme-grayscale';

/** A bundled OFL webfont weight + the license shipped alongside it. */
export interface SketchKitFont {
  readonly family: string;
  readonly weight: number;
  /** Path to the woff2, relative to {@link SKETCH_KIT_DIR}. */
  readonly file: string;
  /** Path to the OFL license text, relative to {@link SKETCH_KIT_DIR}. */
  readonly license: string;
  /**
   * The theme whose `@font-face` loads this file (AUDIT-20260610-23): a
   * document using this theme with the font ABSENT falls through to local
   * system designed fonts (cursive/handwriting stacks), so the identity pin
   * requires the file to be present when the theme is used.
   */
  readonly theme: SketchKitTheme;
}

/**
 * Bundled fonts (aesthetic only, NOT a determinism claim). Marker → Patrick
 * Hand (hand-printed); blueprint → Space Mono (technical mono). The grayscale
 * theme intentionally uses a plain system stack and bundles no font.
 */
export const SKETCH_KIT_FONTS: readonly SketchKitFont[] = [
  {
    family: 'Patrick Hand',
    weight: 400,
    file: 'fonts/patrick-hand-400.woff2',
    license: 'fonts/patrick-hand.OFL.txt',
    theme: 'sk-theme-marker',
  },
  {
    family: 'Space Mono',
    weight: 400,
    file: 'fonts/space-mono-400.woff2',
    license: 'fonts/space-mono.OFL.txt',
    theme: 'sk-theme-blueprint',
  },
  {
    family: 'Space Mono',
    weight: 700,
    file: 'fonts/space-mono-700.woff2',
    license: 'fonts/space-mono.OFL.txt',
    theme: 'sk-theme-blueprint',
  },
];

/**
 * The CLOSED `.sk-*` class vocabulary. The Phase-1 allowlist lint permits only
 * these class tokens on wireframe markup; the example wireframe is constrained
 * to this set (asserted in tests). Adding a class here is a deliberate vocabulary
 * change, not an incidental edit.
 */
export const SK_VOCABULARY = [
  // root + themes
  SKETCH_KIT_ROOT_CLASS,
  ...SKETCH_KIT_THEMES,
  // layout
  'sk-shell',
  'sk-row',
  'sk-main',
  'sk-stats',
  'sk-actions',
  // chrome
  'sk-banner',
  'sk-header',
  'sk-logo',
  'sk-h1',
  'sk-search',
  'sk-avatar',
  'sk-nav',
  'sk-nav-item',
  'sk-current',
  'sk-foot',
  // content
  'sk-card',
  'sk-title',
  'sk-line',
  'sk-line-s',
  'sk-line-m',
  'sk-line-l',
  'sk-listrow',
  'sk-dot',
  'sk-num',
  'sk-label',
  'sk-stat',
  'sk-box',
  // image placeholder
  'sk-img',
  'sk-img-label',
  // buttons
  'sk-btn',
  'sk-btn-primary',
] as const;
export type SkClass = (typeof SK_VOCABULARY)[number];
