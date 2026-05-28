/**
 * Per-lane Compose chip + empty-lane CTA controller (Phase 5
 * Task 5.1C + Task 5.2).
 *
 * Wires TWO clipboard-only affordances inside every swim:
 *
 *   - `.swim-compose` chip in the swim-head (Task 5.1C). Composes
 *     `/deskwork:add <SLUG> --lane <laneId> --stage <firstStage>`
 *     — the literal four-character `<SLUG>` placeholder is part of
 *     the copied text, the operator replaces it in the chat editor
 *     after paste.
 *   - `.swim-empty-cta .sec-cta` button in the empty-lane body
 *     (Task 5.2). Composes `/deskwork:add --lane <laneId>` — NO
 *     slug placeholder, NO `--stage` flag (the operator's first
 *     invocation in a lane runs the add skill's full prompt flow).
 *
 * Both affordances:
 *
 *   - Use `navigator.clipboard.writeText` as the entire side effect.
 *     On success they flash `.copied` (visual + aria-label swap)
 *     for ~2000ms, then revert.
 *   - Stop click propagation so the parent `.swim-head` / swim body
 *     handlers don't also fire (the lane-collapse toggler would
 *     otherwise pick the click up).
 *   - Honor collapse precedence: when the parent swim is `.collapsed`,
 *     click is a no-op.
 *   - Activate on Space (with `preventDefault` to suppress page
 *     scroll) per WCAG 2.1 SC 2.1.1. Enter is free via the native
 *     `<button>` keyboard contract.
 *
 * Per THESIS Consequence 2 + DESKWORK-STATE-MACHINE.md Commandment
 * II: the studio does NOT mutate sidecar state from either
 * affordance. No verb is dispatched, no network request is made, no
 * entry is created. The operator's pasted slash command IS the
 * action — this controller's contract is clipboard + flash, period.
 *
 * Per the no-fallback rule: when `navigator.clipboard` is missing
 * or `writeText` rejects, the controller surfaces a runtime error
 * rather than papering over with `document.execCommand('copy')`.
 * The error is the correct signal that the surface is broken.
 */

/** Duration the affordance stays in the `.copied` flash state (ms). */
const COPIED_FLASH_MS = 2000;

/** Literal slug placeholder — operator replaces it in the chat editor. */
const SLUG_PLACEHOLDER = '<SLUG>';

/** Accessible name for an affordance during the `.copied` flash. */
const COPIED_ARIA_LABEL = 'Copied — paste in chat';

/** WeakMap of button → pending revert-timer handle. */
const pendingTimers = new WeakMap<HTMLButtonElement, number>();

/**
 * Snapshot of an affordance's render-time `aria-label` so the
 * `.copied` flash can swap it to the success message and restore it
 * on revert. Captured at bind time so subsequent renders / DOM
 * rewrites don't drift the snapshot.
 *
 * Mobile motivation: on phone the compose chip's `.sc-label` is
 * `display: none`, so the visible label swap is invisible to
 * screen-reader users — `aria-label` is the only accessible name.
 * Without this swap the AT user gets zero feedback that the copy
 * succeeded. The empty-CTA's `.sec-label` is visible at every
 * breakpoint, but mirroring the swap keeps the contract uniform.
 */
const originalAriaLabel = new WeakMap<HTMLButtonElement, string>();

/**
 * Per-affordance behavior contract. Each affordance kind (compose
 * chip vs empty CTA) provides its own slash-command builder + flash
 * visual swap (the chip is "+ new" → "✓ Copied — paste in chat";
 * the CTA is "Create your first entry" → "Copied — paste in chat").
 */
interface AffordanceSpec {
  /** CSS selector the controller targets to bind this affordance. */
  readonly selector: string;
  /**
   * Compose the slash command to copy. Receives the affordance's
   * dataset; returns the literal text written to the clipboard.
   */
  readonly compose: (dataset: DOMStringMap) => string;
  /** Apply the `.copied` visual swap (icon + label). */
  readonly enterCopied: (button: HTMLButtonElement) => void;
  /** Restore the at-rest visual state (icon + label). */
  readonly leaveCopied: (button: HTMLButtonElement) => void;
}

function composeChipSlash(dataset: DOMStringMap): string {
  const { laneId, firstStage } = dataset;
  if (laneId === undefined || firstStage === undefined) {
    throw new Error(
      '.swim-compose chip missing data-lane-id or data-first-stage',
    );
  }
  return `/deskwork:add ${SLUG_PLACEHOLDER} --lane ${laneId} --stage ${firstStage}`;
}

function composeEmptyCtaSlash(dataset: DOMStringMap): string {
  const { laneId } = dataset;
  if (laneId === undefined) {
    throw new Error('.swim-empty-cta .sec-cta missing data-lane-id');
  }
  return `/deskwork:add --lane ${laneId}`;
}

function chipEnterCopied(button: HTMLButtonElement): void {
  const icon = button.querySelector<HTMLElement>('.sc-icon');
  const label = button.querySelector<HTMLElement>('.sc-label');
  if (icon !== null) icon.textContent = '✓';
  if (label !== null) label.textContent = 'Copied — paste in chat';
}

