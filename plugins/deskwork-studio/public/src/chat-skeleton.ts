/**
 * DOM skeleton builder for the chat panel.
 *
 * Pure DOM construction — no event wiring, no state. The panel
 * orchestrator owns the wiring and threads the returned references
 * back into its instance state. This split keeps chat-panel.ts under
 * the file-size cap while leaving the skeleton's structure obvious in
 * one place.
 *
 * Stowable-affordance pair (Phase 9a): the skeleton carries BOTH the
 * `.chat-stow-toggle` (chevron-down) inside `.chat-header` and the
 * `.chat-collapse-toggle` (chevron-up) inside the dedicated
 * `.chat-strip-row` that becomes the visible chrome of the collapsed
 * strip. CSS chooses which is visible based on the
 * `chat-panel--collapsed` modifier; the panel orchestrator wires both
 * to the same toggle handler.
 */

import { renderBridgeState, type BridgeState } from './chat-renderer.ts';

export interface ChatSkeleton {
  readonly root: HTMLElement;
  readonly header: HTMLElement;
  readonly headerChip: HTMLElement;
  readonly stowToggle: HTMLButtonElement;
  readonly stripRow: HTMLElement;
  readonly stripChip: HTMLElement;
  readonly collapseToggle: HTMLButtonElement;
  readonly scroll: HTMLElement;
  readonly newPill: HTMLButtonElement;
  readonly textarea: HTMLTextAreaElement;
  readonly sendBtn: HTMLButtonElement;
  readonly inputErr: HTMLElement;
}

const CHEVRON_DOWN = '▾'; // ▾
const CHEVRON_UP = '▴'; // ▴

export function buildChatSkeleton(initialState: BridgeState, fullPage: boolean): ChatSkeleton {
  const root = document.createElement('div');
  root.className = fullPage
    ? 'chat-panel chat-panel--full'
    : 'chat-panel chat-panel--docked';
  root.setAttribute('data-chat-panel', '');

  // Bottom-edge strip row — the stowed-state affordance, sibling to
  // the header. Lives inside the panel root so the same `--collapsed`
  // class on root drives both "hide the rest of the chrome" and "show
  // me." On desktop / full-page surfaces this row is hidden by CSS.
  const stripRow = document.createElement('div');
  stripRow.className = 'chat-strip-row';
  const stripChip = document.createElement('span');
  stripChip.className = 'chat-strip-chip';
  stripChip.innerHTML = renderBridgeState(initialState);
  const collapseToggle = document.createElement('button');
  collapseToggle.type = 'button';
  collapseToggle.className = 'chat-collapse-toggle';
  collapseToggle.setAttribute('aria-label', 'Expand chat (Shift+C)');
  collapseToggle.setAttribute('aria-pressed', 'false');
  collapseToggle.textContent = CHEVRON_UP;
  stripRow.appendChild(stripChip);
  stripRow.appendChild(collapseToggle);
  root.appendChild(stripRow);

  const header = document.createElement('div');
  header.className = 'chat-header';
  const headerChip = document.createElement('span');
  headerChip.className = 'chat-header-chip';
  headerChip.innerHTML = renderBridgeState(initialState);
  header.appendChild(headerChip);
  const stowToggle = document.createElement('button');
  stowToggle.type = 'button';
  stowToggle.className = 'chat-stow-toggle';
  stowToggle.setAttribute('aria-label', 'Stow chat (Shift+C or Esc)');
  stowToggle.setAttribute('aria-pressed', 'false');
  stowToggle.textContent = CHEVRON_DOWN;
  header.appendChild(stowToggle);
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

  return {
    root,
    header,
    headerChip,
    stowToggle,
    stripRow,
    stripChip,
    collapseToggle,
    scroll,
    newPill,
    textarea,
    sendBtn,
    inputErr,
  };
}
