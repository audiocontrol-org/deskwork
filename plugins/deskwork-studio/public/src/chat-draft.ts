/**
 * localStorage-backed draft persistence for the chat panel input.
 *
 * Key shape: `chat-draft:<projectRoot>` — the project root comes from
 * `document.body.dataset.projectRoot` so different worktrees on the
 * same origin keep separate drafts. Best-effort: storage may be
 * unavailable (private mode, quota) and the helpers swallow those
 * errors silently.
 */

const DEFAULT_DEBOUNCE_MS = 200;

export interface ChatDraftStore {
  /** Read the persisted draft (empty string if missing or storage unavailable). */
  read(): string;
  /** Schedule a write debounced by `debounceMs`. */
  scheduleWrite(value: string): void;
  /** Write immediately (used for clear-on-send and prefill). */
  writeNow(value: string): void;
  /** Cancel any pending scheduled write. */
  cancel(): void;
}

export function createChatDraftStore(
  key: string,
  debounceMs = DEFAULT_DEBOUNCE_MS,
): ChatDraftStore {
  let timer: number | null = null;
  return {
    read(): string {
      try {
        return window.localStorage.getItem(key) ?? '';
      } catch {
        return '';
      }
    },
    scheduleWrite(value: string): void {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        writePersisted(key, value);
        timer = null;
      }, debounceMs);
    },
    writeNow(value: string): void {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
      writePersisted(key, value);
    },
    cancel(): void {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    },
  };
}

function writePersisted(key: string, value: string): void {
  try {
    if (value === '') window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Ignore — drafts are best-effort.
  }
}
