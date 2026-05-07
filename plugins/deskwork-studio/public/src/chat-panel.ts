/**
 * Vanilla-TS docked chat panel for the studio.
 *
 * Talks to /api/chat/{history,stream,send,state} via the transport
 * helper. Renders rows via chat-renderer (the trust boundary for
 * HTML escaping). Draft persistence lives in chat-draft; collapse
 * state lives in chat-collapse; DOM skeleton lives in chat-skeleton.
 * Public interface: `new ChatPanel(parent, options)`,
 * `prefillInput(text)`, `destroy()`.
 */

import {
  renderRow,
  renderBridgeState,
  type BridgeState,
  type ChatLogRow,
} from './chat-renderer.ts';
import {
  loadHistory,
  loadState,
  openStream,
  sendMessage,
} from './chat-transport.ts';
import { createChatDraftStore, type ChatDraftStore } from './chat-draft.ts';
import { buildChatSkeleton, type ChatSkeleton } from './chat-skeleton.ts';
import {
  applyCollapseState,
  createCollapseStore,
  flashStripChip,
  resolveInitialState,
  toggleCollapseState,
  type CollapseState,
  type CollapseStore,
} from './chat-collapse.ts';

const MOBILE_BREAKPOINT_PX = 600;
const NEAR_BOTTOM_PX = 50;

export interface ChatPanelOptions {
  readonly contextRef?: string;
  readonly fullPage?: boolean;
}

export class ChatPanel {
  private readonly parent: HTMLElement;
  private readonly contextRef: string | undefined;
  private readonly fullPage: boolean;
  private readonly draft: ChatDraftStore;
  private readonly collapseStore: CollapseStore;
  private readonly resizeListener: () => void;
  private readonly keydownListener: (ev: KeyboardEvent) => void;

  private skel: ChatSkeleton | null = null;
  private eventSource: EventSource | null = null;
  private state: BridgeState = {
    mcpConnected: false,
    listenModeOn: false,
    awaitingMessage: false,
  };
  private knownSeqs = new Set<number>();
  private pendingNewCount = 0;
  private collapseState: CollapseState = 'expanded';
  private wasPhoneWidth: boolean | null = null;
  private destroyed = false;

  constructor(parent: HTMLElement, options?: ChatPanelOptions) {
    if (!(parent instanceof HTMLElement)) {
      throw new Error('ChatPanel: parent must be an HTMLElement');
    }
    const projectRoot = document.body.dataset.projectRoot;
    if (projectRoot === undefined || projectRoot === '') {
      throw new Error(
        'ChatPanel: <body data-project-root="..."> is required for draft persistence',
      );
    }
    this.parent = parent;
    this.contextRef = options?.contextRef;
    this.fullPage = options?.fullPage === true;
    this.draft = createChatDraftStore(`chat-draft:${projectRoot}`);
    this.collapseStore = createCollapseStore({
      storage: window.localStorage,
      projectRoot,
    });
    this.resizeListener = () => this.applyMobileClass();
    this.keydownListener = (ev) => this.handleKeydown(ev);

    this.skel = buildChatSkeleton(this.state, this.fullPage);
    this.parent.appendChild(this.skel.root);
    this.wireEvents();
    window.addEventListener('resize', this.resizeListener);
    window.addEventListener('keydown', this.keydownListener);
    this.applyMobileClass();
    this.applyInputEnabled();
    this.restoreDraft();
    window.deskworkChatPanel = this;
    void this.bootstrapHistoryAndStream();
  }

