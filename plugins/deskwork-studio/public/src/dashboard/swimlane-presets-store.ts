/**
 * Pure preset-store helpers for the Phase 5 Task 5.5 saveable focus
 * presets feature. Holds the `FocusPreset` type, the storage-key
 * resolvers, the snapshot + apply + save + delete + list functions —
 * everything that DOES NOT touch the DOM-bound controller wiring.
 *
 * Split from `swimlane-presets.ts` to keep both files under the
 * project's 300–500 line cap. The controller imports from here; the
 * jsdom test suite also imports from here so it can verify snapshot
 * + apply round-trips without instantiating the full controller.
 *
 * Per THESIS Consequence 2 (no sidecar mutation): every helper here
 * operates on localStorage. No CLI calls, no `writeSidecar`, no
 * `journal.append`. Failures collapse to the read-empty / write-no-op
 * fallbacks the other Phase 5 controllers already use.
 */

import {
  readStoredObjectMap,
  STORAGE_KEY_PREFIX,
} from './swimlane-storage.ts';
import { reapplyFromStorage as reapplySwimlaneFromStorage } from './swimlane.ts';
import { reapplyCollapseFromStorage } from './swimlane-collapse.ts';
import { reapplyViewToggleFromStorage } from './swimlane-view-toggle.ts';

const PRESETS_KEY_SUFFIX = ':focus-presets';
const FOCUS_KEY_SUFFIX = ':focus';
const VISIBILITY_KEY_SUFFIX = ':visibility';
const VIEW_MODE_KEY_SUFFIX = ':view-mode';
const LANE_COLLAPSE_KEY_SUFFIX = ':lane-collapse';
const STAGE_COLLAPSE_KEY_SUFFIX = ':stage-collapse';

type ViewMode = 'kanban' | 'list';

export interface FocusPreset {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly visibleLanes: readonly string[];
  readonly focusedLanes: readonly string[];
  readonly viewModePerLane: Readonly<Record<string, ViewMode>>;
  readonly laneCollapseState: Readonly<Record<string, boolean>>;
  /**
   * Collapsed stages per lane (collapsed names only). Per
   * AUDIT-20260528-37 (F6): the array shape replaces the older
   * `Record<stageName, boolean>` shape which silently dropped
   * `false` flags through the snapshot/apply round-trip. Legacy
   * presets are migrated on read (see `coerceStageCollapseState`).
   */
  readonly stageCollapseState: Readonly<Record<string, readonly string[]>>;
}

export function presetsKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + PRESETS_KEY_SUFFIX;
}

function focusKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + FOCUS_KEY_SUFFIX;
}

function visibilityKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + VISIBILITY_KEY_SUFFIX;
}

function viewModeKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + VIEW_MODE_KEY_SUFFIX;
}

function laneCollapseKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + LANE_COLLAPSE_KEY_SUFFIX;
}

function stageCollapseKey(projectKey: string): string {
  return STORAGE_KEY_PREFIX + projectKey + STAGE_COLLAPSE_KEY_SUFFIX;
}

