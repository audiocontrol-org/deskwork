/**
 * DOM skeleton builder for the chat panel.
 *
 * Pure DOM construction — no event wiring, no state. The panel
 * orchestrator owns the wiring and threads the returned references
 * back into its instance state. This split keeps chat-panel.ts under
 * the file-size cap while leaving the skeleton's structure obvious in
 * one place.
 */

import { renderBridgeState, type BridgeState } from './chat-renderer.ts';

export interface ChatSkeleton {
  readonly root: HTMLElement;
  readonly header: HTMLElement;
  readonly scroll: HTMLElement;
  readonly newPill: HTMLButtonElement;
  readonly textarea: HTMLTextAreaElement;
  readonly sendBtn: HTMLButtonElement;
  readonly inputErr: HTMLElement;
}

export function buildChatSkeleton(initialState: BridgeState, fullPage: boolean): ChatSkeleton {
  const root = document.createElement('div');
  root.className = fullPage
    ? 'chat-panel chat-panel--full'
    : 'chat-panel chat-panel--docked';
  root.setAttribute('data-chat-panel', '');

  const header = document.createElement('div');
  header.className = 'chat-header';
  header.innerHTML = renderBridgeState(initialState);
  root.appendChild(header);

  const scroll = document.createElement('div');
  scroll.className = 'chat-scroll';
  scroll.setAttribute('role', 'log');
  scroll.setAttribute('aria-live', 'polite');
  root.appendChild(scroll);

  const newPill = document.createElement('button');
  newPill.type = 'button';
  newPill.className = 'chat-new-pill';
  newPill.hidden = true;
  newPill.textContent = 'New messages';
  root.appendChild(newPill);

  const inputRow = document.createElement('div');
  inputRow.className = 'chat-input';
  const textarea = document.createElement('textarea');
  textarea.className = 'chat-textarea';
  textarea.rows = 1;
  textarea.placeholder = 'Message the agent...';
  textarea.setAttribute('aria-label', 'message text');
  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'chat-send';
  sendBtn.textContent = 'Send';
  const inputErr = document.createElement('div');
  inputErr.className = 'chat-input-err';
  inputErr.hidden = true;
  inputRow.appendChild(textarea);
  inputRow.appendChild(sendBtn);
  inputRow.appendChild(inputErr);
  root.appendChild(inputRow);

  return { root, header, scroll, newPill, textarea, sendBtn, inputErr };
}
