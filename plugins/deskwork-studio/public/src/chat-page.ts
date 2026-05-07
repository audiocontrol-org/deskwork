/**
 * Bootstrap for the full-page chat surface at /dev/chat.
 *
 * Mounts a ChatPanel into the page's #chat-root container. The
 * panel renders its own chrome — this module only owns the
 * lifecycle hookup.
 */

import { ChatPanel } from './chat-panel.ts';

function init(): void {
  const root = document.getElementById('chat-root');
  if (!root || !(root instanceof HTMLElement)) return;
  new ChatPanel(root, { fullPage: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
