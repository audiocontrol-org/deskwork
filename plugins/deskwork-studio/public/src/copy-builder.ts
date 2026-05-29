/**
 * Shared copy-builder helper for clipboard-action buttons.
 *
 * Extracted from `lanes/lanes-page.ts` and `pipelines/pipelines-page.ts`
 * after Phase 6 Task 6.4 introduced the second consumer. Both
 * copy-builder controllers (and any future studio surface that ships
 * a "build a slash command via fields, copy the result" affordance —
 * Task 6.5's pipeline-migration tray, etc.) need exactly the same
 * post-copy affirmation: green "Copied ✓" flash for
 * `COPIED_FLASH_MS` then revert.
 *
 * `copyAndFlash` calls `copyOrShowFallback` (the shared clipboard
 * helper). On success it flips the button into the affirmation state;
 * on fallback (insecure context, denied permission) the fallback
 * panel handles operator-side affordance, so the button does NOT
 * flash — the fallback panel IS the feedback signal.
 *
 * Leaf module: imports only from `./clipboard.ts`. No DOM-specific
 * styling lives here — the `.is-copied` class lives in
 * `lanes-page.css` and `pipelines-page.css` (and any consumer
 * stylesheet must define it).
 */

import { copyOrShowFallback } from './clipboard.ts';

export const COPIED_FLASH_MS = 1500;

/**
 * Quote an operator-supplied value for inclusion in a slash command.
 *
 * Uses `JSON.stringify` to wrap the value in double quotes and escape
 * embedded quotes, backslashes, and control characters. Applied
 * uniformly to every value routed into a slash-command builder so
 * the output parses identically across shells and Claude Code's slash
 * parser (and so a value with spaces or quotes can't slip through as
 * an injection surface if pasted into a shell).
 *
 * Shared across `lanes-page.ts`, `pipelines-page.ts`, and any future
 * copy-builder surface — keeping one source of truth ensures the
 * quoting contract is identical across surfaces.
 */
export function quoteValue(value: string): string {
  return JSON.stringify(value);
}

const FALLBACK_MESSAGE =
  'Clipboard unavailable — select and Cmd-C to copy this command, then paste it into Claude Code:';

export async function copyAndFlash(
  command: string,
  button: HTMLButtonElement,
  successMessage: string,
): Promise<void> {
  const original = button.textContent;
  const ok = await copyOrShowFallback(command, {
    successMessage,
    fallbackMessage: FALLBACK_MESSAGE,
  });
  if (ok) {
    button.classList.add('is-copied');
    button.textContent = 'Copied ✓';
    window.setTimeout(() => {
      button.classList.remove('is-copied');
      if (original !== null) button.textContent = original;
    }, COPIED_FLASH_MS);
  }
}
