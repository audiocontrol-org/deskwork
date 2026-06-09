// T010 (008) — pure, unit-tested mappings between this feature's logical fields
// and backlog.md's surface. backlog.md has no native `type` or provenance field,
// so a captured item's type is carried as a `type:<value>` label alongside the
// project `agent-found` label. The severity→priority map (US4) lives here too.

/** The project label every captured/imported item carries. */
export const PROJECT_LABEL = 'agent-found';

/** Types a one-move `capture` accepts (FR-002). Import paths set provenance-class
 * types (`imported-issue`/`migrated-finding`) directly, bypassing this guard. */
export const CAPTURE_TYPES: readonly string[] = ['bug', 'gap'];

const CAPTURE_TYPE_SET = new Set(CAPTURE_TYPES);

/** True iff `t` is a capture type the verb accepts (used by the verb for a
 * clean exit-2 usage message before stamping). */
export function isCaptureType(t: string): boolean {
  return CAPTURE_TYPE_SET.has(t);
}

/** The `type:<value>` label that carries an item's type (backlog has no native
 * type field). Used by capture (bug/gap) and the import paths
 * (imported-issue/migrated-finding). */
export function typeLabel(type: string): string {
  return `type:${type}`;
}

/**
 * Map a parked audit-finding's severity to a backlog priority (US4). Only
 * MEDIUM/LOW (and lower — informational/unspecified) findings are ever parked;
 * a HIGH/blocking severity reaching this mapping is a fail-loud invariant
 * breach (HIGHs are NEVER slushed, FR-018) and throws (Principle V). Unknown /
 * informational / unspecified severities map to the lowest priority rather than
 * dropping the migrate.
 */
export function severityToPriority(severity: string | undefined): 'medium' | 'low' {
  const s = (severity ?? '').toLowerCase();
  if (s === 'high' || s === 'blocking') {
    throw new Error(
      `severity '${severity}' is HIGH/blocking and must never reach the priority mapping — HIGHs are never slushed (FR-018)`,
    );
  }
  return s === 'medium' ? 'medium' : 'low';
}

/**
 * Map a capture type to the backlog labels: the project label + the `type:<t>`
 * label. Fail-loud on an unknown type (Principle V) — never silently stamp a
 * bogus type.
 */
export function typeLabelStamp(type: string): string[] {
  if (!isCaptureType(type)) {
    throw new Error(`unknown capture type '${type}' (expected one of: ${CAPTURE_TYPES.join(', ')})`);
  }
  return [PROJECT_LABEL, typeLabel(type)];
}
