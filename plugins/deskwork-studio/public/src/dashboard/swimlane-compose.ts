/**
 * Per-lane Compose chip controller (Phase 5 Task 5.1C).
 *
 * Wires the `.swim-compose` chip in every `<article class="swim">`:
 *
 *   - Click composes the partial slash command `/deskwork:add
 *     <SLUG> --lane <laneId> --stage <firstLinearStage>` (the four-
 *     character `<SLUG>` placeholder is literal — the operator
 *     replaces it in the chat editor after paste).
 *   - `navigator.clipboard.writeText` is the entire side effect.
 *     On success the chip flashes `.copied` (✓ + "Copied — paste in
 *     chat") for ~2000ms, then reverts.
 *
 * Per THESIS Consequence 2 + DESKWORK-STATE-MACHINE.md Commandment
 * II: the studio does NOT mutate sidecar state from this affordance.
 * No verb is dispatched, no network request is made, no entry is
 * created. The operator's pasted slash command IS the action — this
 * controller's contract is clipboard + flash, period.
 *
 * Collapse precedence (mirrors Task 5.1B's `.view-toggle`): when the
 * parent swim is `.collapsed`, the chip is non-interactive — the CSS
 * rule `.swim.collapsed .swim-compose { opacity: 0.4; pointer-
 * events: none }` handles the visual + pointer-event side; this
 * controller also early-returns on click so the gesture is a no-op
 * even if the CSS hasn't loaded yet.
 *
 * Keyboard activation: Enter activates via the native `<button>`
 * primitive; Space is wired explicitly with `preventDefault` to
 * suppress page scroll (per WCAG 2.1 SC 2.1.1). Mirrors the pattern
 * in `swimlane-view-toggle.ts`.
 *
 * Per the no-fallback rule: when `navigator.clipboard` is missing
 * or `writeText` rejects, the controller surfaces a runtime error
 * rather than papering over with `document.execCommand('copy')`.
 * The error is the correct signal that the surface is broken.
 */

/** Duration the chip stays in the `.copied` flash state (ms). */
const COPIED_FLASH_MS = 2000;

/** WeakMap of button → pending revert-timer handle. */
const pendingTimers = new WeakMap<HTMLButtonElement, number>();

/** Literal slug placeholder — operator replaces it in the chat editor. */
const SLUG_PLACEHOLDER = '<SLUG>';

function composeSlashCommand(laneId: string, firstStage: string): string {
  return `/deskwork:add ${SLUG_PLACEHOLDER} --lane ${laneId} --stage ${firstStage}`;
}

function enterCopiedState(button: HTMLButtonElement): void {
  button.classList.add('copied');
  const icon = button.querySelector<HTMLElement>('.sc-icon');
  const label = button.querySelector<HTMLElement>('.sc-label');
  if (icon !== null) icon.textContent = '✓';
  if (label !== null) label.textContent = 'Copied — paste in chat';
}

function leaveCopiedState(button: HTMLButtonElement): void {
  button.classList.remove('copied');
  const icon = button.querySelector<HTMLElement>('.sc-icon');
  const label = button.querySelector<HTMLElement>('.sc-label');
  if (icon !== null) icon.textContent = '+';
  if (label !== null) label.textContent = 'new';
}

/**
 * Schedule the revert. Any prior revert-timer on this button is
 * cleared first so rapid double-clicks restart the flash window —
 * the chip stays in `.copied` for ~2000ms after the LAST click, not
 * after the first.
 */
function scheduleRevert(button: HTMLButtonElement): void {
  const prior = pendingTimers.get(button);
  if (prior !== undefined) window.clearTimeout(prior);
  const handle = window.setTimeout(() => {
    pendingTimers.delete(button);
    leaveCopiedState(button);
  }, COPIED_FLASH_MS);
  pendingTimers.set(button, handle);
}

/**
 * Read the (laneId, firstStage) tuple off the chip's data attrs and
 * compose the slash command. Returns null when either attribute is
 * missing — caller treats that as an invalid gesture.
 */
function readChipData(
  button: HTMLButtonElement,
): { laneId: string; firstStage: string } | null {
  const laneId = button.dataset.laneId;
  const firstStage = button.dataset.firstStage;
  if (laneId === undefined || firstStage === undefined) return null;
  return { laneId, firstStage };
}

/**
 * Perform the clipboard write + transition into the flash state.
 *
 * Per the no-fallback rule: if `navigator.clipboard` is unavailable
 * OR `writeText` rejects, the error propagates. We do not swallow
 * the failure with `document.execCommand('copy')` or any other
 * degraded path — the operator seeing the surface as broken is the
 * correct signal.
 */
async function copyAndFlash(button: HTMLButtonElement): Promise<void> {
  const data = readChipData(button);
  if (data === null) {
    throw new Error(
      '.swim-compose chip missing data-lane-id or data-first-stage',
    );
  }
  // `navigator.clipboard` is missing on http (non-secure) contexts
  // and in jsdom without an explicit shim. Surface the missing API
  // as a runtime error per the no-fallback rule.
  if (typeof navigator.clipboard?.writeText !== 'function') {
    throw new Error(
      'navigator.clipboard.writeText is unavailable — the .swim-'
      + 'compose chip requires a secure (https) context',
    );
  }
  const text = composeSlashCommand(data.laneId, data.firstStage);
  await navigator.clipboard.writeText(text);
  enterCopiedState(button);
  scheduleRevert(button);
}

/**
 * Resolve a chip-activation gesture (click OR Space keydown).
 * Returns false when collapse precedence blocks the gesture; throws
 * the underlying clipboard error otherwise so the caller (and any
 * test that spies on rejection) sees the failure.
 */
async function activateChip(button: HTMLButtonElement): Promise<boolean> {
  const swim = button.closest<HTMLElement>('.swim[data-lane-id]');
  if (swim !== null && swim.classList.contains('collapsed')) return false;
  await copyAndFlash(button);
  return true;
}

/**
 * Surface a clipboard / activation error as a synchronously-thrown
 * error in the next microtask, so it lands on `window.onerror`
 * rather than escaping as an unhandled rejection. The no-fallback
 * contract requires the failure be visible — `window.onerror` is
 * the strongest visible surface a click handler can produce without
 * blocking the event loop. The error type is preserved.
 */
function surfaceActivationError(err: unknown): void {
  queueMicrotask(() => {
    if (err instanceof Error) throw err;
    throw new Error(String(err));
  });
}

function bindChip(button: HTMLButtonElement): void {
  button.addEventListener('click', (ev) => {
    // Stop the click from bubbling into `swimlane-collapse.ts`'s
    // swim-head handler (which would otherwise also toggle the lane
    // collapse on every chip click). Mirrors the pattern in
    // `swimlane-view-toggle.ts:202–204`.
    ev.stopPropagation();
    activateChip(button).catch(surfaceActivationError);
  });
  button.addEventListener('keydown', (ev) => {
    if (ev.key !== ' ') return;
    // Space activates the chip. Per WCAG 2.1 SC 2.1.1, preventDefault
    // to suppress page scroll. Enter is free with the native
    // `<button>` keyboard contract — no extra handler needed.
    ev.preventDefault();
    activateChip(button).catch(surfaceActivationError);
  });
}

/**
 * Entry point — wire compose-chip handlers for every swim on the
 * page. No-op when the bay-shell is absent.
 */
export function initSwimlaneCompose(): void {
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '.swim-compose[data-swim-compose]',
  )) {
    bindChip(button);
  }
}
