/**
 * Lane glyph lookup — per-template press-check glyph used in the
 * multi-lane swimlane dashboard's lane-rail row (`.r-glyph`), focus
 * chip (`.fc-glyph`), swim-head (`.glyph`), and swim-stub (`.ss-glyph`).
 *
 * The Direction-3 "Press Bay" v11 mockup expresses lane identity
 * via these glyphs (mockup lines 994 / 1000 / 1006 / 1012 / 1053 /
 * 1058 / 1063 / 1068 / 1083 / 1151 / 1160 / 1206, etc.).
 *
 * Mapping comes from the accepted brief at
 * docs/studio-design/ACCEPTED/2026-05-27-multi-lane-dashboard-d3-press-bay/.
 *
 *   editorial    → §
 *   visual       → ◆
 *   feature-doc  → ⊹
 *   qa-plan      → ⊕
 *   blog-post    → ⌘
 *
 * Unknown template ids fall through to `§` as a documented sentinel
 * (NOT a "we'll pick later" placeholder per the project's
 * `Just for now is bullshit` rule). The sentinel signals "operator
 * has authored a template the dashboard doesn't yet have a
 * mockup-mapped glyph for"; the proper fix is to contribute a glyph
 * to this mapping (or to the template's own metadata) in the same
 * pass that introduces the new template. The sentinel keeps the
 * dashboard rendering coherent while that decision is made.
 */

const LANE_GLYPHS: Record<string, string> = {
  editorial: '§',
  visual: '◆',
  'feature-doc': '⊹',
  'qa-plan': '⊕',
  'blog-post': '⌘',
};

/**
 * Sentinel glyph for template ids without a mockup-mapped entry.
 * See module docstring — this is the documented behavior, not a
 * placeholder pending future work.
 */
export const LANE_GLYPH_SENTINEL = '§';

/**
 * Look up the press-check glyph for a lane's pipeline template id.
 * Returns `LANE_GLYPH_SENTINEL` for template ids not in the mockup
 * mapping.
 */
export function laneGlyph(templateId: string): string {
  return LANE_GLYPHS[templateId] ?? LANE_GLYPH_SENTINEL;
}
