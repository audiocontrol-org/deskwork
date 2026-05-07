/**
 * Auto-mount the docked chat panel on any page that exposes a
 * `[data-chat-panel-mount]` element. Layout includes this script
 * (when the bridge is enabled) so individual pages opt in by
 * dropping a placeholder div into their body.
 *
 * Optional `data-chat-context-ref="<id>"` on the mount element flows
 * through to `new ChatPanel({contextRef})`, so per-entry surfaces
 * (entry-review) can scope the chat panel to the entry the operator
 * is currently looking at without the panel having to inspect the
 * URL itself.
 */

import { ChatPanel, type ChatPanelOptions } from './chat-panel.ts';

function init(): void {
  const mounts = document.querySelectorAll<HTMLElement>('[data-chat-panel-mount]');
  for (const mount of mounts) {
    const contextRef = mount.dataset.chatContextRef;
    const opts: ChatPanelOptions =
      contextRef !== undefined && contextRef.length > 0 ? { contextRef } : {};
    new ChatPanel(mount, opts);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
