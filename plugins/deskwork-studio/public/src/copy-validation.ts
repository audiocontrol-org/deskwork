/**
 * Shared Copy-button gating + inline-notice helpers for the
 * `/dev/lanes` and `/dev/pipelines` builders (and any future copy-
 * builder surface).
 *
 * Why this module exists separately from `copy-builder.ts`:
 *
 *   `copy-builder.ts` owns the clipboard write + flash-affirmation
 *   primitives — independent of any validation contract. This module
 *   owns the *validation* contract: a `CopyBuildResult` shape (command
 *   + optional validity error), a `resolveNotice` helper that lazily
 *   creates the inline `[data-copy-notice]` element adjacent to a
 *   Copy button, and an `applyResultToCopy` helper that wires both
 *   sides together (disable + surface notice when invalid; enable +
 *   hide when valid).
 *
 *   Both `/dev/lanes` and `/dev/pipelines` Copy buttons must refuse
 *   to clipboard a known-invalid command — see AUDIT-20260530-73
 *   (cross-model: AUDIT-BARRAGE-codex-P6-2). Pre-fix, the lanes Copy
 *   handler clipboarded the preview verbatim, including placeholder
 *   angle-brackets like `<id>` / `<template>` / `<path>`, which is
 *   not a valid slash command (and is shell-injection-grade dangerous
 *   if pasted into a terminal). The pipelines page had already grown
 *   a per-page version of this gating pattern; this module extracts
 *   it so both pages share the implementation and the wire-up is
 *   identical across surfaces.
 *
 * Per-page caller responsibilities:
 *
 *   - Provide a `noticeAttr` (the dataset attribute that uniquely
 *     marks the notice element — `pipelinesCopyNotice` or
 *     `lanesCopyNotice`). The attribute differs per page so a single
 *     DOM containing both pages' fragments (in tests, e.g.) doesn't
 *     produce notice-element collisions.
 *   - Provide a `className` for the notice element (the per-page CSS
 *     selector that styles the notice; matches the existing class
 *     conventions of each page).
 *
 * THESIS Consequence 2: this module never mutates server-side state.
 * Every helper is pure DOM-only; the only side effect is on the
 * passed-in button + its sibling notice element.
 */

/**
 * Result of a copy-builder evaluation.
 *
 *   - `command` — the assembled slash command (always populated so
 *     the live preview can render even when invalid, surfacing the
 *     placeholder shape as typing-feedback).
 *   - `error` — non-null when the build is invalid (missing required
 *     field, CLI-rejected value shape, etc.). When set, the Copy
 *     button must be disabled and the inline notice surfaces this
 *     message to the operator.
 */
export interface CopyBuildResult {
  readonly command: string;
  readonly error: string | null;
}

/**
 * Configuration for a per-page notice element.
 *
 *   - `datasetKey` is the dataset property the notice carries (the
 *     element's `dataset[datasetKey]` is set to `''`). The selector
 *     equivalent is `[data-${kebab(datasetKey)}]`.
 *   - `selector` is the matching CSS selector used by `resolveNotice`
 *     to find an already-created notice element. Caller-supplied so
 *     this module doesn't have to derive kebab-case from camelCase.
 *   - `className` is the CSS class for the notice element. Each page
 *     has its own class (`pipelines-copy-notice` / `lanes-copy-notice`)
 *     so stylesheets can target them independently.
 */
export interface NoticeConfig {
  readonly datasetKey: string;
  readonly selector: string;
  readonly className: string;
}

/**
 * Resolve (or lazily create) the inline notice element adjacent to a
 * Copy button. The notice is a sibling `<p>` injected into the Copy
 * button's parent; on first call it's created and inserted; subsequent
 * calls return the existing element.
 *
 * Insertion is AFTER the button so screen-reader order matches visual
 * order (operator focuses the button, hears "disabled", then reads
 * the notice). When the button has no parent (synthetic test
 * scenarios), the notice element is returned without being inserted —
 * the disabled state alone still prevents the broken paste.
 */
export function resolveNotice(
  button: HTMLButtonElement,
  config: NoticeConfig,
): HTMLElement {
  const existing = button.parentElement?.querySelector<HTMLElement>(
    config.selector,
  );
  if (existing) return existing;
  const notice = document.createElement('p');
  notice.dataset[config.datasetKey] = '';
  notice.className = config.className;
  notice.hidden = true;
  button.parentElement?.insertBefore(notice, button.nextSibling);
  return notice;
}

/**
 * Apply a build result to a Copy button + its adjacent inline notice.
 *
 *   - Invalid result (`error !== null`) → button disabled (with the
 *     `disabled` attribute AND `aria-disabled="true"` for assistive
 *     tech), notice visible with the error text.
 *   - Valid result (`error === null`) → button enabled, notice hidden
 *     and emptied.
 *
 * Idempotent — re-applying the same result is safe.
 */
export function applyResultToCopy(
  button: HTMLButtonElement,
  result: CopyBuildResult,
  config: NoticeConfig,
): void {
  const notice = resolveNotice(button, config);
  if (result.error === null) {
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    notice.hidden = true;
    notice.textContent = '';
    return;
  }
  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');
  notice.hidden = false;
  notice.textContent = result.error;
}
