/**
 * Shared localStorage helpers for the dashboard swimlane controllers.
 *
 * The `swimlane.ts`, `swimlane-collapse.ts`, and `swimlane-view-
 * toggle.ts` controllers all namespace localStorage entries under
 * `deskwork:dashboard:<projectKey>:<suffix>` and all resolve the
 * `<projectKey>` from the bay-shell's `data-project-key` attribute
 * (falling back to the page pathname when the shell lacks one). The
 * map-shaped controllers (collapse + view-toggle) additionally read
 * a `Map<laneId, T>` whose on-disk shape is a JSON object. This
 * module centralises all three pieces — the key prefix, the project-
 * key resolver, and the read+parse boilerplate — so the controllers
 * import a single contract instead of redeclaring it.
 *
 * Failures (no entry / malformed JSON / wrong root type / unknown
 * value shape) all collapse to "empty map" — the controllers treat
 * localStorage as best-effort persistence; in-page state still
 * works without it.
 */

/**
 * Common prefix for every dashboard localStorage key. Controllers
 * append `:<projectKey>:<suffix>` to namespace per-operator state
 * per-project (so two operators sharing a machine but working on
 * different projects don't see each other's lane state).
 */
export const STORAGE_KEY_PREFIX = 'deskwork:dashboard:';

/**
 * Resolve the project key the swimlane controllers use to namespace
 * localStorage entries. The bay-shell carries it as `data-project-
 * key`; in jsdom + tests with no shell, fall back to the page
 * pathname for stable isolation.
 */
export function resolveProjectKey(shell: HTMLElement): string {
  const explicit = shell.dataset.projectKey;
  if (explicit !== undefined && explicit.length > 0) return explicit;
  return window.location.pathname;
}

/**
 * Read a JSON array of strings from localStorage. Returns null on
 * any read failure (missing entry, parse error, wrong root shape).
 * Non-string array elements are dropped. Callers pick their own
 * container type — `swimlane.ts:readStoredSet` projects into a
 * `Set<string>`; `swimlane-drag.ts:readStoredOrder` keeps the
 * positional array (lane order is positional, not set-like).
 *
 * Centralising the read+parse boilerplate avoids drift between the
 * two surfaces while letting each caller pick the in-memory shape
 * that matches its access pattern.
 */
export function readStoredStringArray(key: string): readonly string[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item === 'string') out.push(item);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Read a JSON object from localStorage and project it into a
 * `Map<string, T>` via a per-value type guard. Returns an empty
 * Map on every read failure (missing entry, parse error, wrong
 * root shape).
 *
 * The value-side guard lets each caller declare its own allowed
 * value shape (e.g. `(v): v is ViewMode => v === 'kanban' || v ===
 * 'list'`) without leaking the typed result through a cast.
 */
export function readStoredObjectMap<T>(
  key: string,
  isValidValue: (value: unknown) => value is T,
): Map<string, T> {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return new Map();
    }
    const out = new Map<string, T>();
    for (const [k, v] of Object.entries(parsed)) {
      if (isValidValue(v)) out.set(k, v);
    }
    return out;
  } catch {
    return new Map();
  }
}
