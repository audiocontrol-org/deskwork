/**
 * Decision-strip wiring for the entry-keyed press-check client
 * (Phase 34a — T13).
 *
 *   - `Approve` → POST `/api/dev/editorial-review/entry/<uuid>/decision`
 *     with `{decision: 'approve'}`. The endpoint calls `approveEntryStage`,
 *     which graduates the entry to the next stage in the linear pipeline.
 *   - `Iterate` → POST `/api/dev/editorial-review/entry/<uuid>/version`.
 *     The endpoint records a new iteration via `iterateEntry`.
 *   - `Reject` → DISABLED. The button carries `disabled` and a tooltip
 *     pointing to https://github.com/audiocontrol-org/deskwork/issues/173.
 *     The keyboard shortcut path (r r) similarly no-ops with a toast.
 *
 * Keyboard shortcuts (#108) — bare-letter double-tap with no modifier,
 * arming for 500ms after the first press. Mirrors the legacy surface
 * verbatim so the operator's muscle memory transfers.
 */

import type { EntryReviewState } from './state.ts';

const ENTRY_API = '/api/dev/editorial-review/entry';

interface DecisionDom {
  approveBtn: HTMLButtonElement | null;
  iterateBtn: HTMLButtonElement | null;
  rejectBtn: HTMLButtonElement | null;
}

export interface DecisionControllerOptions {
  state: EntryReviewState;
  dom: DecisionDom;
  showToast: (msg: string, isError?: boolean) => void;
}

export interface DecisionController {
  approve: () => Promise<void>;
  iterate: () => Promise<void>;
  reject: () => void;
}

export function createDecisionController(
  opts: DecisionControllerOptions,
): DecisionController {
  const { state, dom, showToast } = opts;
  const { approveBtn, iterateBtn, rejectBtn } = dom;
  const entryId = state.entryId;

  function decisionUrl(): string {
    return `${ENTRY_API}/${encodeURIComponent(entryId)}/decision`;
  }
  function versionUrl(): string {
    return `${ENTRY_API}/${encodeURIComponent(entryId)}/version`;
  }

  async function postDecision(decision: 'approve'): Promise<boolean> {
    const res = await fetch(decisionUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => ({}));
      const reason = (body as { error?: string }).error ?? `HTTP ${res.status}`;
      showToast(`Decision failed: ${reason}`, true);
      return false;
    }
    return true;
  }

  async function postIterate(): Promise<boolean> {
    const res = await fetch(versionUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => ({}));
      const reason = (body as { error?: string }).error ?? `HTTP ${res.status}`;
      showToast(`Iterate failed: ${reason}`, true);
      return false;
    }
    return true;
  }

  async function approve(): Promise<void> {
    if (!approveBtn) return;
    approveBtn.disabled = true;
    const ok = await postDecision('approve');
    if (!ok) {
      approveBtn.disabled = false;
      return;
    }
    showToast(`Approved ${state.currentStage}; advancing to next stage.`);
    setTimeout(() => window.location.reload(), 900);
  }

  async function iterate(): Promise<void> {
    if (!iterateBtn) return;
    iterateBtn.disabled = true;
    const ok = await postIterate();
    if (!ok) {
      iterateBtn.disabled = false;
      return;
    }
    showToast(`New iteration recorded for ${state.currentStage}.`);
    setTimeout(() => window.location.reload(), 900);
  }

  function reject(): void {
    // Disabled — the button carries `disabled` server-side and the
    // tooltip names issue #173. The shortcut path lands here too;
    // surface the same explainer so the operator gets feedback that
    // their keystroke registered but the action is intentionally
    // disabled pending the design decision.
    showToast(
      'Reject semantics are pending design — see issue #173.',
      true,
    );
  }

  approveBtn?.addEventListener('click', () => { void approve(); });
  iterateBtn?.addEventListener('click', () => { void iterate(); });
  // Guard: even though the button is `disabled`, attach a click handler
  // for screen-reader operators or anyone who removes the disabled
  // attribute via devtools. The handler shows the same toast as the
  // shortcut path — explicit + falsifiable signal that the action is
  // intentionally inert.
  rejectBtn?.addEventListener('click', (ev) => {
    ev.preventDefault();
    reject();
  });

  return { approve, iterate, reject };
}
