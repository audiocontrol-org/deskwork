import type { ChatPanel } from './chat-panel.ts';

declare global {
  interface Window {
    deskworkChatPanel?: ChatPanel;
  }
}

export {};