  /**
   * Append `text` to the textarea, preserving any existing draft. Empty
   * textarea -> set to `text`; non-empty -> existing + "\n\n" + `text`.
   * The append-with-newline contract avoids silently clobbering an
   * unsent draft when an affordance routes prefill text in.
   *
   * Returns `true` after a successful update, `false` if the panel is
   * not mountable (already destroyed, or skeleton not yet built). The
   * boolean lets dispatch callers detect a destroyed-mid-await race
   * and fall through to clipboard rather than silently dropping the
   * command into a panel the operator can no longer see.
   */
  prefillInput(text: string): boolean {
    if (this.destroyed || !this.skel) return false;
    const existing = this.skel.textarea.value;
    const next = existing.length === 0 ? text : `${existing}\n\n${text}`;
    this.skel.textarea.value = next;
    this.draft.writeNow(next);
    this.autoResize();
    // Auto-expand the panel when prefill arrives — the operator just
    // tapped Approve / Iterate / Reject and is about to type, they
    // need the full input + Send button reachable.
    if (this.collapseState === 'collapsed' && !this.fullPage) {
      this.setCollapseState('expanded');
    }
    this.skel.textarea.focus();
    if (!this.fullPage) {
      this.skel.root.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    window.removeEventListener('resize', this.resizeListener);
    window.removeEventListener('keydown', this.keydownListener);
    this.draft.cancel();
    if (this.skel && this.skel.root.parentNode) {
      this.skel.root.parentNode.removeChild(this.skel.root);
    }
    this.skel = null;
    if (window.deskworkChatPanel === this) {
      window.deskworkChatPanel = undefined;
    }
  }

  private wireEvents(): void {
    if (!this.skel) return;
    const { scroll, newPill, textarea, sendBtn, collapseToggle, stowToggle } =
      this.skel;
    scroll.addEventListener('scroll', () => {
      if (this.isNearBottom()) this.clearNewPill();
    });
    newPill.addEventListener('click', () => this.scrollToBottom());
    textarea.addEventListener('input', () => {
      this.autoResize();
      this.draft.scheduleWrite(textarea.value);
    });
    textarea.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      if (ev.metaKey || ev.ctrlKey) {
        ev.preventDefault();
        void this.send();
      }
    });
    sendBtn.addEventListener('click', () => {
      void this.send();
    });
    collapseToggle.addEventListener('click', () => this.toggleCollapse());
    stowToggle.addEventListener('click', () => this.toggleCollapse());
  }

  private handleKeydown(ev: KeyboardEvent): void {
    if (this.destroyed || !this.skel) return;
    if (this.fullPage) return; // /dev/chat ignores collapse shortcuts
    // Shift+C toggles. Letter is "C" with shift; some browsers report
    // ev.key as "C" (uppercase) when shift is held. Match either.
    if (ev.shiftKey && (ev.key === 'C' || ev.key === 'c')) {
      // Don't fight typing in inputs/textareas — Shift+C in the
      // textarea is a literal capital C the operator wants to type.
      if (isTypingTarget(ev.target)) return;
      ev.preventDefault();
      this.toggleCollapse();
      return;
    }
    // Esc collapses (only when expanded; let other handlers see Esc
    // when already collapsed so they can dismiss their own surfaces).
    if (ev.key === 'Escape' && this.collapseState === 'expanded') {
      if (isTypingTarget(ev.target)) return;
      ev.preventDefault();
      this.setCollapseState('collapsed');
    }
  }

  private toggleCollapse(): void {
    this.setCollapseState(toggleCollapseState(this.collapseState));
  }

  private setCollapseState(next: CollapseState): void {
    if (!this.skel) return;
    this.collapseState = next;
    this.collapseStore.write(next);
    applyCollapseState(next, {
      root: this.skel.root,
      collapseToggle: this.skel.collapseToggle,
      stowToggle: this.skel.stowToggle,
    });
  }

  private async bootstrapHistoryAndStream(): Promise<void> {
    try {
      const rows = await loadHistory(200);
      for (const row of rows) this.appendRow(row, { initial: true });
      this.scrollToBottom();
    } catch {
      // History errors are non-fatal — SSE will catch up.
    }
    try {
      const state = await loadState();
      if (state) this.applyBridgeState(state);
    } catch {
      // SSE will deliver state updates.
    }
    if (this.destroyed) return;
    this.eventSource = openStream({
      onAgentEvent: (e) => this.appendRow(e, { initial: false }),
      onBridgeState: (s) => this.applyBridgeState(s),
      onHistoryRow: (r) => this.appendRow(r, { initial: false }),
    });
  }

  private autoResize(): void {
    if (!this.skel) return;
    const ta = this.skel.textarea;
    ta.style.height = 'auto';
    const max = 20 * 6 + 12;
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }

  private isNearBottom(): boolean {
    if (!this.skel) return true;
    const el = this.skel.scroll;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  private scrollToBottom(): void {
    if (!this.skel) return;
    this.skel.scroll.scrollTop = this.skel.scroll.scrollHeight;
    this.clearNewPill();
  }

  private clearNewPill(): void {
    this.pendingNewCount = 0;
    if (this.skel) this.skel.newPill.hidden = true;
  }

  private bumpNewPill(): void {
    if (!this.skel) return;
    this.pendingNewCount += 1;
    this.skel.newPill.textContent = `↓ ${this.pendingNewCount} new`;
    this.skel.newPill.hidden = false;
  }

  private appendRow(row: ChatLogRow, opts: { initial: boolean }): void {
    if (!this.skel) return;
    const seq = rowSeq(row);
    if (seq !== null) {
      if (this.knownSeqs.has(seq)) return;
      this.knownSeqs.add(seq);
    }
    const html = renderRow(row);
    if (html === '') return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    const node = wrapper.firstElementChild;
    if (!node) return;
    const wasNear = this.isNearBottom();
    this.skel.scroll.appendChild(node);
    if (opts.initial || wasNear) this.scrollToBottom();
    else this.bumpNewPill();
    // One-shot pulse on the strip chip when a NEW operator message
    // arrives while the panel is collapsed — operator round-tripped a
    // message via the bridge and the strip should affirm it landed,
    // without auto-expanding. Suppressed on the initial history
    // replay so a refresh doesn't flash for every backfilled row.
    if (
      !opts.initial &&
      this.collapseState === 'collapsed' &&
      isOperatorRow(row)
    ) {
      flashStripChip(this.skel.stripChip);
    }
  }

  /**
   * Apply a bridge-state update to the header chip and input enable
   * state. Public so jsdom unit tests can drive the four enable
   * transitions deterministically without an EventSource. Production
   * callers reach this only through the SSE bridge-state event.
   */
  applyBridgeState(state: BridgeState): void {
    this.state = state;
    if (this.skel) {
      const html = renderBridgeState(state);
      this.skel.headerChip.innerHTML = html;
      this.skel.stripChip.innerHTML = html;
    }
    this.applyInputEnabled();
  }

  private applyInputEnabled(): void {
    if (!this.skel) return;
    const enabled = this.state.mcpConnected && this.state.listenModeOn;
    this.skel.sendBtn.disabled = !enabled;
    this.skel.textarea.disabled = !enabled;
    if (enabled) {
      this.skel.root.removeAttribute('data-bridge-offline');
      this.skel.sendBtn.removeAttribute('title');
      this.skel.textarea.removeAttribute('title');
      return;
    }
    this.skel.root.setAttribute('data-bridge-offline', '');
    const reason = !this.state.mcpConnected
      ? 'Bridge offline — no agent connected'
      : 'Agent connected but not listening — run /deskwork:listen in Claude Code';
    this.skel.sendBtn.title = reason;
    this.skel.textarea.title = reason;
  }

  private async send(): Promise<void> {
    if (!this.skel) return;
    const ta = this.skel.textarea;
    const text = ta.value.trim();
    if (text.length === 0) return;
    this.hideErr();
    const result = await sendMessage(text, this.contextRef);
    if (!result.ok) {
      if (result.error === 'bridge-offline') {
        this.showErr('Bridge offline. Start /deskwork:listen in Claude Code.');
      } else if (result.error) {
        this.showErr(`Send failed: ${result.error}`);
      } else {
        this.showErr(`Send failed (${result.status}).`);
      }
      return;
    }
    ta.value = '';
    this.autoResize();
    this.draft.writeNow('');
  }

  private showErr(msg: string): void {
    if (!this.skel) return;
    this.skel.inputErr.textContent = msg;
    this.skel.inputErr.hidden = false;
  }

  private hideErr(): void {
    if (!this.skel) return;
    this.skel.inputErr.hidden = true;
    this.skel.inputErr.textContent = '';
  }

  private restoreDraft(): void {
    if (!this.skel) return;
    const text = this.draft.read();
    if (text.length === 0) return;
    this.skel.textarea.value = text;
    this.autoResize();
  }

  private applyMobileClass(): void {
    if (!this.skel || this.fullPage) return;
    const w = this.parent.clientWidth || window.innerWidth;
    const isPhoneWidth = w < MOBILE_BREAKPOINT_PX;
    if (isPhoneWidth) {
      this.skel.root.classList.add('chat-panel--mobile-full');
      // Only resolve-from-store on the desktop->phone transition.
      // Subsequent phone-width resize events (URL-bar reveal, soft
      // keyboard show/hide) must NOT re-write the store with the same
      // value — that's a redundant localStorage write.
      if (this.wasPhoneWidth !== true) {
        const initial = resolveInitialState(this.collapseStore);
        this.setCollapseState(initial);
      }
    } else {
      this.skel.root.classList.remove('chat-panel--mobile-full');
      // Desktop: clear collapsed state in-memory only. Don't write to
      // the store — preserve the operator's phone choice across a
      // desktop->phone resize round-trip.
      this.collapseState = 'expanded';
      applyCollapseState('expanded', {
        root: this.skel.root,
        collapseToggle: this.skel.collapseToggle,
        stowToggle: this.skel.stowToggle,
      });
    }
    this.wasPhoneWidth = isPhoneWidth;
  }
}

function rowSeq(row: ChatLogRow): number | null {
  if ('role' in row) return row.seq;
  if (row.kind === 'tool-use' || row.kind === 'prose') return row.seq;
  return null;
}

function isOperatorRow(row: ChatLogRow): boolean {
  return 'role' in row && row.role === 'operator';
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
