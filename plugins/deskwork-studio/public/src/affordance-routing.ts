/**
 * Bridge-aware affordance dispatch.
 *
 * Studio buttons (Approve, Iterate, induct, copy-cmd, intake-copy)
 * historically called `copyOrShowFallback(command, opts)` directly.
 * That path forces the operator to switch to a Claude Code chat and
 * paste manually — fine when the bridge is offline, redundant when
 * the bridge is live (the chat panel is right there).
 *
 * `dispatchToAgent` checks `/api/chat/state`. When the bridge is live
 * AND a docked ChatPanel is mounted on the current page, it pre-fills
 * the panel's textarea (append-with-newline contract) and returns
 * `{routed: 'panel'}`. Every other path (bridge offline, listen mode
 * off, no panel on this page, fetch failed) falls through to
 * `copyOrShowFallback` with the caller's clipboard options preserved
 * verbatim — the fallback is the canonical UX for the offline path.
 */

import {
  copyOrShowFallback,
  type CopyOrShowFallbackOptions,
} from './clipboard.ts';
import type { ChatPanel } from './chat-panel.ts';

declare global {
  interface Window {
    deskworkChatPanel?: ChatPanel;
  }
}

export interface AffordanceOptions {
  /**
   * Reserved for callers that have already resolved the entry under
   * review (slug / UUID / workflow id). The panel's `send` payload
   * picks up the panel's constructor-time contextRef, so this option
   * is currently descriptive — held in the surface area so future
   * routing logic doesn't break the caller signature.
   */
  readonly contextRef?: string;
  /**
   * Clipboard-fallback options forwarded verbatim to
   * `copyOrShowFallback`. Required because every existing caller
   * supplies success / fallback messaging tuned to its affordance.
   */
  readonly clipboard: CopyOrShowFallbackOptions;
}

export interface DispatchResult {
  readonly routed: 'panel' | 'clipboard';
  /**
   * True when the routing path produced a "command is where the
   * operator expects it" outcome — panel prefill OR successful
   * clipboard write. False when the manual-copy fallback panel had
   * to render (clipboard write failed). Callers gate UX flashes
   * (e.g. "copied ✓" button label) on this.
   */
  readonly delivered: boolean;
}

interface ChatStateShape {
  readonly mcpConnected: boolean;
  readonly listenModeOn: boolean;
}

export async function dispatchToAgent(
  command: string,
  options: AffordanceOptions,
): Promise<DispatchResult> {
  if (command.length === 0) {
    throw new Error(
      'dispatchToAgent: refusing to dispatch empty command (caller must validate input first)',
    );
  }
  if (await tryRouteToPanel(command)) {
    return { routed: 'panel', delivered: true };
  }
  const ok = await copyOrShowFallback(command, options.clipboard);
  return { routed: 'clipboard', delivered: ok };
}

async function tryRouteToPanel(command: string): Promise<boolean> {
  const panel = window.deskworkChatPanel;
  if (!panel) return false;
  const state = await fetchBridgeState();
  if (!state) return false;
  if (!(state.mcpConnected && state.listenModeOn)) return false;
  panel.prefillInput(command);
  return true;
}

async function fetchBridgeState(): Promise<ChatStateShape | null> {
  try {
    const res = await fetch('/api/chat/state', { cache: 'no-store' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    return isChatStateShape(body) ? body : null;
  } catch {
    // Bridge routes are mounted only when ctx.bridge is present; on
    // non-bridge boots the fetch above 404s. Network failures land
    // here and are indistinguishable from offline — clipboard
    // fallback is the right default for both.
    return null;
  }
}

function isChatStateShape(value: unknown): value is ChatStateShape {
  if (typeof value !== 'object' || value === null) return false;
  const mcp = Reflect.get(value, 'mcpConnected');
  const listen = Reflect.get(value, 'listenModeOn');
  return typeof mcp === 'boolean' && typeof listen === 'boolean';
}
