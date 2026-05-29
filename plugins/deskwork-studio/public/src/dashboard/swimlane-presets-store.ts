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
  readonly stageCollapseState: Readonly<
    Record<string, Readonly<Record<string, boolean>>>
  >;
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

function isPreset(value: unknown): value is FocusPreset {
  if (!isObject(value)) return false;
  if (typeof value.id !== 'string') return false;
  if (typeof value.name !== 'string') return false;
  if (typeof value.createdAt !== 'string') return false;
  if (!isStringArray(value.visibleLanes)) return false;
  if (!isStringArray(value.focusedLanes)) return false;
  if (!isObject(value.viewModePerLane)) return false;
  for (const mode of Object.values(value.viewModePerLane)) {
    if (!isViewMode(mode)) return false;
  }
  if (!isBooleanFlagMap(value.laneCollapseState)) return false;
  if (!isObject(value.stageCollapseState)) return false;
  for (const inner of Object.values(value.stageCollapseState)) {
    if (!isBooleanFlagMap(inner)) return false;
  }
  return true;
}

/**
 * Read the presets store from localStorage. Returns an empty Map on
 * any read failure (missing entry, parse error, wrong root shape) —
 * the controller treats localStorage as best-effort persistence and
 * never throws on read.
 */
export function readPresets(projectKey: string): Map<string, FocusPreset> {
  return readStoredObjectMap(presetsKey(projectKey), isPreset);
}

function writePresets(
  projectKey: string,
  presets: ReadonlyMap<string, FocusPreset>,
): void {
  try {
    const obj: Record<string, FocusPreset> = {};
    for (const [id, preset] of presets) {
      obj[id] = preset;
    }
    window.localStorage.setItem(presetsKey(projectKey), JSON.stringify(obj));
  } catch {
    // localStorage unavailable — in-page state still works.
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
  stageCollapseState: Record<string, Record<string, boolean>>;
} {
  // visible-lanes is `all lanes − hidden set`. Reading allLanes from
  // the rail rows is the most-faithful source — the rail is the
  // operator-perceivable inventory.
  const allLanes = collectAllLaneIds();
  const hidden = new Set(readJsonArrayOfStrings(visibilityKey(projectKey)));
  const visibleLanes = allLanes.filter((id) => !hidden.has(id));

  const focusedLanes = readJsonArrayOfStrings(focusKey(projectKey));

  // view-mode: read EFFECTIVE per-lane mode from the live DOM, not
  // from storage. See `readEffectiveViewModeFromDom` for the why.
  const viewModePerLane = readEffectiveViewModeFromDom();

  const laneCollapseState: Record<string, boolean> = {};
  for (const laneId of readJsonArrayOfStrings(laneCollapseKey(projectKey))) {
    laneCollapseState[laneId] = true;
  }

  const stageCollapseState: Record<string, Record<string, boolean>> = {};
  const stageMap = readStoredObjectMap<readonly string[]>(
    stageCollapseKey(projectKey),
    isStringArray,
  );
  for (const [laneId, stages] of stageMap) {
    const inner: Record<string, boolean> = {};
    for (const stage of stages) inner[stage] = true;
    stageCollapseState[laneId] = inner;
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
  // 1. Visibility — visible-lanes is the inverse of the on-disk
  //    `hidden` set. Rebuild as "every lane known to the page that's
  //    NOT in the preset's visibleLanes set."
  const allLanes = collectAllLaneIds();
  const visibleSet = new Set(preset.visibleLanes);
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

  // 3b. Stage-collapse — `Record<laneId, string[]>`.
  const stageOut: Record<string, string[]> = {};
  for (const [laneId, inner] of Object.entries(preset.stageCollapseState)) {
    const stages: string[] = [];
    for (const [stage, flag] of Object.entries(inner)) {
      if (flag) stages.push(stage);
    }
    if (stages.length > 0) stageOut[laneId] = stages;
  }
  writeJsonOrIgnore(stageCollapseKey(projectKey), stageOut);

  // 4. Focus — focused-lanes array.
  writeJsonOrIgnore(focusKey(projectKey), preset.focusedLanes);

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
 * Save a snapshot of the current state under a new id + name.
 * Returns the saved preset. The id is a timestamp-derived token —
 * collision-resistant for human use without dragging in a UUID
 * library. The createdAt timestamp is the same instant, ISO-8601.
 */
export function savePresetFromCurrent(
  projectKey: string,
  name: string,
): FocusPreset {
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
  writePresets(projectKey, presets);
  return preset;
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
