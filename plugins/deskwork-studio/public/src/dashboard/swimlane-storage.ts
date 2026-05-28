/**
 * Shared localStorage helpers for the dashboard swimlane controllers.
 *
 * The `swimlane-collapse.ts` and `swimlane-view-toggle.ts`
 * controllers both store per-lane state at
 * `deskwork:dashboard:<projectKey>:<suffix>` and both read it back
 * as `Map<laneId, T>` where the on-disk shape is a JSON object.
 * This module centralises the read+parse boilerplate so the
 * controllers can call a typed function with a per-value validator.
 *
 * Failures (no entry / malformed JSON / wrong root type / unknown
 * value shape) all collapse to "empty map" — the controllers treat
 * localStorage as best-effort persistence; in-page state still
 * works without it.
 */

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