function isViewMode(value: unknown): value is ViewMode {
  return value === 'kanban' || value === 'list';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function isObject(value: unknown): value is { readonly [k: string]: unknown } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isBooleanFlagMap(value: unknown): value is {
  readonly [k: string]: boolean;
} {
  if (!isObject(value)) return false;
  for (const flag of Object.values(value)) {
    if (typeof flag !== 'boolean') return false;
  }
  return true;
}

/**
 * Coerce a per-lane stage-collapse value into the canonical readonly-
 * string-array shape. Accepts either:
 *
 *   - the new shape: `readonly string[]` (array of collapsed stage
 *     names); returned as-is.
 *   - the legacy shape: `Record<string, boolean>` from presets saved
 *     before AUDIT-20260528-37 (F6); returns the names whose flag
 *     was `true` (uncollapsed entries are dropped — they're the same
 *     as "not present" under the new shape).
 *
 * Unrecognised shapes coerce to an empty array (no collapsed
 * stages). The migration runs on read, so an older preset reopens
 * with the right semantics without forcing the operator to re-save.
 */
function coerceStageCollapseInner(value: unknown): readonly string[] {
  if (isStringArray(value)) return value;
  if (isBooleanFlagMap(value)) {
    const out: string[] = [];
    for (const [stage, flag] of Object.entries(value)) {
      if (flag) out.push(stage);
    }
    return out;
  }
  return [];
}

/**
 * Coerce the outer `stageCollapseState` object into the canonical
 * `Record<laneId, readonly string[]>` shape, applying
 * `coerceStageCollapseInner` to every lane's value. The result is
 * always a fresh object — the caller can freeze it without aliasing
 * the parsed-JSON tree.
 */
function coerceStageCollapseState(
  value: unknown,
): Record<string, readonly string[]> {
  if (!isObject(value)) return {};
  const out: Record<string, readonly string[]> = {};
  for (const [laneId, inner] of Object.entries(value)) {
    out[laneId] = coerceStageCollapseInner(inner);
  }
  return out;
}

/**
 * Best-effort coercion of a parsed JSON value into a `FocusPreset`.
 * Returns the normalised preset on success, `null` on any required-
 * field failure (missing id / name / createdAt, malformed visible /
 * focused / view-mode / lane-collapse). The stage-collapse axis
 * accepts either the new array shape OR the legacy boolean-map
 * shape (see `coerceStageCollapseState`).
 *
 * Returning null lets the storage reader silently skip malformed
 * entries while keeping the rest of the presets readable — the
 * controller treats localStorage as best-effort persistence.
 */
function coercePreset(value: unknown): FocusPreset | null {
  if (!isObject(value)) return null;
  if (typeof value.id !== 'string') return null;
  if (typeof value.name !== 'string') return null;
  if (typeof value.createdAt !== 'string') return null;
  if (!isStringArray(value.visibleLanes)) return null;
  if (!isStringArray(value.focusedLanes)) return null;
  if (!isObject(value.viewModePerLane)) return null;
  const viewModePerLane: Record<string, ViewMode> = {};
  for (const [laneId, mode] of Object.entries(value.viewModePerLane)) {
    if (!isViewMode(mode)) return null;
    viewModePerLane[laneId] = mode;
  }
  if (!isBooleanFlagMap(value.laneCollapseState)) return null;
  const stageCollapseState = coerceStageCollapseState(value.stageCollapseState);
  return {
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    visibleLanes: value.visibleLanes,
    focusedLanes: value.focusedLanes,
    viewModePerLane,
    laneCollapseState: value.laneCollapseState,
    stageCollapseState,
  };
}

/**
 * Read the presets store from localStorage. Returns an empty Map on
 * any read failure (missing entry, parse error, wrong root shape) —
 * the controller treats localStorage as best-effort persistence and
 * never throws on read. Per-entry coercion applies the legacy →
 * canonical stage-collapse migration (see `coerceStageCollapseState`).
 */
export function readPresets(projectKey: string): Map<string, FocusPreset> {
  const out = new Map<string, FocusPreset>();
  try {
    const raw = window.localStorage.getItem(presetsKey(projectKey));
    if (raw === null) return out;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return out;
    }
    for (const [id, entry] of Object.entries(parsed)) {
      const preset = coercePreset(entry);
      if (preset !== null) out.set(id, preset);
    }
    return out;
  } catch {
    return out;
  }
}

/**
 * Persist the presets store to localStorage. Returns true when the
 * write landed; returns false when `localStorage.setItem` threw
 * (QuotaExceededError, Safari private-mode SecurityError, the
 * browser disabling persistent storage). Per AUDIT-20260530-44 the
 * earlier signature swallowed the error and returned `void`, which
 * let the caller paint a green success flash on a write that never
 * landed. The boolean lets the caller branch on persistence
 * truthfully.
 *
 * The thrown Error is surfaced via `console.warn` with the storage
 * key so an operator opening devtools after a failed save sees which
 * key failed and what the underlying browser error was — the silent
 * swallow blocked that diagnostic path.
 */
function writePresets(
  projectKey: string,
  presets: ReadonlyMap<string, FocusPreset>,
): boolean {
  try {
    const obj: Record<string, FocusPreset> = {};
    for (const [id, preset] of presets) {
      obj[id] = preset;
    }
    window.localStorage.setItem(presetsKey(projectKey), JSON.stringify(obj));
    return true;
  } catch (err) {
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    // eslint-disable-next-line no-console
    console.warn(
      `[deskwork] writePresets failed for key ${presetsKey(projectKey)}: ${reason}`,
    );
    return false;
  }
}

function collectAllLaneIds(): string[] {
  const out: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('[data-rail-lane]')) {
    const id = el.dataset.railLane;
    if (id !== undefined) out.push(id);
  }
  return out;
}

