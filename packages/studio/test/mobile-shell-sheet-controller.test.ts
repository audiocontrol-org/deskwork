/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSlideUpSheet } from '../../../plugins/deskwork-studio/public/src/mobile-shell/sheet-controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElements(): {
  sheetEl: HTMLElement;
  handleEl: HTMLElement;
  closeBtnEl: HTMLButtonElement;
  scrimEl: HTMLElement;
} {
  const sheetEl = document.createElement('div');
  sheetEl.dataset.testSheet = '';

  const handleEl = document.createElement('div');
  handleEl.dataset.testHandle = '';
  sheetEl.appendChild(handleEl);

  const closeBtnEl = document.createElement('button');
  closeBtnEl.dataset.testClose = '';
  sheetEl.appendChild(closeBtnEl);

  const scrimEl = document.createElement('div');
  scrimEl.dataset.testScrim = '';
  sheetEl.appendChild(scrimEl);

  document.body.appendChild(sheetEl);
  return { sheetEl, handleEl, closeBtnEl, scrimEl };
}

function makeTouchEvent(type: string, clientY: number): TouchEvent {
  const touch = {
    clientY,
    clientX: 0,
    identifier: 0,
    target: document.body,
    pageX: 0,
    pageY: clientY,
    screenX: 0,
    screenY: clientY,
    force: 1,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
  } as unknown as Touch;
  return new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
    targetTouches: type === 'touchend' ? [] : [touch],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSlideUpSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Remove any leftover body attributes from previous tests
    for (const attr of Array.from(document.body.attributes)) {
      document.body.removeAttribute(attr.name);
    }
    // Clean up document-level listeners by replacing body (resets listeners
    // attached to document). We use vi.restoreAllMocks instead so we don't
    // have to manipulate the DOM.
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // API surface
  // -------------------------------------------------------------------------

  it('returns a controller with open, close, isOpen methods', () => {
    const { sheetEl } = makeElements();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open' });
    expect(typeof ctrl.open).toBe('function');
    expect(typeof ctrl.close).toBe('function');
    expect(typeof ctrl.isOpen).toBe('function');
  });

  // -------------------------------------------------------------------------
  // open / close / isOpen
  // -------------------------------------------------------------------------

  it('isOpen() returns false before open() is called', () => {
    const { sheetEl } = makeElements();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open' });
    expect(ctrl.isOpen()).toBe(false);
  });

  it('open() sets bodyOpenAttr on <body>', () => {
    const { sheetEl } = makeElements();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open' });
    ctrl.open();
    expect(document.body.hasAttribute('data-test-open')).toBe(true);
    expect(ctrl.isOpen()).toBe(true);
  });

  it('close() removes bodyOpenAttr from <body>', () => {
    const { sheetEl } = makeElements();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open' });
    ctrl.open();
    ctrl.close();
    expect(document.body.hasAttribute('data-test-open')).toBe(false);
    expect(ctrl.isOpen()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // onClose semantics
  // -------------------------------------------------------------------------

  it('close() calls onClose once after open → close sequence', () => {
    const { sheetEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open', onClose });
    ctrl.open();
    ctrl.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('close() when already closed is a no-op — onClose NOT called', () => {
    const { sheetEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open', onClose });
    // Never opened — closing is a no-op
    ctrl.close();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calling close() twice only triggers onClose once', () => {
    const { sheetEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open', onClose });
    ctrl.open();
    ctrl.close();
    ctrl.close(); // second close: already closed
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // closeBtnEl
  // -------------------------------------------------------------------------

  it('clicking closeBtnEl closes the sheet and calls onClose', () => {
    const { sheetEl, closeBtnEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      closeBtnEl,
      onClose,
    });
    ctrl.open();
    closeBtnEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ctrl.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking closeBtnEl when sheet is already closed is a no-op', () => {
    const { sheetEl, closeBtnEl } = makeElements();
    const onClose = vi.fn();
    createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      closeBtnEl,
      onClose,
    });
    // Never opened — click on close button should not trigger onClose
    closeBtnEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // scrimEl
  // -------------------------------------------------------------------------

  it('clicking scrimEl closes the sheet and calls onClose', () => {
    const { sheetEl, scrimEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      scrimEl,
      onClose,
    });
    ctrl.open();
    scrimEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ctrl.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Escape key
  // -------------------------------------------------------------------------

  it('pressing Escape on document closes the sheet when open', () => {
    const { sheetEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open', onClose });
    ctrl.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ctrl.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pressing Escape when sheet is closed is a no-op', () => {
    const { sheetEl } = makeElements();
    const onClose = vi.fn();
    createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open', onClose });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Drag-to-dismiss — mouse path
  // -------------------------------------------------------------------------

  it('drag handle past dragDismissPx via mouse events dismisses the sheet', () => {
    const { sheetEl, handleEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      handleEl,
      dragDismissPx: 80,
      onClose,
    });
    ctrl.open();

    handleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 200 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 200 }));

    expect(ctrl.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drag handle but release before dragDismissPx via mouse events does NOT dismiss', () => {
    const { sheetEl, handleEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      handleEl,
      dragDismissPx: 80,
      onClose,
    });
    ctrl.open();

    // Only 40px drag — below the 80px threshold
    handleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 140 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 140 }));

    expect(ctrl.isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Drag-to-dismiss — touch path
  // -------------------------------------------------------------------------

  it('drag handle past dragDismissPx via touch events dismisses the sheet', () => {
    const { sheetEl, handleEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      handleEl,
      dragDismissPx: 80,
      onClose,
    });
    ctrl.open();

    handleEl.dispatchEvent(makeTouchEvent('touchstart', 100));
    handleEl.dispatchEvent(makeTouchEvent('touchmove', 200));
    handleEl.dispatchEvent(makeTouchEvent('touchend', 200));

    expect(ctrl.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('drag handle but release before dragDismissPx via touch events does NOT dismiss', () => {
    const { sheetEl, handleEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      handleEl,
      dragDismissPx: 80,
      onClose,
    });
    ctrl.open();

    // Only 40px drag — below the 80px threshold
    handleEl.dispatchEvent(makeTouchEvent('touchstart', 100));
    handleEl.dispatchEvent(makeTouchEvent('touchmove', 140));
    handleEl.dispatchEvent(makeTouchEvent('touchend', 140));

    expect(ctrl.isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Default constants
  // -------------------------------------------------------------------------

  it('default dragDismissPx is 80: drag exactly 80px does NOT dismiss (threshold is strictly >)', () => {
    const { sheetEl, handleEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      handleEl,
      onClose,
      // dragDismissPx not specified — should default to 80
    });
    ctrl.open();

    // Exactly 80px: should NOT dismiss (> 80, not >= 80)
    handleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 180 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 180 }));

    expect(ctrl.isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('default dragDismissPx is 80: drag 81px DOES dismiss', () => {
    const { sheetEl, handleEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({
      sheetEl,
      bodyOpenAttr: 'data-test-open',
      handleEl,
      onClose,
    });
    ctrl.open();

    handleEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 181 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientY: 181 }));

    expect(ctrl.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Optional elements absent
  // -------------------------------------------------------------------------

  it('works without optional elements (no handle, no closeBtn, no scrim)', () => {
    const { sheetEl } = makeElements();
    const onClose = vi.fn();
    const ctrl = createSlideUpSheet({ sheetEl, bodyOpenAttr: 'data-test-open', onClose });
    ctrl.open();
    expect(ctrl.isOpen()).toBe(true);
    ctrl.close();
    expect(ctrl.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
