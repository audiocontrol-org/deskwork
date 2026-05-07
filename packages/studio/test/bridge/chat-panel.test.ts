/**
 * @vitest-environment jsdom
 *
 * jsdom tests for the ChatPanel orchestrator. Scope: deterministic
 * paths only — constructor invariants, prefillInput append-with-newline
 * contract, destroy() idempotence, and the four input-enable
 * transitions driven by applyBridgeState.
 *
 * The EventSource subscription, scroll stickiness, and history fetch
 * are covered by the local end-to-end smoke (Phase 8). jsdom doesn't
 * implement EventSource and the constructor needs a stub to construct.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChatPanel } from '../../../../plugins/deskwork-studio/public/src/chat-panel';
import type { BridgeState } from '../../../../plugins/deskwork-studio/public/src/chat-renderer';

interface FetchStub {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

class FakeEventSource {
  readonly url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(): void {}
  close(): void {
    this.closed = true;
  }
}

const originalFetch = globalThis.fetch;
const originalEventSource = globalThis.EventSource;

interface StubGlobal {
  fetch: FetchStub;
  EventSource: typeof FakeEventSource;
}

function stubGlobals(target: Record<string, unknown>, values: StubGlobal): void {
  target.fetch = values.fetch;
  target.EventSource = values.EventSource;
}

function installStubs(): void {
  const fetchStub: FetchStub = async (input) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : input.url;
    if (url.includes('/api/chat/history')) {
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/api/chat/state')) {
      const state: BridgeState = {
        mcpConnected: false,
        listenModeOn: false,
        awaitingMessage: false,
      };
      return new Response(JSON.stringify(state), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };
  // In jsdom, globalThis and window are both "the same object" but
  // some reads bind through window only — assigning to both is the
  // safe way for both the bare-identifier `new EventSource()` lookup
  // and `globalThis.fetch` calls in the transport module.
  const stubs: StubGlobal = { fetch: fetchStub, EventSource: FakeEventSource };
  stubGlobals(globalThis as unknown as Record<string, unknown>, stubs);
  if (typeof window !== 'undefined') {
    stubGlobals(window as unknown as Record<string, unknown>, stubs);
  }
  // jsdom does not implement scrollIntoView; the panel calls it from
  // prefillInput when not in full-page mode. Stub on the prototype so
  // any element created during the test has it.
  if (!('scrollIntoView' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: () => {},
    });
  }
}

function restoreStubs(): void {
  if (originalFetch === undefined) {
    delete (globalThis as unknown as Record<string, unknown>).fetch;
  } else {
    (globalThis as unknown as Record<string, unknown>).fetch = originalFetch;
  }
  if (originalEventSource === undefined) {
    delete (globalThis as unknown as Record<string, unknown>).EventSource;
  } else {
    (globalThis as unknown as Record<string, unknown>).EventSource = originalEventSource;
  }
}

function setProjectRoot(root: string): void {
  document.body.dataset.projectRoot = root;
}

function clearProjectRoot(): void {
  delete document.body.dataset.projectRoot;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.localStorage.clear();
  installStubs();
});

afterEach(() => {
  restoreStubs();
});

describe('ChatPanel — constructor validation', () => {
  it('mounts successfully when given a valid HTMLElement and projectRoot', () => {
    setProjectRoot('/tmp/project-a');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = new ChatPanel(parent);
    expect(parent.querySelector('[data-chat-panel]')).toBeTruthy();
    panel.destroy();
  });

  it('throws when document.body has no data-project-root', () => {
    clearProjectRoot();
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    expect(() => new ChatPanel(parent)).toThrow(/data-project-root/);
  });

  it('throws when data-project-root is empty string', () => {
    setProjectRoot('');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    expect(() => new ChatPanel(parent)).toThrow(/data-project-root/);
  });
});

describe('ChatPanel — prefillInput append-with-newline contract', () => {
  it('sets the textarea to text when textarea is empty', () => {
    setProjectRoot('/tmp/project-prefill-empty');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = new ChatPanel(parent);
    panel.prefillInput('foo');
    const ta = parent.querySelector('textarea.chat-textarea');
    expect(ta).toBeTruthy();
    if (!(ta instanceof HTMLTextAreaElement)) throw new Error('expected textarea');
    expect(ta.value).toBe('foo');
    expect(window.localStorage.getItem('chat-draft:/tmp/project-prefill-empty')).toBe('foo');
    panel.destroy();
  });

  it('appends with two newlines when textarea already has content', () => {
    setProjectRoot('/tmp/project-prefill-append');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = new ChatPanel(parent);
    panel.prefillInput('foo');
    panel.prefillInput('bar');
    const ta = parent.querySelector('textarea.chat-textarea');
    if (!(ta instanceof HTMLTextAreaElement)) throw new Error('expected textarea');
    expect(ta.value).toBe('foo\n\nbar');
    expect(window.localStorage.getItem('chat-draft:/tmp/project-prefill-append')).toBe('foo\n\nbar');
    panel.destroy();
  });
});

describe('ChatPanel — destroy is idempotent', () => {
  it('does not throw when destroy() is called twice', () => {
    setProjectRoot('/tmp/project-destroy');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = new ChatPanel(parent);
    panel.destroy();
    expect(() => panel.destroy()).not.toThrow();
  });
});

describe('ChatPanel — input-enable transitions on bridge-state', () => {
  function makeMounted(): { panel: ChatPanel; parent: HTMLElement } {
    setProjectRoot('/tmp/project-bridge-state');
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = new ChatPanel(parent);
    return { panel, parent };
  }

  function findSend(parent: HTMLElement): HTMLButtonElement {
    const el = parent.querySelector('button.chat-send');
    if (!(el instanceof HTMLButtonElement)) throw new Error('expected send button');
    return el;
  }

  function findTextarea(parent: HTMLElement): HTMLTextAreaElement {
    const el = parent.querySelector('textarea.chat-textarea');
    if (!(el instanceof HTMLTextAreaElement)) throw new Error('expected textarea');
    return el;
  }

  it('disables and titles "bridge offline" when mcpConnected=false', () => {
    const { panel, parent } = makeMounted();
    panel.applyBridgeState({
      mcpConnected: false,
      listenModeOn: false,
      awaitingMessage: false,
    });
    const send = findSend(parent);
    const ta = findTextarea(parent);
    expect(send.disabled).toBe(true);
    expect(ta.disabled).toBe(true);
    expect(send.title).toMatch(/Bridge offline/);
    expect(ta.title).toMatch(/Bridge offline/);
    panel.destroy();
  });

  it('disables and titles "not listening" when connected but listenModeOn=false', () => {
    const { panel, parent } = makeMounted();
    panel.applyBridgeState({
      mcpConnected: true,
      listenModeOn: false,
      awaitingMessage: false,
    });
    const send = findSend(parent);
    expect(send.disabled).toBe(true);
    expect(send.title).toMatch(/not listening/);
    panel.destroy();
  });

  it('enables and clears title when connected and listening', () => {
    const { panel, parent } = makeMounted();
    panel.applyBridgeState({
      mcpConnected: true,
      listenModeOn: true,
      awaitingMessage: false,
    });
    const send = findSend(parent);
    const ta = findTextarea(parent);
    expect(send.disabled).toBe(false);
    expect(ta.disabled).toBe(false);
    expect(send.hasAttribute('title')).toBe(false);
    expect(ta.hasAttribute('title')).toBe(false);
    panel.destroy();
  });

  it('stays enabled when listening with awaitingMessage', () => {
    const { panel, parent } = makeMounted();
    panel.applyBridgeState({
      mcpConnected: true,
      listenModeOn: true,
      awaitingMessage: true,
    });
    const send = findSend(parent);
    expect(send.disabled).toBe(false);
    expect(send.hasAttribute('title')).toBe(false);
    panel.destroy();
  });
});

// Phase 9a — stowable chat panel. Verifies the collapsed-by-default
// behavior at phone width, the toggle handlers (paired affordance:
// chevron-up on the strip + chevron-down in the header), keyboard
// shortcuts, and localStorage round-trip across simulated refresh.
//
// jsdom doesn't paint, so we drive viewport size via window.innerWidth
// (the panel's applyMobileClass falls back to it when the parent has
// clientWidth === 0, which is the case for an unattached/zero-layout
// element in jsdom). resize events trigger re-evaluation.

describe('ChatPanel — Phase 9a stowable collapse behavior', () => {
  const originalInnerWidth = window.innerWidth;

  function setViewportWidth(px: number): void {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: px,
    });
    window.dispatchEvent(new Event('resize'));
  }

  function restoreViewportWidth(): void {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: originalInnerWidth,
    });
  }

  function findRoot(parent: HTMLElement): HTMLElement {
    const el = parent.querySelector('[data-chat-panel]');
    if (!(el instanceof HTMLElement)) throw new Error('expected chat-panel root');
    return el;
  }

  function findCollapseToggle(parent: HTMLElement): HTMLButtonElement {
    const el = parent.querySelector('button.chat-collapse-toggle');
    if (!(el instanceof HTMLButtonElement)) throw new Error('expected collapse toggle');
    return el;
  }

  function findStowToggle(parent: HTMLElement): HTMLButtonElement {
    const el = parent.querySelector('button.chat-stow-toggle');
    if (!(el instanceof HTMLButtonElement)) throw new Error('expected stow toggle');
    return el;
  }

  function mountAtPhoneWidth(projectRoot: string): {
    panel: ChatPanel;
    parent: HTMLElement;
  } {
    setViewportWidth(390);
    document.body.dataset.projectRoot = projectRoot;
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = new ChatPanel(parent);
    return { panel, parent };
  }

  afterEach(() => {
    restoreViewportWidth();
  });

  it('defaults to collapsed at phone width (<600px) on first visit', () => {
    const { panel, parent } = mountAtPhoneWidth('/tmp/project-collapse-default');
    const root = findRoot(parent);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(true);
    expect(root.classList.contains('chat-panel--mobile-full')).toBe(true);
    // localStorage should now reflect the resolved default so refresh
    // restores the same state.
    expect(window.localStorage.getItem('chat-panel-stow:/tmp/project-collapse-default'))
      .toBe('collapsed');
    panel.destroy();
  });

  it('chevron-up tap expands the panel; chevron-down tap collapses', () => {
    const { panel, parent } = mountAtPhoneWidth('/tmp/project-toggle-clicks');
    const root = findRoot(parent);
    const collapseToggle = findCollapseToggle(parent);
    const stowToggle = findStowToggle(parent);

    expect(root.classList.contains('chat-panel--collapsed')).toBe(true);
    expect(collapseToggle.getAttribute('aria-pressed')).toBe('false');

    collapseToggle.click();
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);
    expect(collapseToggle.getAttribute('aria-pressed')).toBe('true');
    expect(stowToggle.getAttribute('aria-pressed')).toBe('true');

    stowToggle.click();
    expect(root.classList.contains('chat-panel--collapsed')).toBe(true);
    expect(collapseToggle.getAttribute('aria-pressed')).toBe('false');
    expect(stowToggle.getAttribute('aria-pressed')).toBe('false');

    panel.destroy();
  });

  it('Shift+C toggles the collapsed state', () => {
    const { panel, parent } = mountAtPhoneWidth('/tmp/project-shiftc');
    const root = findRoot(parent);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(true);

    const ev1 = new KeyboardEvent('keydown', { key: 'C', shiftKey: true });
    window.dispatchEvent(ev1);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);

    const ev2 = new KeyboardEvent('keydown', { key: 'C', shiftKey: true });
    window.dispatchEvent(ev2);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(true);

    panel.destroy();
  });

  it('Esc collapses an expanded panel', () => {
    const { panel, parent } = mountAtPhoneWidth('/tmp/project-esc');
    const root = findRoot(parent);
    const collapseToggle = findCollapseToggle(parent);
    collapseToggle.click();
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);

    const ev = new KeyboardEvent('keydown', { key: 'Escape' });
    window.dispatchEvent(ev);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(true);

    panel.destroy();
  });

  it('Shift+C is ignored while typing in the textarea', () => {
    const { panel, parent } = mountAtPhoneWidth('/tmp/project-shiftc-typing');
    // Expand first, so the textarea is reachable in jsdom (it's
    // display:none when collapsed via CSS, but jsdom doesn't apply CSS).
    const collapseToggle = findCollapseToggle(parent);
    collapseToggle.click();
    const root = findRoot(parent);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);

    const ta = parent.querySelector('textarea.chat-textarea');
    if (!(ta instanceof HTMLTextAreaElement)) throw new Error('expected textarea');
    ta.focus();
    const ev = new KeyboardEvent('keydown', {
      key: 'C',
      shiftKey: true,
      bubbles: true,
    });
    ta.dispatchEvent(ev);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);

    panel.destroy();
  });

  it('localStorage round-trips state across simulated refresh', () => {
    const root1 = mountAtPhoneWidth('/tmp/project-roundtrip');
    findCollapseToggle(root1.parent).click();
    expect(window.localStorage.getItem('chat-panel-stow:/tmp/project-roundtrip'))
      .toBe('expanded');
    root1.panel.destroy();
    document.body.innerHTML = '';

    // Simulated refresh: same project root, fresh mount, same width.
    document.body.dataset.projectRoot = '/tmp/project-roundtrip';
    const parent2 = document.createElement('div');
    document.body.appendChild(parent2);
    const panel2 = new ChatPanel(parent2);
    const root = findRoot(parent2);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);
    panel2.destroy();
  });

  it('does not add chat-panel--collapsed at desktop width', () => {
    setViewportWidth(1024);
    document.body.dataset.projectRoot = '/tmp/project-desktop';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = new ChatPanel(parent);
    const root = findRoot(parent);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);
    expect(root.classList.contains('chat-panel--mobile-full')).toBe(false);
    panel.destroy();
  });

  it('fullPage panels (/dev/chat) ignore the collapse model', () => {
    setViewportWidth(390);
    document.body.dataset.projectRoot = '/tmp/project-fullpage';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const panel = new ChatPanel(parent, { fullPage: true });
    const root = findRoot(parent);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);
    expect(root.classList.contains('chat-panel--full')).toBe(true);
    // Shift+C must not toggle on a full-page surface.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', shiftKey: true }));
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);
    panel.destroy();
  });

  it('updates both header chip and strip chip on bridge-state change', () => {
    const { panel, parent } = mountAtPhoneWidth('/tmp/project-chip-update');
    panel.applyBridgeState({
      mcpConnected: true,
      listenModeOn: true,
      awaitingMessage: false,
    });
    const headerChip = parent.querySelector('.chat-header-chip');
    const stripChip = parent.querySelector('.chat-strip-chip');
    expect(headerChip?.querySelector('.chat-state-chip--listening')).toBeTruthy();
    expect(stripChip?.querySelector('.chat-state-chip--listening')).toBeTruthy();
    panel.destroy();
  });

  it('prefillInput auto-expands a collapsed phone-width panel', () => {
    const { panel, parent } = mountAtPhoneWidth('/tmp/project-prefill-expand');
    const root = findRoot(parent);
    expect(root.classList.contains('chat-panel--collapsed')).toBe(true);
    panel.prefillInput('approve foo');
    expect(root.classList.contains('chat-panel--collapsed')).toBe(false);
    panel.destroy();
  });

  it('does not redundantly write localStorage on consecutive phone-width resizes', () => {
    const { panel } = mountAtPhoneWidth('/tmp/project-resize-noop');
    const key = 'chat-panel-stow:/tmp/project-resize-noop';
    // Mount already wrote the resolved default ("collapsed") once.
    expect(window.localStorage.getItem(key)).toBe('collapsed');
    // Spy on setItem and fire two more phone-width resize events. The
    // breakpoint state hasn't changed (already phone), so neither
    // resize should re-write the store.
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    setViewportWidth(380);
    setViewportWidth(360);
    const writes = setItemSpy.mock.calls.filter(([k]) => k === key);
    expect(writes.length).toBe(0);
    setItemSpy.mockRestore();
    panel.destroy();
  });
});