/**
 * Filter a stored lane-id list against the live lane set, preserving
 * the stored order. Mirrors the read-time-filter discipline of
 * `reconcileOrder` in `swimlane-reorder.ts`: dead ids are dropped
 * silently, no exception, no write-back to the source preset. The
 * caller writes the filtered list to the live storage key while the
 * saved preset on disk remains untouched.
 *
 * Per AUDIT-20260530-45 (cross-model: AUDIT-BARRAGE-claude-P5-3):
 * without this filter, `applyPreset` and `snapshotCurrentState`
 * persisted lane ids for renamed / archived / purged lanes verbatim,
 * accumulating dead references indefinitely. The drag-order
 * controller's `reconcileOrder` already defends against the same
 * failure mode; this helper closes the asymmetry in the preset path.
 *
 * Read-time-filter vs self-heal-write choice: this helper follows
 * `reconcileOrder` exactly — no rewrite of the stored preset. A
 * self-heal write-back would (a) double the failure surface (every
 * apply could fail a localStorage quota check), (b) silently mutate
 * presets across browsers when the same id minted independently
 * (cross-machine deep-link presets exist but resolve to nothing per
 * AUDIT-20260530-47), and (c) make the apply boundary non-idempotent.
 * Leaving the saved preset untouched lets the operator inspect or
 * re-save the preset under a new name if they want a "clean" copy.
 */
function reconcileLaneIds(
  stored: readonly string[],
  live: readonly string[],
): string[] {
  const liveSet = new Set(live);
  return stored.filter((id) => liveSet.has(id));
}

function readJsonArrayOfStrings(key: string): string[] {
  const out: string[] = [];
  const raw = window.localStorage.getItem(key);
  if (raw === null) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const v of parsed) if (typeof v === 'string') out.push(v);
    }
  } catch {
    // Read collapsed to empty.
  }
  return out;
}

/**
 * Read the EFFECTIVE per-lane view-mode from the live DOM.
 *
 * The DOM is the source of truth for "what the operator currently
 * sees" because the view-toggle controller's viewport-derived default
 * (mobile→list, desktop→kanban) is applied as `.view-kanban` /
 * `.view-list` classes on each `.swim` element BUT is never persisted
 * to localStorage — only explicit operator toggle clicks write the
 * `view-mode` storage key. Reading from storage would therefore miss
 * the viewport default for any lane the operator hasn't explicitly
 * toggled (per AUDIT-20260528-38).
 *
 * Returns a `Record<laneId, ViewMode>` covering every `.swim` with a
 * recognised class. Swims without either class are skipped (the
 * controller's `applySwimMode` always sets one, so the omission would
 * only happen for a transient pre-init paint).
 */
function readEffectiveViewModeFromDom(): Record<string, ViewMode> {
  const out: Record<string, ViewMode> = {};
  for (const swim of document.querySelectorAll<HTMLElement>(
    '.swim[data-lane-id]',
  )) {
    const laneId = swim.dataset.laneId;
    if (laneId === undefined) continue;
    if (swim.classList.contains('view-list')) {
      out[laneId] = 'list';
    } else if (swim.classList.contains('view-kanban')) {
      out[laneId] = 'kanban';
    }
  }
  return out;
}

/**
 * Snapshot the operator's current view across all four state axes
 * for `Save current as preset…`.
 *
 * Per-axis sourcing:
 *
 *   - visibility (`visibleLanes`): rail rows (operator-perceivable
 *     inventory) minus hidden-set storage key.
 *   - focus (`focusedLanes`): focus storage key (controller writes
 *     it on every chip click; persistence in lockstep with DOM).
 *   - view-mode (`viewModePerLane`): EFFECTIVE mode from the live
 *     `.swim.view-kanban` / `.swim.view-list` classes (per
 *     AUDIT-20260528-38). Reading storage would miss the viewport-
 *     derived default the view-toggle controller applies on init
 *     without persisting (mobile→list / desktop→kanban). The DOM
 *     carries the resolved mode; the snapshot reflects what the
 *     operator actually sees.
 *   - lane-collapse / stage-collapse: collapse storage keys (the
 *     collapse controller persists every toggle, so storage matches
 *     the DOM and is structurally simpler to read).
 */
