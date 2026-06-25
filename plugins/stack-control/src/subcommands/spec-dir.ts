// Shared `--spec <dir>` resolution for the spec-check / execute-check sibling
// verbs (gh-505 / TASK-449). Two verbs the `/stack-control:execute` gate
// sequence invokes back-to-back with the SAME argument MUST resolve it the same
// way — so both call this one helper rather than each calling `resolve(spec)`
// independently.
//
// Resolution order for a relative path (absolute paths pass through unchanged):
//   1. cwd-relative — the long-standing behavior; preserved so a call that
//      works today never breaks (purely additive).
//   2. installation-root-relative — a RESCUE: when the cwd-relative path does
//      not exist, try the path under the nearest enclosing installation root, so
//      `specs/NNN` resolves from any subdir of the installation instead of a
//      spurious "spec dir not found" FATAL.
// When neither exists, the cwd-relative path is returned so the caller's
// not-found diagnostic names the value the user actually passed.

import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { findInstallation } from '../config/installation.js';

export function resolveSpecDir(spec: string, startDir: string = process.cwd()): string {
  if (isAbsolute(spec)) return spec;

  const cwdRelative = resolve(startDir, spec);
  if (existsSync(cwdRelative)) return cwdRelative;

  const installation = findInstallation(startDir);
  if (installation !== null) {
    const rootRelative = join(installation.root, spec);
    if (existsSync(rootRelative)) return rootRelative;
  }

  return cwdRelative;
}
