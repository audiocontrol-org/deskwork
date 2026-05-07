/**
 * @vitest-environment jsdom
 *
 * jsdom tests for `dispatchToAgent` — the routing helper that pre-fills
 * the docked chat panel when the bridge is live and falls through to
 * `copyOrShowFallback` otherwise. The test pins the four-way decision
 * matrix:
 *
 *   - bridge live + panel mounted → panel.prefillInput, routed='panel'
 *   - bridge offline (mcpConnected=false) → clipboard, routed='clipboard'
 *   - bridge connected but listenModeOn=false → clipboard
 *   - state endpoint 5xx → clipboard
 *   - state endpoint network error → clipboard
 *   - panel not mounted (window.deskworkChatPanel undefined) → clipboard
 *
 * `copyOrShowFallback` is mocked via `vi.mock` so the test asserts on
 * the call shape (text + options forwarding) rather than mounting a
 * real DOM panel + clipboard textarea.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  dispatchToAgent,
  type AffordanceOptions,
} from '../../../../plugins/deskwork-studio/public/src/affordance-routing';

vi.mock(
  '../../../../plugins/deskwork-studio/public/src/clipboard.ts',
  () => ({
    copyOrShowFallback: vi.fn(async () => true),
  }),
);

import { copyOrShowFallback } from '../../../../plugins/deskwork-studio/public/src/clipboard.ts';

interface FakePanel {
  prefillInput: ReturnType<typeof vi.fn>;
}

function makeFakePanel(): FakePanel {
  return { prefillInput: vi.fn() };
}

function setPanel(panel: FakePanel | undefined): void {
  // The runtime slot lives on `window`. The test side speaks to it
  // through `Reflect` rather than through the typed accessor so the
  // surrounding tsconfig (which lacks `allowImportingTsExtensions`
  // for the public/src cross-package path and therefore drops the
  // ambient augmentation in chat-panel.ts) doesn't object. The
  // production code path is fully typed at its call site.
  if (panel === undefined) {
    Reflect.deleteProperty(window, 'deskworkChatPanel');
    return;
  }
  Reflect.set(window, 'deskworkChatPanel', panel);
}

interface StateOk {
  readonly mcpConnected: boolean;
  readonly listenModeOn: boolean;
}

function stateResponse(state: StateOk): Response {
  return new Response(JSON.stringify({ ...state, awaitingMessage: false }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const originalFetch = globalThis.fetch;

function setFetch(impl: typeof fetch): void {
  globalThis.fetch = impl;
  if (typeof window !== 'undefined') {
    Reflect.set(window, 'fetch', impl);
  }
}

function restoreFetch(): void {
  if (originalFetch === undefined) {
    Reflect.deleteProperty(globalThis, 'fetch');
  } else {
    globalThis.fetch = originalFetch;
  }
}

const COMMAND = '/deskwork:approve hello-world';
const OPTS: AffordanceOptions = {
  contextRef: 'hello-world',
  clipboard: {
    successMessage: 'Copied — paste into a Claude Code chat.',
    fallbackMessage: 'Clipboard unavailable — Cmd-C the command:',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  setPanel(undefined);
});

afterEach(() => {
  restoreFetch();
  setPanel(undefined);
});

describe('dispatchToAgent — bridge-live path', () => {
  it('prefills the panel when state reports mcpConnected + listenModeOn AND a panel is mounted', async () => {
    const panel = makeFakePanel();
    setPanel(panel);
    setFetch(async () => stateResponse({ mcpConnected: true, listenModeOn: true }));

    const result = await dispatchToAgent(COMMAND, OPTS);

    expect(result).toEqual({ routed: 'panel', delivered: true });
    expect(panel.prefillInput).toHaveBeenCalledWith(COMMAND);
    expect(panel.prefillInput).toHaveBeenCalledTimes(1);
    expect(copyOrShowFallback).not.toHaveBeenCalled();
  });
});

describe('dispatchToAgent — clipboard fallback paths', () => {
  it('falls through to copyOrShowFallback when mcpConnected=false', async () => {
    const panel = makeFakePanel();
    setPanel(panel);
    setFetch(async () => stateResponse({ mcpConnected: false, listenModeOn: true }));

    const result = await dispatchToAgent(COMMAND, OPTS);

    expect(result.routed).toBe('clipboard');
    expect(result.delivered).toBe(true);
    expect(panel.prefillInput).not.toHaveBeenCalled();
    expect(copyOrShowFallback).toHaveBeenCalledWith(COMMAND, OPTS.clipboard);
  });

  it('falls through to copyOrShowFallback when listenModeOn=false', async () => {
    const panel = makeFakePanel();
    setPanel(panel);
    setFetch(async () => stateResponse({ mcpConnected: true, listenModeOn: false }));

    const result = await dispatchToAgent(COMMAND, OPTS);

    expect(result.routed).toBe('clipboard');
    expect(panel.prefillInput).not.toHaveBeenCalled();
    expect(copyOrShowFallback).toHaveBeenCalledWith(COMMAND, OPTS.clipboard);
  });

  it('falls through to copyOrShowFallback when /api/chat/state returns 5xx', async () => {
    const panel = makeFakePanel();
    setPanel(panel);
    setFetch(async () => new Response('bad', { status: 502 }));

    const result = await dispatchToAgent(COMMAND, OPTS);

    expect(result.routed).toBe('clipboard');
    expect(panel.prefillInput).not.toHaveBeenCalled();
    expect(copyOrShowFallback).toHaveBeenCalledTimes(1);
  });

  it('falls through to copyOrShowFallback when fetch rejects (network error)', async () => {
    const panel = makeFakePanel();
    setPanel(panel);
    setFetch(async () => { throw new Error('network down'); });

    const result = await dispatchToAgent(COMMAND, OPTS);

    expect(result.routed).toBe('clipboard');
    expect(panel.prefillInput).not.toHaveBeenCalled();
    expect(copyOrShowFallback).toHaveBeenCalledTimes(1);
  });

  it('falls through to copyOrShowFallback when no panel is mounted (window.deskworkChatPanel === undefined)', async () => {
    setPanel(undefined);
    // Even with a live bridge, if the panel is unmounted on this page
    // we cannot prefill — the operator's expectation must be the
    // clipboard, not silent dispatch into a panel they cannot see.
    setFetch(async () => stateResponse({ mcpConnected: true, listenModeOn: true }));

    const result = await dispatchToAgent(COMMAND, OPTS);

    expect(result.routed).toBe('clipboard');
    expect(copyOrShowFallback).toHaveBeenCalledTimes(1);
  });

  it('reports delivered=false when the manual-copy fallback panel had to render', async () => {
    setPanel(undefined);
    setFetch(async () => new Response('not mounted', { status: 404 }));
    vi.mocked(copyOrShowFallback).mockResolvedValueOnce(false);

    const result = await dispatchToAgent(COMMAND, OPTS);

    expect(result).toEqual({ routed: 'clipboard', delivered: false });
  });
});

describe('dispatchToAgent — input validation', () => {
  it('throws synchronously on empty command', async () => {
    await expect(dispatchToAgent('', OPTS)).rejects.toThrow(/empty command/);
  });
});