export function snapshotCurrentState(projectKey: string): {
  visibleLanes: readonly string[];
  focusedLanes: readonly string[];
  viewModePerLane: Record<string, ViewMode>;
  laneCollapseState: Record<string, boolean>;
  stageCollapseState: Record<string, readonly string[]>;
} {
  // visible-lanes is `all lanes − hidden set`. Reading allLanes from
  // the rail rows is the most-faithful source — the rail is the
  // operator-perceivable inventory. The filter `allLanes.filter(...)`
  // already constrains the result to live ids, so no further
  // reconciliation is needed for the visibility axis at snapshot time.
  const allLanes = collectAllLaneIds();
  const hidden = new Set(readJsonArrayOfStrings(visibilityKey(projectKey)));
  const visibleLanes = allLanes.filter((id) => !hidden.has(id));

  // Per AUDIT-20260530-45 — reconcile :focus storage against the
  // live lane set before capturing. Without this filter, a corrupted
  // or stale :focus key (lane renamed/archived/purged after the focus
  // chip was last clicked) would propagate dead ids into the
  // newly-minted preset, where they would be unfixable except by
  // operator inspection. Mirrors `reconcileOrder`'s read-time-filter
  // discipline.
  const focusedLanes = reconcileLaneIds(
    readJsonArrayOfStrings(focusKey(projectKey)),
    allLanes,
  );

  // view-mode: read EFFECTIVE per-lane mode from the live DOM, not
  // from storage. See `readEffectiveViewModeFromDom` for the why.
  const viewModePerLane = readEffectiveViewModeFromDom();

  const laneCollapseState: Record<string, boolean> = {};
  for (const laneId of readJsonArrayOfStrings(laneCollapseKey(projectKey))) {
    laneCollapseState[laneId] = true;
  }

  // Stage-collapse: storage holds `Record<laneId, string[]>` already.
  // Per AUDIT-20260528-37 (F6) the snapshot retains the array shape
  // — only collapsed stage names are present, so an absent lane key
  // or absent stage name unambiguously means "not collapsed."
  const stageCollapseState: Record<string, readonly string[]> = {};
  const stageMap = readStoredObjectMap<readonly string[]>(
    stageCollapseKey(projectKey),
    isStringArray,
  );
  for (const [laneId, stages] of stageMap) {
    if (stages.length > 0) stageCollapseState[laneId] = stages;
  }

  return {
    visibleLanes,
    focusedLanes,
    viewModePerLane,
    laneCollapseState,
    stageCollapseState,
  };
}

function writeJsonOrIgnore(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable — DOM apply still happens.
  }
}

/**
 * Apply a preset by writing through its four state axes to the
 * constituent storage keys, then re-applying each controller's DOM
 * state from storage in the documented sequence:
 *
 *   1. visibility — gate for focus (hidden lanes can't be focused).
 *   2. view-mode — independent axis; reapply doesn't depend on focus.
 *   3. collapse — independent axis; lane + stage scope.
 *   4. focus — last, because the visibility pass establishes the
 *      universe of focusable lanes and may force-hide a lane that
 *      the preset's `focusedLanes` then re-includes.
 *
 * Storage writes happen FIRST (all four axes) so each `reapply*`
 * call reads a consistent post-preset world. Calling reapply between
 * writes would race the controllers against a partial state.
 */
export function applyPreset(projectKey: string, preset: FocusPreset): void {
  // Per AUDIT-20260530-45 — reconcile every lane-id-bearing axis
  // against the live lane set BEFORE the storage writes. A preset
  // captured when N lanes existed can be applied later when one or
  // more of those lanes has been renamed/archived/purged. Mirrors
  // `reconcileOrder`'s read-time-filter discipline (the saved preset
  // on disk is left untouched; only the live storage writes reflect
  // the intersection).
  const allLanes = collectAllLaneIds();
  const reconciledVisible = reconcileLaneIds(preset.visibleLanes, allLanes);
  const reconciledFocused = reconcileLaneIds(preset.focusedLanes, allLanes);

  // 1. Visibility — visible-lanes is the inverse of the on-disk
  //    `hidden` set. Rebuild as "every lane known to the page that's
  //    NOT in the reconciled visibleLanes set." Using the reconciled
  //    set (rather than the verbatim preset set) keeps the hidden
  //    write symmetric with the visible write — if the preset
  //    contained a dead id, that id is dropped from both sides
  //    rather than being silently dropped on the hidden side only
  //    (the pre-fix `allLanes.filter` already filtered the hidden
  //    side; this aligns the visible side).
  const visibleSet = new Set(reconciledVisible);
  const hidden = allLanes.filter((id) => !visibleSet.has(id));
  writeJsonOrIgnore(visibilityKey(projectKey), hidden);

  // 2. View-mode — per-lane map.
  writeJsonOrIgnore(viewModeKey(projectKey), preset.viewModePerLane);

  // 3a. Lane-collapse — array of collapsed-lane ids.
  const collapsedLanes: string[] = [];
  for (const [laneId, flag] of Object.entries(preset.laneCollapseState)) {
    if (flag) collapsedLanes.push(laneId);
  }
  writeJsonOrIgnore(laneCollapseKey(projectKey), collapsedLanes);

  // 3b. Stage-collapse — `Record<laneId, string[]>`. Per
  //     AUDIT-20260528-37 (F6) the preset already carries the array
  //     shape (collapsed stage names only); empty arrays drop out
  //     so the controller's "no collapsed stages for this lane"
  //     branch is reached via key absence rather than empty array.
  const stageOut: Record<string, readonly string[]> = {};
  for (const [laneId, stages] of Object.entries(preset.stageCollapseState)) {
    if (stages.length > 0) stageOut[laneId] = stages;
  }
  writeJsonOrIgnore(stageCollapseKey(projectKey), stageOut);

  // 4. Focus — focused-lanes array. Per AUDIT-20260530-45 the write
  //    uses the reconciled list (dead ids dropped) so the post-apply
  //    :focus key never references a lane the live page doesn't have.
  writeJsonOrIgnore(focusKey(projectKey), reconciledFocused);

  // Re-apply each constituent controller from storage. Order in the
  // visual / DOM apply matters less than the storage-write order
  // (which is the authoritative sequence) but still follows the
  // contract: lane chrome resolves (view-mode + collapse) → focus
  // pass paints visibility + focus state in lockstep.
  reapplyViewToggleFromStorage();
  reapplyCollapseFromStorage();
  reapplySwimlaneFromStorage();
}

