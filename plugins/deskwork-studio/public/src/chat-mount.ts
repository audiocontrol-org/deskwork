/**
 * Auto-mount the docked chat panel on any page that exposes a
 * `[data-chat-panel-mount]` element. Layout includes this script
 * (when the bridge is enabled) so individual pages opt in by
 * dropping a placeholder div into their body.
 */

import { ChatPanel } from './chat-panel.ts';

function init(): void {
  const mounts = document.querySelectorAll<HTMLElement>('[data-chat-panel-mount]');
  for (const mount of mounts) {
    const contextRef = mount.dataset.chatContextRef;
    new ChatPanel(mount, contextRef ? { contextRef } : {});
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
