import { describe, expect, it } from 'vitest';
import { computeMarkPencilPosition } from '../../../plugins/deskwork-studio/public/src/entry-review/pencil-position';

/**
 * Pins both branches of the Mark-pencil placement (#236).
 *
 * Fine-pointer (desktop): pencil above the selection's top edge.
 * Coarse-pointer (iOS / Android touch): pencil below the selection's
 * bottom edge — only safe lane, since iOS Safari's native selection
 * callout owns the space directly above a selection.
 */

const RECT = { top: 200, bottom: 220, left: 100, width: 60 };
const PARENT = { top: 50, left: 80 };
const BTN_HEIGHT = 32;

describe('computeMarkPencilPosition', () => {
  it('places the pencil above the selection on fine-pointer surfaces', () => {
    const { top, left } = computeMarkPencilPosition({
      rect: RECT,
      parentRect: PARENT,
      btnHeight: BTN_HEIGHT,
      isCoarse: false,
    });
    // 200 - 50 - 32 - 14 = 104
    expect(top).toBe(104);
    // 100 - 80 + 60/2 = 50
    expect(left).toBe(50);
  });

  it('places the pencil below the selection on coarse-pointer surfaces', () => {
    const { top } = computeMarkPencilPosition({
      rect: RECT,
      parentRect: PARENT,
      btnHeight: BTN_HEIGHT,
      isCoarse: true,
    });
    // 220 - 50 + 14 = 184
    expect(top).toBe(184);
  });

  it('coarse-pointer top is strictly below selection bottom (the iOS-callout-clear invariant)', () => {
    const { top } = computeMarkPencilPosition({
      rect: RECT,
      parentRect: PARENT,
      btnHeight: BTN_HEIGHT,
      isCoarse: true,
    });
    const selectionBottomInParentCoords = RECT.bottom - PARENT.top;
    expect(top).toBeGreaterThan(selectionBottomInParentCoords);
  });

  it('honors a custom gap', () => {
    const fine = computeMarkPencilPosition({
      rect: RECT,
      parentRect: PARENT,
      btnHeight: BTN_HEIGHT,
      isCoarse: false,
      gap: 4,
    });
    expect(fine.top).toBe(200 - 50 - 32 - 4);

    const coarse = computeMarkPencilPosition({
      rect: RECT,
      parentRect: PARENT,
      btnHeight: BTN_HEIGHT,
      isCoarse: true,
      gap: 4,
    });
    expect(coarse.top).toBe(220 - 50 + 4);
  });

  it('left is independent of pointer mode (pencil stays centered on selection horizontally)', () => {
    const fine = computeMarkPencilPosition({
      rect: RECT,
      parentRect: PARENT,
      btnHeight: BTN_HEIGHT,
      isCoarse: false,
    });
    const coarse = computeMarkPencilPosition({
      rect: RECT,
      parentRect: PARENT,
      btnHeight: BTN_HEIGHT,
      isCoarse: true,
    });
    expect(fine.left).toBe(coarse.left);
  });
});