function chipLeaveCopied(button: HTMLButtonElement): void {
  const icon = button.querySelector<HTMLElement>('.sc-icon');
  const label = button.querySelector<HTMLElement>('.sc-label');
  if (icon !== null) icon.textContent = '+';
  if (label !== null) label.textContent = 'new';
}

function ctaEnterCopied(button: HTMLButtonElement): void {
  const icon = button.querySelector<HTMLElement>('.sec-icon');
  const label = button.querySelector<HTMLElement>('.sec-label');
  if (icon !== null) icon.textContent = '✓';
  if (label !== null) label.textContent = 'Copied — paste in chat';
}

function ctaLeaveCopied(button: HTMLButtonElement): void {
  const icon = button.querySelector<HTMLElement>('.sec-icon');
  const label = button.querySelector<HTMLElement>('.sec-label');
  if (icon !== null) icon.textContent = '+';
  if (label !== null) label.textContent = 'Create your first entry';
}

const COMPOSE_CHIP_SPEC: AffordanceSpec = {
  selector: '.swim-compose[data-swim-compose]',
  compose: composeChipSlash,
  enterCopied: chipEnterCopied,
  leaveCopied: chipLeaveCopied,
};

const EMPTY_CTA_SPEC: AffordanceSpec = {
  selector: '.swim-empty-cta .sec-cta[data-swim-empty-copy]',
  compose: composeEmptyCtaSlash,
  enterCopied: ctaEnterCopied,
  leaveCopied: ctaLeaveCopied,
};

function enterCopiedState(button: HTMLButtonElement, spec: AffordanceSpec): void {
  button.classList.add('copied');
  button.setAttribute('aria-label', COPIED_ARIA_LABEL);
  spec.enterCopied(button);
}

function leaveCopiedState(button: HTMLButtonElement, spec: AffordanceSpec): void {
  button.classList.remove('copied');
  const original = originalAriaLabel.get(button);
  if (original !== undefined) button.setAttribute('aria-label', original);
  spec.leaveCopied(button);
}

/**
 * Schedule the revert. Any prior revert-timer on this button is
 * cleared first so rapid double-clicks restart the flash window —
 * the affordance stays in `.copied` for ~2000ms after the LAST
 * click, not after the first.
 */
function scheduleRevert(button: HTMLButtonElement, spec: AffordanceSpec): void {
  const prior = pendingTimers.get(button);
  if (prior !== undefined) window.clearTimeout(prior);
  const handle = window.setTimeout(() => {
    pendingTimers.delete(button);
    leaveCopiedState(button, spec);
  }, COPIED_FLASH_MS);
  pendingTimers.set(button, handle);
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
async function copyAndFlash(
  button: HTMLButtonElement,
  spec: AffordanceSpec,
): Promise<void> {
  // `navigator.clipboard` is missing on http (non-secure) contexts
  // and in jsdom without an explicit shim. Surface the missing API
  // as a runtime error per the no-fallback rule.
  if (typeof navigator.clipboard?.writeText !== 'function') {
    throw new Error(
      'navigator.clipboard.writeText is unavailable — the .swim-'
      + 'compose chip requires a secure (https) context',
    );
  }
  const text = spec.compose(button.dataset);
  await navigator.clipboard.writeText(text);
  enterCopiedState(button, spec);
  scheduleRevert(button, spec);
}

/**
 * Resolve an affordance-activation gesture (click OR Space keydown).
 * Returns false when collapse precedence blocks the gesture; throws
 * the underlying clipboard error otherwise so the caller (and any
 * test that spies on rejection) sees the failure.
 */
async function activateAffordance(
  button: HTMLButtonElement,
  spec: AffordanceSpec,
): Promise<boolean> {
  const swim = button.closest<HTMLElement>('.swim[data-lane-id]');
  if (swim !== null && swim.classList.contains('collapsed')) return false;
  await copyAndFlash(button, spec);
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

function bindAffordance(button: HTMLButtonElement, spec: AffordanceSpec): void {
  const renderedAriaLabel = button.getAttribute('aria-label');
  if (renderedAriaLabel !== null) {
    originalAriaLabel.set(button, renderedAriaLabel);
  }
  button.addEventListener('click', (ev) => {
    // Stop the click from bubbling into the swim-head /
    // swim-body's collapse handler (which would otherwise also
    // toggle the lane collapse on every affordance click).
    ev.stopPropagation();
    activateAffordance(button, spec).catch(surfaceActivationError);
  });
  button.addEventListener('keydown', (ev) => {
    if (ev.key !== ' ') return;
    // Space activates the affordance. Per WCAG 2.1 SC 2.1.1,
    // preventDefault to suppress page scroll. Enter is free with
    // the native `<button>` keyboard contract — no extra handler
    // needed.
    ev.preventDefault();
    activateAffordance(button, spec).catch(surfaceActivationError);
  });
}

/**
 * Entry point — wire compose-chip + empty-lane CTA handlers for
 * every swim on the page. No-op when the bay-shell is absent.
 */
export function initSwimlaneCompose(): void {
  const shell = document.querySelector<HTMLElement>('[data-bay-shell]');
  if (shell === null) return;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    COMPOSE_CHIP_SPEC.selector,
  )) {
    bindAffordance(button, COMPOSE_CHIP_SPEC);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    EMPTY_CTA_SPEC.selector,
  )) {
    bindAffordance(button, EMPTY_CTA_SPEC);
  }
}
