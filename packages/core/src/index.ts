/**
 * @deskwork/core — barrel export of every public symbol used across
 * the cli and studio packages.
 *
 * Subpath imports (e.g. `@deskwork/core/calendar`) are also supported
 * for callers that want to be explicit about which module they pull
 * from. Both forms resolve to the same source files.
 */

export * from './types.ts';
export * from './config.ts';
export * from './paths.ts';
export * from './cli.ts';
export * from './calendar.ts';
export * from './calendar-mutations.ts';
export * from './frontmatter.ts';
export * from './journal.ts';
export * from './scaffold.ts';
export * from './body-state.ts';
export * from './ingest.ts';
export * as scrapbook from './scrapbook.ts';
export * as renameSlug from './rename-slug.ts';
export * as review from './review/index.ts';
export * as contentTree from './content-tree.ts';
export * from './content-index.ts';
export * as doctor from './doctor/index.ts';
export * from './overrides.ts';
