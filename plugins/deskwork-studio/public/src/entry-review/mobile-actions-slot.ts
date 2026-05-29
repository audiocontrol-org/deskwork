/**
 * Renders the Actions sheet's content slot for the mobile review surface.
 *
 * Three sections:
 *   - Document: Edit (triggers the existing toggle-edit button — the
 *     strip's Edit affordance is `display: none` on phone post-rebuild,
 *     so this is the operator's primary path into the editor at <48rem)
 *   - Decisions: Approve / Iterate / Reject / Cancel — each clipboard-
 *     copies the corresponding `/deskwork:<verb> <slug>` skill command
 *     (THESIS Consequence 2). No state-machine endpoints.
 *
 * Extracted from mobile-sheet-bar.ts to keep that file under the project
 * 300–500 line cap. The slot, deps, and closeSheet callback are passed
 * in so the populator stays testable and side-effect-bounded.
 */
import { copyOrShowFallback } from '../clipboard.ts';

export interface ActionsSlotDeps {
  readonly entrySlug: string;
}

export function populateActionsSlot(
  slot: HTMLElement,
  deps: ActionsSlotDeps,
  closeSheet: () => void,
): void {
  slot.innerHTML = '';

  // ---- Document section ----
  const docSection = document.createElement('div');
  docSection.className = 'er-mobile-action-section';
  docSection.textContent = 'Document';
  slot.appendChild(docSection);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'er-mobile-action er-mobile-action--edit';
  editBtn.dataset.action = 'edit';
  editBtn.innerHTML =
    '<span class="er-mobile-action-glyph" aria-hidden="true">✎</span>' +
    'Edit<span class="er-mobile-action-meta">Open editor</span>';
  editBtn.addEventListener('click', () => {
    const target = document.querySelector<HTMLButtonElement>('[data-action="toggle-edit"]');
    target?.click();
    closeSheet();
  });
  slot.appendChild(editBtn);

  // ---- Decisions section ----
  const decisionSection = document.createElement('div');
  decisionSection.className = 'er-mobile-action-section';
  decisionSection.textContent = 'Decisions';
  slot.appendChild(decisionSection);

  const actions: ReadonlyArray<{
    readonly key: 'approve' | 'iterate' | 'reject' | 'cancel';
    readonly label: string;
    readonly glyph: string;
    readonly meta: string;
    readonly verb: string;
  }> = [
    { key: 'approve', label: 'Approve', glyph: '✓', meta: 'Stage advance', verb: 'approve' },
    { key: 'iterate', label: 'Iterate', glyph: '↻', meta: 'New version',   verb: 'iterate' },
    { key: 'reject',  label: 'Reject',  glyph: '✕', meta: 'Send back',     verb: 'reject' },
    { key: 'cancel',  label: 'Cancel',  glyph: '⊘', meta: 'Stop work',     verb: 'cancel' },
  ];
  for (const a of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'er-mobile-action';
    btn.dataset.action = a.key;
    btn.innerHTML = `<span class="er-mobile-action-glyph" aria-hidden="true">${a.glyph}</span>${a.label}<span class="er-mobile-action-meta">${a.meta}</span>`;
    btn.addEventListener('click', async () => {
      const command = `/deskwork:${a.verb} ${deps.entrySlug}`;
      await copyOrShowFallback(command, {
        successMessage: `Copied — paste into a Claude Code chat to run \`${command}\`.`,
        fallbackMessage: `Clipboard unavailable. Copy this command and paste it into a Claude Code chat: \`${command}\``,
      });
      closeSheet();
    });
    slot.appendChild(btn);
  }
}
