/**
 * Decision-strip wiring for the entry-keyed press-check client (#189).
 *
 * Per `THESIS.md` Consequence 2: the studio routes operator commands to
 * skills, not to state-machine endpoints. Clicking Approve / Iterate
 * copies the corresponding skill command to the clipboard; the operator
 * pastes into a Claude Code chat where the skill runs and does the
 * editorial work (reads marginalia, edits the file when iterating,
 * advances state, writes the journal, regenerates the calendar).
 *
 *   - `Approve` → copy `/deskwork:approve <slug>` to clipboard.
 *   - `Iterate` → copy `/deskwork:iterate <slug>` to clipboard.
 *   - `Reject` → DISABLED. The button carries `disabled` and a tooltip
 *     pointing to https://github.com/audiocontrol-org/deskwork/issues/173.
 *     The keyboard shortcut path (r r) similarly no-ops with a toast.
 *
 * Keyboard shortcuts (#108) — bare-letter double-tap with no modifier,
 * arming for 500ms after the first press. Mirrors the legacy surface
 * verbatim so the operator's muscle memory transfers.
 *
 * What changed (#189): the previous implementation POSTed to
 * `/api/dev/editorial-review/entry/<uuid>/{decision,version}` which
 * called `approveEntryStage` / `iterateEntry` server-side, mutating
 * sidecar state from a button click. That violated the thesis (skills
 * do the work; the studio routes commands). The state-machine endpoints
 * remain registered on the server for now but are unreached from this
 * client; their retirement is a follow-up.
 */

import { copyOrShowFallback } from '../clipboard.ts';
import type { EntryReviewState } from './state.ts';

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

  // Phase 34a F1 remediation — defense-in-depth against historical-
  // mode mutations. The server already renders these buttons disabled
  // when `state.historical === true`, but if anyone removes the
  // disabled attribute via devtools or fires the keyboard shortcut,
  // short-circuit with the same explainer so the action stays inert.
  function refuseHistorical(label: string): boolean {
    if (state.historical) {
      showToast(
        `${label} is disabled while viewing a historical version — switch back to current to act.`,
        true,
      );
      return true;
    }
    return false;
  }

  /**
   * Copy the given skill command to the clipboard with an editorial-
   * voice toast on success and a manual-copy fallback panel on
   * failure (e.g. non-secure-context). The button stays available
   * after the copy — the operator may want to copy a second time if
   * they pasted the wrong command, OR they may decide to abandon the
   * action without the studio mutating any state.
   */
  async function copyCommand(verb: 'approve' | 'iterate'): Promise<void> {
    const command = `/deskwork:${verb} ${state.slug}`;
    await copyOrShowFallback(command, {
      successMessage: `Copied — paste into a Claude Code chat to run \`${command}\`.`,
      fallbackMessage:
        `Clipboard unavailable on this origin. Copy this command and paste it into a Claude Code chat to run \`/deskwork:${verb}\`:`,
    });
  }

  async function approve(): Promise<void> {
    if (!approveBtn) return;
    if (refuseHistorical('Approve')) return;
    await copyCommand('approve');
  }

  async function iterate(): Promise<void> {
    if (!iterateBtn) return;
    if (refuseHistorical('Iterate')) return;
    await copyCommand('iterate');
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
