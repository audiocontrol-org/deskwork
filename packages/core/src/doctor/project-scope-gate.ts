/**
 * Project-scope gate for doctor rules.
 *
 * Phase 39c (sites→lanes retirement): the doctor runner no longer loops
 * per configured site — it runs a SINGLE project-scoped pass (see
 * `runner.ts` `PROJECT_SCOPE`). Project-scoped rules (lane configs,
 * sidecars, the journal) therefore already run exactly once. This gate
 * is now a constant `true`; it is retained (rather than ripped out of
 * every rule body) so the rules that consume it keep their shape and
 * the single-pass guarantee is documented in one place.
 *
 * Sibling-relative imports per the project convention.
 */

import type { DoctorContext } from './types.ts';

/**
 * Phase 39c: the runner makes a single project pass, so a project-scoped
 * rule always runs exactly once. The legacy "first site in
 * `Object.keys(config.sites)`" check is retired with the per-site loop;
 * this now unconditionally admits the single pass.
 */
export function isFirstSite(_ctx: DoctorContext): boolean {
  return true;
}
