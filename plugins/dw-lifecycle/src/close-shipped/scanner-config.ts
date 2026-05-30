// Config loader for the close-shipped commit-log walker.
//
// Phase 14 / #369: adds a project-level knob that opts adopters with the
// end-of-subject `(#NNN)` commit convention back into the parens match
// Phase 13 dropped. The knob is opt-in (default false); adopters who
// follow GitHub's auto-close grammar strictly (Closes / Fixes / Resolves)
// don't set the config file and get Phase 13's strict behavior.
//
// Config file lives at `<projectRoot>/.dw-lifecycle/close-shipped-config.yaml`.
// When the file is absent or any field is missing, defaults hold.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface ScannerConfig {
  /**
   * When true, the commit-log walker re-enables the `parens` match shape
   * but anchored at end-of-subject only (`/\(#(\d+)\)\s*$/`). Body and
   * mid-subject parens stay dropped regardless. Default false (Phase 13
   * strict behavior).
   *
   * Adopters whose commit-message convention uses `feat(scope): subject
   * (#NNN)` to name fix-shipping commits set this to true. Adopters who
   * use explicit fix verbs (Closes / Fixes / Resolves) leave it false.
   */
  readonly treatEndOfSubjectParensAsFixMarker: boolean;
}

export const DEFAULT_SCANNER_CONFIG: ScannerConfig = {
  treatEndOfSubjectParensAsFixMarker: false,
};

export class ScannerConfigParseError extends Error {
  override name = 'ScannerConfigParseError';
}

function configPath(projectRoot: string): string {
  return join(projectRoot, '.dw-lifecycle', 'close-shipped-config.yaml');
}

/**
 * Load the close-shipped scanner config from the project root. Returns
 * defaults when the file is absent. Throws ScannerConfigParseError on
 * malformed YAML; missing-but-not-malformed fields fall back to defaults.
 *
 * The strict "throw on malformed YAML" behavior matches the rest of the
 * dw-lifecycle config-loader family — a present-but-broken config file is
 * an operator-actionable error, not a silent fallback.
 */
export function loadScannerConfig(projectRoot: string): ScannerConfig {
  const path = configPath(projectRoot);
  if (!existsSync(path)) {
    return DEFAULT_SCANNER_CONFIG;
  }
  const text = readFileSync(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ScannerConfigParseError(
      `Failed to parse ${path}: ${msg.split('\n')[0] ?? msg}`,
    );
  }
  if (parsed === null || typeof parsed !== 'object') {
    return DEFAULT_SCANNER_CONFIG;
  }
  const obj = parsed as Record<string, unknown>;
  const raw = obj['treat_end_of_subject_parens_as_fix_marker'];
  const treat = typeof raw === 'boolean'
    ? raw
    : DEFAULT_SCANNER_CONFIG.treatEndOfSubjectParensAsFixMarker;
  return { treatEndOfSubjectParensAsFixMarker: treat };
}
