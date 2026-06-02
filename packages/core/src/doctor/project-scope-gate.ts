/**
 * Project-scope gate for doctor rules.
 *
 * The doctor runner invokes `audit()` once per configured site. Rules
 * whose target lives at the PROJECT scope (under `<projectRoot>/.deskwork/`
 * regardless of site count — lane configs, sidecars, the journal) need
 * to emit findings once, not N times. The convention this module
 * captures: project-scoped rules early-return when the current site is
 * not the FIRST site in `ctx.config.sites` (Object.keys insertion order).
 * Single-site projects (the overwhelming majority) trip the guard on
 * their only site; multi-site projects trip it on the first site listed
 * in the config and skip the remainder.
 *
 * The alternative — a dedicated project-scope abstraction in the runner
 * — would let project-scoped rules opt out of the per-site loop
 * entirely. Until that abstraction lands, this helper is the agreed
 * shape; extracted here so multiple rules consuming the pattern share a
 * single named definition rather than duplicating the body.
 *
 * Sibling-relative imports per the project convention.
 */

import type { DoctorContext } from './types.ts';

/**
 * Returns `true` when the current site is the "first" site per the
 * config's `Object.keys` insertion order — the conventional signal
 * that a project-scoped rule should run during the current per-site
 * iteration. Empty `sites` collection returns `true` (degenerate
 * single-pass case so the rule still runs).
 */
export function isFirstSite(ctx: DoctorContext): boolean {
  const siteIds = Object.keys(ctx.config.sites);
  if (siteIds.length === 0) return true;
  return siteIds[0] === ctx.site;
}