/**
 * Result of a `savePresetFromCurrent` call. The discriminated union
 * forces the caller to branch on persistence success rather than
 * trusting that the in-memory `FocusPreset` reached disk. Per
 * AUDIT-20260530-44 the previous unconditional-`FocusPreset` return
 * let the controller paint a green success flash on writes that
 * silently failed (quota exceeded, Safari private mode); the
 * controller now gates its success affordance on `ok === true`.
 */
export type SavePresetResult =
  | { readonly ok: true; readonly preset: FocusPreset }
  | { readonly ok: false };

/**
 * Save a snapshot of the current state under a new id + name. The
 * id is a timestamp-derived token — collision-resistant for human
 * use without dragging in a UUID library. The createdAt timestamp
 * is the same instant, ISO-8601.
 *
 * Returns `{ ok: true, preset }` when the preset was minted AND the
 * underlying `writePresets` call landed in localStorage. Returns
 * `{ ok: false }` when `writePresets` returned false (quota
 * exceeded, Safari private mode, persistent storage disabled). The
 * caller MUST branch on `result.ok` before surfacing success
 * affordances — see `handleSaveClick` in `swimlane-presets.ts`.
 */
export function savePresetFromCurrent(
  projectKey: string,
  name: string,
): SavePresetResult {
  const now = new Date();
  const presets = readPresets(projectKey);
  // Per AUDIT-20260528-34 — `p${Date.now().toString(36)}` is
  // millisecond-resolution and silently overwrites on collision
  // (a same-ms second save erases the first). Append a short
  // base-36 random suffix so two saves in the same millisecond
  // produce distinct ids; on the rare collision-of-the-suffix
  // path, bump until a free id is found.
  let id = `p${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  let collisionGuard = 0;
  while (presets.has(id)) {
    collisionGuard += 1;
    if (collisionGuard > 16) {
      throw new Error(
        'savePresetFromCurrent: failed to mint a unique preset id after 16 attempts',
      );
    }
    id = `p${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  }
  const snapshot = snapshotCurrentState(projectKey);
  const preset: FocusPreset = {
    id,
    name,
    createdAt: now.toISOString(),
    visibleLanes: snapshot.visibleLanes,
    focusedLanes: snapshot.focusedLanes,
    viewModePerLane: snapshot.viewModePerLane,
    laneCollapseState: snapshot.laneCollapseState,
    stageCollapseState: snapshot.stageCollapseState,
  };
  presets.set(id, preset);
  const persisted = writePresets(projectKey, presets);
  if (!persisted) return { ok: false };
  return { ok: true, preset };
}

/**
 * Delete a preset by id. Returns true when the preset was present
 * and removed; false when the id wasn't in the store.
 */
export function deletePreset(projectKey: string, id: string): boolean {
  const presets = readPresets(projectKey);
  if (!presets.has(id)) return false;
  presets.delete(id);
  writePresets(projectKey, presets);
  return true;
}

/**
 * List all stored presets, sorted by creation timestamp (oldest
 * first). The order matches what the Load dropdown surfaces to the
 * operator — first-created at the top, newest at the bottom — so
 * the operator's mental model of "I just saved one; it should be
 * the latest entry" matches the surface.
 */
export function listPresets(projectKey: string): readonly FocusPreset[] {
  const presets = readPresets(projectKey);
  return Array.from(presets.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

/**
 * Parse the `?preset=<id>` parameter from the current URL. Returns
 * the trimmed id when present + non-empty, otherwise null.
 */
export function parsePresetIdFromUrl(): string | null {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('preset');
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}
