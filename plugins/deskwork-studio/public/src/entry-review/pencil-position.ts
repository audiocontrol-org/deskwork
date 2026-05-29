/**
 * Mark-pencil placement for the selection → margin-note flow (#236).
 *
 * On fine-pointer surfaces (desktop), the pencil sits above the selection
 * — same shape since the surface was first built. The eye is already at
 * the selected text; the pencil hovers right above the line and the
 * cursor travels a few pixels to click it.
 *
 * On coarse-pointer surfaces (iOS Safari, Android Chrome on phone), the
 * OS itself owns the space directly above a selection — that's where the
 * native selection callout (Copy / Find Selection / Look Up / Share)
 * renders, and there's no API to suppress it. Anything we put above the
 * selection collides with the OS callout, which wins the hit test. We
 * flip the pencil below the selection's bottom edge so it sits in the
 * one safe lane.
 *
 * Pure helper so the placement math stays unit-testable and the both-branches
 * contract is pinned by `pencil-position.test.ts`.
 */

export interface PencilPositionInput {
  /** The selection's bounding rect in viewport coordinates. */
  rect: { top: number; bottom: number; left: number; width: number };
  /** The pencil's offsetParent's bounding rect in viewport coordinates. */
  parentRect: { top: number; left: number };
  /** The pencil's rendered height in pixels. */
  btnHeight: number;
  /** True on coarse-pointer devices (touch-primary phones / tablets). */
  isCoarse: boolean;
  /** Optional gap between selection edge and pencil; defaults to 14px. */
  gap?: number;
}

export interface PencilPosition {
  /** CSS `top` value (px) relative to the offsetParent. */
  top: number;
  /** CSS `left` value (px) relative to the offsetParent. */
  left: number;
}

export function computeMarkPencilPosition(input: PencilPositionInput): PencilPosition {
  const { rect, parentRect, btnHeight, isCoarse } = input;
  const gap = input.gap ?? 14;
  const top = isCoarse
    ? rect.bottom - parentRect.top + gap
    : rect.top - parentRect.top - btnHeight - gap;
  const left = rect.left - parentRect.left + rect.width / 2;
  return { top, left };
}
