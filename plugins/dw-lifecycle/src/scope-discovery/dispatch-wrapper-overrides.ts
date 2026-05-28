/**
 * plugins/dw-lifecycle/src/scope-discovery/dispatch-wrapper-overrides.ts
 *
 * YAML override loaders + resolved-config resolver for the CLI bridge in
 * `dispatch-wrapper-cli.ts`. Factored out so the CLI module stays under
 * the 500-line file cap.
 *
 * Mirror of the override-loader logic in `dispatch-wrapper.ts` (which
 * keeps its own copy private to its `resolveConfig` so the in-band
 * `wrap()` callers don't accidentally couple to this surface). The
 * duplication is intentional: the in-band path's `WrapOptions` accepts
 * direct overrides for tests, the CLI path's `ResolvedConfig` tracks
 * which lists came from disk so the stderr summary can report it.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  FORBIDDEN_DEFERRAL_PHRASES,
  FORBIDDEN_DEFERRAL_REGEXES,
} from './dispatch-grammar.js';
import { REFACTOR_CONTEXT_MARKERS } from './refactor-preconditions-prompt.js';
import { errorMessage, isEnoent, isPlainObject } from './util/typeguards.js';

const FORBIDDEN_OVERRIDE_PATH =
  '.dw-lifecycle/scope-discovery/forbidden-deferral-phrases.yaml';
const REFACTOR_MARKERS_OVERRIDE_PATH =
  '.dw-lifecycle/scope-discovery/refactor-markers.yaml';

interface ForbiddenOverride {
  readonly phrases: ReadonlyArray<string>;
  readonly regexes: ReadonlyArray<RegExp>;
}

async function loadForbiddenOverride(
  repoRoot: string,
): Promise<ForbiddenOverride | null> {
  const absPath = resolve(repoRoot, FORBIDDEN_OVERRIDE_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new Error(
      `dispatch-wrapper-cli: cannot read override ${absPath}: ${errorMessage(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `dispatch-wrapper-cli: cannot parse override ${absPath}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `dispatch-wrapper-cli: override ${absPath} did not parse to a YAML object`,
    );
  }
  const phrasesRaw = parsed['phrases'];
  const regexesRaw = parsed['regexes'];
  const phrases: string[] = [];
  if (phrasesRaw !== undefined) {
    if (!Array.isArray(phrasesRaw)) {
      throw new Error(
        `dispatch-wrapper-cli: override ${absPath} 'phrases' must be a list when set`,
      );
    }
    phrasesRaw.forEach((p: unknown, i: number) => {
      if (typeof p !== 'string' || p.length === 0) {
        throw new Error(
          `dispatch-wrapper-cli: override ${absPath} phrases[${i}] must be a non-empty string`,
        );
      }
      phrases.push(p);
    });
  }
  const regexes: RegExp[] = [];
  if (regexesRaw !== undefined) {
    if (!Array.isArray(regexesRaw)) {
      throw new Error(
        `dispatch-wrapper-cli: override ${absPath} 'regexes' must be a list when set`,
      );
    }
    regexesRaw.forEach((r: unknown, i: number) => {
      if (typeof r !== 'string' || r.length === 0) {
        throw new Error(
          `dispatch-wrapper-cli: override ${absPath} regexes[${i}] must be a non-empty string`,
        );
      }
      try {
        regexes.push(new RegExp(r, 'i'));
      } catch (err) {
        throw new Error(
          `dispatch-wrapper-cli: override ${absPath} regexes[${i}] is not a valid RegExp: ${errorMessage(err)}`,
        );
      }
    });
  }
  if (phrases.length === 0 && regexes.length === 0) {
    throw new Error(
      `dispatch-wrapper-cli: override ${absPath} produced zero phrases AND zero regexes ` +
        `(operator must supply at least one when overriding the built-in list)`,
    );
  }
  return { phrases, regexes };
}

async function loadRefactorMarkersOverride(
  repoRoot: string,
): Promise<ReadonlyArray<RegExp> | null> {
  const absPath = resolve(repoRoot, REFACTOR_MARKERS_OVERRIDE_PATH);
  let text: string;
  try {
    text = await readFile(absPath, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw new Error(
      `dispatch-wrapper-cli: cannot read override ${absPath}: ${errorMessage(err)}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new Error(
      `dispatch-wrapper-cli: cannot parse override ${absPath}: ${errorMessage(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      `dispatch-wrapper-cli: override ${absPath} did not parse to a YAML object`,
    );
  }
  const markersRaw = parsed['markers'];
  if (!Array.isArray(markersRaw)) {
    throw new Error(
      `dispatch-wrapper-cli: override ${absPath} missing required 'markers:' list`,
    );
  }
  const markers: RegExp[] = [];
  markersRaw.forEach((m: unknown, i: number) => {
    if (typeof m !== 'string' || m.length === 0) {
      throw new Error(
        `dispatch-wrapper-cli: override ${absPath} markers[${i}] must be a non-empty string`,
      );
    }
    try {
      markers.push(new RegExp(m, 'i'));
    } catch (err) {
      throw new Error(
        `dispatch-wrapper-cli: override ${absPath} markers[${i}] is not a valid RegExp: ${errorMessage(err)}`,
      );
    }
  });
  if (markers.length === 0) {
    throw new Error(
      `dispatch-wrapper-cli: override ${absPath} produced zero markers (must have at least one)`,
    );
  }
  return markers;
}

/**
 * Active phrase / regex / marker lists after applying any on-disk
 * overrides. The two `*FromOverride` booleans let the CLI summary
 * report which lists came from disk vs. defaults.
 */
export interface ResolvedConfig {
  readonly phrases: ReadonlyArray<string>;
  readonly regexes: ReadonlyArray<RegExp>;
  readonly markers: ReadonlyArray<RegExp>;
  readonly phrasesFromOverride: boolean;
  readonly markersFromOverride: boolean;
}

export async function resolveCliConfig(repoRoot: string): Promise<ResolvedConfig> {
  let phrases: ReadonlyArray<string> = FORBIDDEN_DEFERRAL_PHRASES;
  let regexes: ReadonlyArray<RegExp> = FORBIDDEN_DEFERRAL_REGEXES;
  let markers: ReadonlyArray<RegExp> = REFACTOR_CONTEXT_MARKERS;
  let phrasesFromOverride = false;
  let markersFromOverride = false;

  const phraseOverride = await loadForbiddenOverride(repoRoot);
  if (phraseOverride !== null) {
    phrases = phraseOverride.phrases;
    regexes = phraseOverride.regexes;
    phrasesFromOverride = true;
  }
  const markerOverride = await loadRefactorMarkersOverride(repoRoot);
  if (markerOverride !== null) {
    markers = markerOverride;
    markersFromOverride = true;
  }
  return { phrases, regexes, markers, phrasesFromOverride, markersFromOverride };
}
