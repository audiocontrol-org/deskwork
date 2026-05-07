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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
